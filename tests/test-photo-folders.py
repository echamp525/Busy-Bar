from pathlib import Path
import base64,io,json,re,sys,tempfile,threading,urllib.request,urllib.error
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'projects/picture-viewer'))
sys.path.insert(0,str(ROOT/'shared/photo-library'))
from photo_library import Library
sys.path.insert(0,str(ROOT/'projects/picture-studio'))
import editor,viewer
HTTP=urllib.request.build_opener(urllib.request.ProxyHandler({}))

with tempfile.TemporaryDirectory(dir=ROOT/'.test-tmp') as temp:
    root=Path(temp);images=root/'Images';images.mkdir();external=root/'Other';external.mkdir()
    config={'folder':str(images),'libraryFile':str(root/'library.json'),'token':'test-only',
            'listenAddress':'127.0.0.1','barAddress':'192.0.2.2','port':0}
    lib=Library(config,root);initial=lib.snapshot();original=initial['viewFolder']
    created=lib.create(original,'Trips');trip=created['saveFolder']
    assert created['viewFolder']==original and trip!=original,'Saving and viewing must be independent'
    images.joinpath('Discovered').mkdir()
    assert any(f['name']=='Images / Discovered' for f in lib.snapshot()['folders'])
    lib2=Library(config,root)
    assert any(f['id']==trip for f in lib2.snapshot()['folders']),'Studio and Viewer share settings'
    for name in ['../outside','..','bad/name','CON','trailing.',' space']:
        try:lib.create(original,name);raise AssertionError('Invalid folder accepted')
        except ValueError:pass
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda n:Library(config,root).create(original,n),['One','Two']))
    names={f['name'] for f in lib.snapshot()['folders']}
    assert {'Images / One','Images / Two'}<=names,'Concurrent updates must not be lost'
    lib.choose(original,'saveFolder')
    server=editor.make_server(18769,config=config);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    bar=viewer.make_server(config);bar_thread=threading.Thread(target=bar.serve_forever,daemon=True);bar_thread.start()
    url='http://127.0.0.1:18769';bar_url=f'http://127.0.0.1:{bar.server_port}'
    html=HTTP.open(url).read().decode();key=re.search('name="editor-key" content="([^"]+)"',html)[1]
    def post(path,body,origin=url):
        req=urllib.request.Request(url+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Origin':origin,'X-Editor-Key':key})
        with HTTP.open(req) as r:return json.load(r)
    def bar_request(path,body=None,token='test-only'):
        req=urllib.request.Request(bar_url+path+'?token='+token,data=json.dumps(body).encode() if body else None,headers={'Content-Type':'application/json'})
        with HTTP.open(req) as r:return json.load(r)
    try:
        snap=post('/api/folders',{});assert len(snap['folders'])>=5
        snap=post('/api/folders/add',{'path':str(external)});other=snap['saveFolder']
        assert snap['viewFolder']==original
        blob=io.BytesIO();Image.new('RGB',(72,16),'#224466').save(blob,'PNG')
        image='data:image/png;base64,'+base64.b64encode(blob.getvalue()).decode()
        saved=post('/api/save',{'image':image,'name':'sample','folderId':trip})
        assert Path(saved['folder'])==images/'Trips' and (images/'Trips/sample.png').exists()
        assert not (external/'sample.png').exists() and not (images/'sample.png').exists()
        saved2=post('/api/save',{'image':image,'name':'sample','folderId':trip});assert saved2['name']=='sample-2.png'
        catalog=bar_request('/folders');assert 'path' not in catalog['folders'][0]
        assert any(f['id']==other for f in catalog['folders'])
        bar_request('/command',{'action':'folder','folderId':trip})
        frame=bar_request('/frame');assert frame['empty'] is False and frame['count']==2 and frame['folder']=='Images / Trips'
        assert lib.snapshot()['viewFolder']==trip
        assert bar_request('/health')=={'ok':True}
        for action,body in [('/api/folders/create',{'parentId':original,'name':'Nope'}),('/api/folders/add',{'path':str(external)})]:
            try:post(action,body,origin='https://example.org');raise AssertionError('Cross-origin mutation accepted')
            except urllib.error.HTTPError as e:assert e.code==403
        try:bar_request('/folders',token='wrong');raise AssertionError('Unauthenticated folders accepted')
        except urllib.error.HTTPError as e:assert e.code==403
        print('Passed shared folder creation/discovery, concurrent updates, independent selections, per-image saves, collision protection, Bar switching, and API authorization.')
    finally:
        server.shutdown();server.server_close();bar.shutdown();bar.server_close()
