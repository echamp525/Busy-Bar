"""Build paired BUSY Bar packages and generate local Chrome extension files."""
from pathlib import Path
import json,shutil,tarfile,tempfile
ROOT=Path(__file__).resolve().parents[1]
APPS={'siriusxm':('bridge.json','local.siriusxm.remote','SiriusXM-Remote.tgz'),
      'apple-music':('config.json','local.applemusic.remote','Apple-Music-Remote.tgz'),
      'picture-viewer':('config.json','local.pictures.viewer','Picture-Viewer.tgz')}
def build():
    work=ROOT/'build';dist=ROOT/'dist/native';work.mkdir(exist_ok=True);dist.mkdir(parents=True,exist_ok=True)
    for name,(filename,app_id,package) in APPS.items():
        source=ROOT/'projects'/name
        config=json.loads((source/filename).read_text(encoding='utf-8-sig'))
        url=f"http://{config['listenAddress']}:{config['port']}"
        script=(source/'app/scripts/main.template.js').read_text(encoding='utf-8').replace('__BRIDGE_URL__',url).replace('__BRIDGE_TOKEN__',config['token'])
        with tempfile.TemporaryDirectory(prefix=app_id+'-',dir=work) as tmp:
            app=Path(tmp)/app_id;shutil.copytree(source/'app/appmeta',app/'appmeta');(app/'scripts').mkdir()
            (app/'scripts/main.js').write_text(script,encoding='utf-8')
            with tarfile.open(dist/package,'w:gz') as archive:archive.add(app,arcname=app_id)
        extension=source/'chrome-extension'
        if extension.exists():
            background=(extension/'background.template.js').read_text().replace('__BRIDGE_TOKEN__',config['token'])
            (extension/'background.js').write_text(background,encoding='utf-8')
            shutil.copy2(ROOT/'shared/extension-bridge/connection.js',extension/'connection.js')
        print(f'Built {name}: dist/native/{package}')
if __name__=='__main__':build()
