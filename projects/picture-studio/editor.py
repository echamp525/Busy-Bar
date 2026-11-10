"""Loopback-only photo editor using the viewer's exact screen conversion."""
import base64
import binascii
import io
import json
import os
import re
import secrets
import tempfile
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image
import sys
REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'projects/picture-viewer'))
sys.path.insert(0,str(REPO/'shared/photo-library'))
from viewer import xpm
ROOT=Path(__file__).resolve().parent
from photo_library import Library

def preview_png(source, size, gray=False):
    lines=xpm(source.copy(),size,gray).splitlines()
    width,height,count,_=map(int,lines[1].split())
    palette={line[0]:line.split()[-1] for line in lines[2:2+count]}
    result=Image.new('RGB',(width,height))
    result.putdata([tuple(bytes.fromhex(palette[ch][1:])) for row in lines[2+count:] for ch in row])
    stream=io.BytesIO();result.save(stream,'PNG')
    return 'data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode()

def read_image(body):
    if not isinstance(body,dict): raise ValueError('Invalid image request.')
    value=body.get('image','')
    if not isinstance(value,str) or not value.startswith('data:image/png;base64,'):
        raise ValueError('Choose a photo first.')
    raw=base64.b64decode(value.split(',',1)[1],validate=True)
    if len(raw)>6_000_000: raise ValueError('The prepared image is too large.')
    with Image.open(io.BytesIO(raw)) as im:
        if im.format!='PNG' or im.width*im.height>2_000_000:
            raise ValueError('Invalid prepared image.')
        return im.convert('RGB')

def save_image(folder, image, name):
    if not isinstance(name,str) or any(c in name for c in '/\\:'):
        raise ValueError('Use a filename without folders.')
    stem=re.sub(r'[^\w .-]','',name,flags=re.UNICODE).strip(' .')
    if stem.lower().endswith('.png'): stem=stem[:-4]
    stem=stem[:80].strip(' .') or 'photo'
    if stem.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*(f'COM{i}' for i in range(1,10)),*(f'LPT{i}' for i in range(1,10))}:
        stem='photo-'+stem
    folder.mkdir(parents=True,exist_ok=True)
    temp=None
    try:
        with tempfile.NamedTemporaryFile(dir=folder,suffix='.tmp',delete=False) as stream:
            temp=Path(stream.name);image.save(stream,'PNG')
        for n in range(1,10000):
            target=folder/(stem+('' if n==1 else f'-{n}')+'.png')
            try:
                os.link(temp,target) # Publish a complete file without replacing any existing file.
                return target.name
            except FileExistsError: continue
        raise ValueError('Choose a different filename.')
    finally:
        if temp: temp.unlink(missing_ok=True)

def make_server(port=8769, config=None):
    config=config or json.loads((ROOT/'config.json').read_text(encoding='utf-8-sig'))
    if config.get('portable') and not Path(config['folder']).is_dir():
        config=dict(config,folder=str(ROOT/'Images'),libraryFile=str(ROOT/'photo-library.json'))
        (ROOT/'Images').mkdir(exist_ok=True)
    library=Library(config,ROOT)
    picker_lock=threading.Lock()
    nonce=secrets.token_urlsafe(32)
    origins={f'http://127.0.0.1:{port}',f'http://localhost:{port}'}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*_): pass
        def send(self,code,data,kind='application/json'):
            if isinstance(data,dict): data=json.dumps(data).encode()
            self.send_response(code)
            self.send_header('Content-Type',kind)
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")
            self.end_headers();self.wfile.write(data)
        def valid_host(self): return 'http://'+self.headers.get('Host','') in origins
        def do_GET(self):
            if not self.valid_host(): return self.send(403,{'error':'Invalid host'})
            path=urlsplit(self.path).path
            if path in ('/','/index.html'):
                html=(ROOT/'editor/index.html').read_text(encoding='utf-8').replace('__EDITOR_NONCE__',nonce)
                return self.send(200,html.encode(),'text/html; charset=utf-8')
            assets={'/editor.js':'application/javascript','/editor.css':'text/css'}
            if path in assets: return self.send(200,(ROOT/'editor'/path[1:]).read_bytes(),assets[path])
            self.send(404,{'error':'Not found'})
        def do_POST(self):
            self.connection.settimeout(10)
            if not self.valid_host() or self.headers.get('Origin') not in origins or not secrets.compare_digest(self.headers.get('X-Editor-Key',''),nonce):
                return self.send(403,{'error':'Open the editor on this PC and try again.'})
            try:
                length=int(self.headers.get('Content-Length',0))
                if not 0<length<=9_000_000: raise ValueError('Image request is too large.')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict):raise ValueError('Invalid request.')
                if self.path=='/api/folders':return self.send(200,library.snapshot())
                if self.path=='/api/folders/select':
                    return self.send(200,library.choose(body.get('folderId'),body.get('role','saveFolder')))
                if self.path=='/api/folders/create':
                    return self.send(200,library.create(body.get('parentId'),body.get('name')))
                if self.path=='/api/folders/add':return self.send(200,library.add(body.get('path')))
                if self.path=='/api/folders/pick':
                    if not picker_lock.acquire(blocking=False):raise ValueError('A folder chooser is already open.')
                    try:
                        try:initial=library.destination()
                        except ValueError:initial=library.default
                        exe=str(Path(os.environ.get('WINDIR','C:/Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe')
                        result=subprocess.run([exe,'-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',
                            str(ROOT/'Choose-Folder.ps1'),'-InitialFolder',str(initial)],
                            capture_output=True,encoding='utf-8-sig',timeout=300,creationflags=subprocess.CREATE_NO_WINDOW)
                        if result.returncode:raise ValueError('Folder chooser unavailable. Enter a folder path below.')
                        chosen=json.loads(result.stdout)
                        return self.send(200,{'cancelled':True} if chosen.get('cancelled') else library.add(chosen['path']))
                    except subprocess.TimeoutExpired:raise ValueError('Folder chooser timed out. Try again.') from None
                    finally:picker_lock.release()
                image=read_image(body)
                if self.path=='/api/preview':
                    return self.send(200,{'front':preview_png(image,(72,16)),
                                          'back':preview_png(image,(160,68),True)})
                if self.path=='/api/save':
                    folder=library.destination(body.get('folderId'))
                    name=save_image(folder,image,body.get('name','photo'))
                    return self.send(200,{'ok':True,'name':name,'folder':str(folder)})
                return self.send(404,{'error':'Not found'})
            except (ValueError,OSError,binascii.Error,Image.DecompressionBombError) as exc:
                self.send(400,{'error':str(exc)})
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    server.daemon_threads=True
    return server

if __name__=='__main__':
    make_server().serve_forever()
