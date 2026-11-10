"""Local-folder slideshow companion for BUSY Bar. No Internet image fetching."""
from __future__ import annotations
import bisect
import hmac
import json
import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from PIL import Image, ImageOps
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'shared/photo-library'))
from photo_library import Library

ROOT = Path(__file__).resolve().parent
EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}
CODES = '0123456789ABCDEFGHIJKLMNOPQRSTUV'

def xpm(image: Image.Image, size: tuple[int, int], gray: bool = False) -> str:
    image = ImageOps.exif_transpose(image).convert('RGBA')
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', size, 'black')
    canvas.paste(image, ((size[0]-image.width)//2, (size[1]-image.height)//2), image)
    if gray:
        canvas = canvas.convert('L').point(lambda p: round(p/17)*17).convert('RGB')
    quantized = canvas.quantize(colors=16 if gray else 32, method=Image.Quantize.MEDIANCUT,
                                dither=Image.Dither.FLOYDSTEINBERG)
    palette = quantized.getpalette()
    pixels = list(quantized.get_flattened_data())
    used = sorted(set(pixels))
    lines = ['! XPM2', f'{size[0]} {size[1]} {len(used)} 1']
    for i in used:
        r, g, b = palette[i*3:i*3+3]
        lines.append(f'{CODES[i]} c #{r:02X}{g:02X}{b:02X}')
    lines.extend(''.join(CODES[p] for p in pixels[y*size[0]:(y+1)*size[0]])
                 for y in range(size[1]))
    return '\n'.join(lines)

def decode(path: Path) -> tuple[list[dict], float]:
    """Composite GIF frames and sample at <=4 fps; retain at most 30 seconds."""
    if path.stat().st_size > 30_000_000:
        raise ValueError('File exceeds 30 MB')
    frames, ends = [], []
    with Image.open(path) as source:
        if source.width * source.height > 40_000_000:
            raise ValueError('Image dimensions are too large')
        animated = bool(getattr(source, 'is_animated', False))
        elapsed, next_sample = 0.0, 0.0
        for i in range(min(getattr(source, 'n_frames', 1), 3000)):
            source.seek(i)
            duration = max(.02, source.info.get('duration', 100)/1000) if animated else 8.0
            end = min(30.0, elapsed + duration)
            if not frames or end > next_sample:
                frame = source.convert('RGBA')
                frames.append({'front': xpm(frame.copy(), (72, 16)),
                               'back': xpm(frame.copy(), (160, 68), True)})
                ends.append(end)
                next_sample = end + .25
            else:
                ends[-1] = end
            elapsed = end
            if elapsed >= 30 or not animated or len(frames) >= 120:
                break
    if not frames:
        raise ValueError('No image frames')
    for frame, end in zip(frames, ends):
        frame['end'] = end
    return frames, ends[-1]

class Viewer:
    def __init__(self, folder: Path, seconds: float = 8):
        self.folder, self.seconds = folder, max(2, seconds)
        self.lock = threading.RLock()
        self.files, self.current = [], None
        self.started = time.monotonic()
        self.paused_at = None
        self.cache_key, self.frames, self.duration = None, [], 0
        self.error, self.scanned = '', -100.0
        self.generation = 0
        self.scan()

    def scan(self):
        now = time.monotonic()
        previous = self.files
        self.files = sorted((p for p in self.folder.iterdir() if p.is_file() and
                             p.suffix.lower() in EXTENSIONS), key=lambda p: p.name.casefold())
        if previous != self.files:
            self.generation += 1
        if self.current not in self.files:
            self.current = self.files[0] if self.files else None
            self.reset()
        self.scanned = now

    def reset(self):
        self.started = time.monotonic()
        if self.paused_at is not None:
            self.paused_at = self.started
        self.generation += 1

    def set_folder(self, folder):
        with self.lock:
            folder=Path(folder)
            if folder==self.folder:return
            self.folder=folder;self.files=[];self.current=None
            self.cache_key=None;self.frames=[];self.duration=0
            self.generation+=1;self.scan()

    def command(self, action, delta=0):
        with self.lock:
            self.scan()
            if action == 'toggle':
                now = time.monotonic()
                if self.paused_at is None:
                    self.paused_at = now
                else:
                    self.started += now-self.paused_at
                    self.paused_at = None
                self.generation += 1
            elif action == 'browse' and self.files:
                index = self.files.index(self.current)
                self.current = self.files[(index+max(-50, min(50, int(delta)))) % len(self.files)]
                self.reset()
            elif action != 'rescan' and action != 'browse':
                raise ValueError('Unknown action')

    def state(self):
        with self.lock:
            if time.monotonic()-self.scanned >= 2:
                self.scan()
            if not self.current:
                return {'empty': True, 'revision': 'empty', 'message': 'Add images to the Images folder'}
            elapsed = (self.paused_at if self.paused_at is not None else time.monotonic())-self.started
            try:
                stat = self.current.stat()
                key = (str(self.current), stat.st_mtime_ns, stat.st_size)
                if key != self.cache_key:
                    self.frames, self.duration = decode(self.current)
                    self.cache_key = key
                    self.generation += 1
                if self.paused_at is None and elapsed >= max(self.seconds, self.duration) and len(self.files)>1:
                    self.current = self.files[(self.files.index(self.current)+1) % len(self.files)]
                    self.reset()
                    return self.state()
                ends = [f['end'] for f in self.frames]
                index = min(bisect.bisect_right(ends, elapsed % self.duration), len(ends)-1)
                frame = self.frames[index]
                return {'empty': False, 'front': frame['front'], 'back': frame['back'],
                        'name': self.current.name, 'position': self.files.index(self.current)+1,
                        'count': len(self.files), 'paused': self.paused_at is not None,
                        'revision': f'{self.generation}:{index}:{self.paused_at is not None}'}
            except (OSError, ValueError, Image.DecompressionBombError) as exc:
                # A bad file is shown as an error, then autoplay moves on.
                if self.paused_at is None and elapsed >= self.seconds and len(self.files)>1:
                    self.current = self.files[(self.files.index(self.current)+1) % len(self.files)]
                    self.reset()
                return {'empty': True, 'revision': 'error:'+str(self.current),
                        'message': 'Cannot read image - turn dial to skip'}

def make_server(config):
    folder = Path(config['folder']).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    viewer = Viewer(folder, config.get('seconds', 8))
    library=Library(config,ROOT)
    selected={'id':'','name':'Images','available':True}
    synced=0.0
    def sync_folder(force=False):
        nonlocal synced,selected
        if force or time.monotonic()-synced>=1:
            try:
                selected=library.selected()
                viewer.set_folder(Path(selected['path']))
            except (ValueError,OSError):
                selected={'id':'unavailable','name':'Folder unavailable','available':False}
            synced=time.monotonic()
        return selected
    def folders():
        value=library.snapshot()
        return {'folders':[{k:item[k] for k in ('id','name','available')} for item in value['folders']],
                'selected':value['viewFolder']}
    allowed = {config['barAddress'], config['listenAddress'], '127.0.0.1'}
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'
        def log_message(self, *_): pass
        def handle_request(self):
            self.connection.settimeout(3)
            parts = urlsplit(self.path)
            token = parse_qs(parts.query).get('token', [''])[0]
            code, result = 200, {}
            if self.client_address[0] not in allowed or not hmac.compare_digest(token, config['token']):
                code, result = 403, {'error': 'Forbidden'}
            elif self.command == 'GET' and parts.path == '/health':
                # Supervision must not decode photos or advance the slideshow.
                result = {'ok': True}
            elif self.command == 'GET' and parts.path == '/folders':
                try:result=folders()
                except (ValueError,OSError):code,result=400,{'error':'Folder settings unavailable'}
            elif self.command == 'GET' and parts.path == '/frame':
                active=sync_folder()
                result = viewer.state() if active['available'] else {'empty':True,'revision':'folder-unavailable','message':'Folder unavailable - hold dial to choose another'}
                result['folder']=active['name']
                result['revision']=active['id']+':'+result['revision']
            elif self.command == 'POST' and parts.path == '/command':
                try:
                    length = int(self.headers.get('Content-Length', 0))
                    if not 0 < length <= 256: raise ValueError('Invalid length')
                    body = json.loads(self.rfile.read(length))
                    if body['action']=='folder':
                        library.choose(body.get('folderId'),'viewFolder');sync_folder(True)
                    else:viewer.command(body['action'], body.get('delta', 0))
                    result = {'ok': True}
                except (ValueError, KeyError, TypeError, OSError):
                    code, result = 400, {'error': 'Invalid command'}
            else:
                code, result = 404, {'error': 'Not found'}
            data = json.dumps(result, separators=(',', ':')).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(data)
            self.close_connection = True
        def do_GET(self): self.handle_request()
        def do_POST(self): self.handle_request()
    server = ThreadingHTTPServer((config['listenAddress'], config['port']), Handler)
    server.timeout = .5
    return server

def serve(config):
    server=make_server(config)
    stop = ROOT/'stop.signal'
    stop.unlink(missing_ok=True)
    try:
        while not stop.exists():
            server.handle_request()
    finally:
        server.server_close()

if __name__ == '__main__':
    logging.basicConfig(filename=ROOT/'error.log', level=logging.ERROR)
    try:
        serve(json.loads((ROOT/'config.json').read_text(encoding='utf-8-sig')))
    except Exception:
        logging.exception('Picture Viewer stopped')
        raise
