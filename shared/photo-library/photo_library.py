"""Shared folder settings for Picture Studio and Picture Viewer. Never opens image files."""
from pathlib import Path
from contextlib import contextmanager
import hashlib, json, os, tempfile, time
import msvcrt

def folder_id(path):
    return hashlib.sha256(os.path.normcase(str(Path(path).resolve())).encode()).hexdigest()[:24]

class Library:
    def __init__(self, config, root):
        self.root = Path(root)
        default = Path(config['folder'])
        self.default = (default if default.is_absolute() else self.root/default).resolve()
        file = Path(config.get('libraryFile', self.root/'photo-library.json'))
        self.file = (file if file.is_absolute() else self.root/file).resolve()

    @contextmanager
    def locked(self):
        self.file.parent.mkdir(parents=True, exist_ok=True)
        with self.file.with_suffix('.lock').open('a+b') as lock:
            if lock.tell() == 0: lock.write(b'0'); lock.flush()
            end = time.monotonic()+5
            while True:
                try:
                    lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1); break
                except OSError:
                    if time.monotonic() >= end: raise ValueError('Folder settings are busy. Try again.')
                    time.sleep(.025)
            try: yield
            finally:
                lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)

    def read(self):
        if self.file.exists():
            data=json.loads(self.file.read_text(encoding='utf-8-sig'))
            if data.get('version')!=1 or not isinstance(data.get('roots'),list):
                raise ValueError('Folder settings could not be read.')
            return data
        ident=folder_id(self.default)
        return {'version':1,'roots':[{'path':str(self.default),'name':'Images'}],
                'viewFolder':ident,'saveFolder':ident}

    def write(self, data):
        temp=None
        try:
            with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=self.file.parent,delete=False) as f:
                temp=Path(f.name);json.dump(data,f,indent=2);f.flush();os.fsync(f.fileno())
            os.replace(temp,self.file)
        finally:
            if temp:temp.unlink(missing_ok=True)

    def folders(self, data):
        result={}
        # Each registered location and its immediate subdirectories are discoverable.
        # Studio-created nested folders are registered too, so they remain discoverable.
        for item in data['roots']:
            path=Path(item['path']).resolve();name=str(item.get('name') or path.name or path)
            ident=folder_id(path)
            result.setdefault(ident,{'id':ident,'name':name,'path':str(path),'available':path.is_dir()})
            if not path.is_dir():continue
            try:
                children=sorted(path.iterdir(),key=lambda p:p.name.casefold())
                for child in children:
                    if child.name.startswith('.') or child.is_symlink() or child.is_junction() or not child.is_dir():continue
                    result.setdefault(folder_id(child),{'id':folder_id(child),'name':name+' / '+child.name,
                                                        'path':str(child.resolve()),'available':True})
            except OSError:continue
        return list(result.values())

    def snapshot(self):
        with self.locked():
            data=self.read()
            if not self.file.exists():self.write(data)
            return {'folders':self.folders(data),'viewFolder':data['viewFolder'],'saveFolder':data['saveFolder']}

    def resolve(self, ident, data=None):
        data=data or self.read()
        match=next((item for item in self.folders(data) if item['id']==ident),None)
        if not match or not match['available']:raise ValueError('This folder is unavailable. Choose another folder.')
        return match

    def destination(self, ident=None):
        with self.locked():
            data=self.read();return Path(self.resolve(ident or data['saveFolder'],data)['path'])

    def selected(self):
        with self.locked():
            data=self.read();return self.resolve(data['viewFolder'],data)

    def register(self, data, path, name=None):
        path=Path(path).resolve()
        if not path.is_dir():raise ValueError('Choose an existing directory.')
        ident=folder_id(path)
        if not any(folder_id(item['path'])==ident for item in data['roots']):
            data['roots'].append({'path':str(path),'name':name or path.name or str(path)})
        return ident

    def choose(self, ident, role):
        if role not in ('viewFolder','saveFolder'):raise ValueError('Invalid folder setting.')
        with self.locked():
            data=self.read();item=self.resolve(ident,data)
            self.register(data,item['path'],item['name']);data[role]=ident;self.write(data)
        return self.snapshot()

    def add(self, path):
        if not isinstance(path,str) or not Path(path).is_absolute():raise ValueError('Enter the full folder path.')
        with self.locked():
            data=self.read();ident=self.register(data,Path(path));data['saveFolder']=ident;self.write(data)
        return self.snapshot()

    def create(self, parent_id, name):
        if not isinstance(name,str) or not name or name!=name.strip(' .') or len(name)>80 or any(c in name for c in '\\/:*?"<>|') or any(ord(c)<32 for c in name):
            raise ValueError('Enter a folder name without slashes or special characters.')
        reserved={'CON','PRN','AUX','NUL',*(f'COM{i}' for i in range(1,10)),*(f'LPT{i}' for i in range(1,10))}
        if name in ('.','..') or name.split('.')[0].upper() in reserved:raise ValueError('Choose a different folder name.')
        with self.locked():
            data=self.read();parent=self.resolve(parent_id,data);path=Path(parent['path'])/name
            try:path.mkdir()
            except FileExistsError:raise ValueError('That folder already exists. Select it from the folder list.') from None
            ident=self.register(data,path,parent['name']+' / '+name)
            data['saveFolder']=ident;self.write(data)
        return self.snapshot()
