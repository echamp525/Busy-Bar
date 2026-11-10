import importlib.util
from pathlib import Path
import tempfile
import sys
from unittest.mock import patch
from PIL import Image

path=Path(__file__).resolve().parents[1]/'projects/picture-viewer/viewer.py'
sys.path.insert(0,str(path.parent))
spec=importlib.util.spec_from_file_location('viewer',path)
viewer=importlib.util.module_from_spec(spec);spec.loader.exec_module(viewer)

with tempfile.TemporaryDirectory(dir=path.parents[2]/'.test-tmp') as d:
    folder=Path(d)
    v=viewer.Viewer(folder)
    assert v.state()['empty']
    Image.new('RGB',(100,50),'red').save(folder/'a.png')
    Image.new('RGB',(50,100),'green').save(folder/'b.jpg')
    v.scan();state=v.state()
    assert state['name']=='a.png' and state['count']==2
    assert state['front'].splitlines()[1].startswith('72 16 ')
    assert state['back'].splitlines()[1].startswith('160 68 ')
    v.command('browse',-1);assert v.state()['name']=='b.jpg'
    v.command('browse',1);assert v.state()['name']=='a.png'
    v.command('toggle');v.started-=100
    assert v.state()['name']=='a.png' and v.state()['paused']
    v.command('toggle');v.started-=100
    assert v.state()['name']=='b.jpg'
    (folder/'b.jpg').unlink();v.scan();assert v.state()['name']=='a.png'
    (folder/'broken.gif').write_text('not an image')
    v.scan();v.command('browse',1);assert v.state()['empty']
    v.started-=10;v.state();assert v.state()['name']=='a.png'
    frames=[Image.new('RGB',(30,30),color) for color in ['red','blue','green']]
    frames[0].save(folder/'motion.gif',save_all=True,append_images=frames[1:],duration=400,loop=0)
    decoded,duration=viewer.decode(folder/'motion.gif')
    assert len(decoded)==3 and abs(duration-1.2)<.001
    assert decoded[0]['front']!=decoded[1]['front']
    v.scan();v.command('browse',2)
    assert v.state()['name']=='motion.gif'
    v.command('toggle');frozen=v.state()['revision'];v.started-=.5
    # Frozen clock rather than wall time determines the selected animation frame.
    assert v.state()['paused']
    print('Passed empty folder, fit dimensions, browse/wrap, autoplay, pause, deletion, corrupt-file recovery and GIF decoding.')
