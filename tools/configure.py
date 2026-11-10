"""Create private local pairing/configuration files for this checkout."""
from pathlib import Path
import argparse,ipaddress,json,secrets,sys
ROOT=Path(__file__).resolve().parents[1]
SPECS={'siriusxm':('bridge.json',8766),'apple-music':('config.json',8770),
       'picture-viewer':('config.json',8768),'picture-studio':('config.json',8769)}
def read(path):return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else {}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pc-address',help='This Windows PC\'s LAN IPv4 address')
    parser.add_argument('--bar-address',help='The BUSY Bar\'s LAN IPv4 address')
    parser.add_argument('--images',type=Path,help='Default picture directory; existing pictures are not modified')
    args=parser.parse_args()
    old=read(ROOT/'projects/siriusxm/bridge.json')
    pc=args.pc_address or old.get('listenAddress');bar=args.bar_address or old.get('barAddress')
    for label,value in [('pc-address',pc),('bar-address',bar)]:
        try:ipaddress.IPv4Address(value)
        except (ValueError,TypeError):parser.error(f'Provide a valid --{label}.')
    previous=read(ROOT/'projects/picture-viewer/config.json')
    pictures=(args.images or Path(previous.get('folder',ROOT/'data/Images'))).resolve()
    pictures.mkdir(parents=True,exist_ok=True)
    registry=ROOT/'data/photo-library.json';registry.parent.mkdir(exist_ok=True)
    for name,(filename,port) in SPECS.items():
        folder=ROOT/'projects'/name;path=folder/filename;config=read(path)
        config.update(listenAddress=pc,barAddress=bar,port=port,python=sys.executable)
        config.setdefault('token',secrets.token_hex(32))
        if name.startswith('picture-'):
            config.update(folder=str(pictures),libraryFile=str(registry))
        if name=='picture-viewer':config.setdefault('seconds',8)
        path.write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8')
    from build import build
    build()
    print('Local configuration generated. Pairing tokens and image folders are gitignored.')
if __name__=='__main__':main()
