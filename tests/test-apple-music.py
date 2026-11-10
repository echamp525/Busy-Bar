import sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'projects/apple-music'))
from companion import Bridge
b=Bridge();assert not b.state()['attached']
assert not b.command({'action':'next'})['ok']
b.poll({'metadata':{'title':'Test song','artist':'Artist','playing':True,'signedIn':True}})
assert b.state()['track']['title']=='Test song'
result=b.command({'action':'list','scope':'songs','page':0});request=result['requestId']
assert b.state()['library']['requestId']==request
command=b.poll({'metadata':{}})['command'];assert command['id']==request
b.poll({'metadata':{},'ack':{'id':request,'ok':True,'listing':{'items':[{'id':'track:0','title':'Song','artist':'Artist'}],'hasMore':True}}})
assert b.state()['library']['state']=='ok' and b.state()['library']['hasMore']
b.poll({'metadata':{},'ack':{'id':request,'ok':False}})
assert b.state()['library']['state']=='ok','Duplicate acknowledgement must not replace success'
assert b.command({'action':'play','item':'track:0'})['ok']
try:b.command({'action':'play','item':'not-in-list'});raise AssertionError('Invalid item accepted')
except ValueError:pass
b.queue[0]['created']-=100;b.expire();assert not b.queue
b.seen-=20;assert not b.state()['attached']
b.poll({'metadata':{}});b.command({'action':'toggle'});b.seen-=20
assert b.poll({'metadata':{}})['command'] is None,'Do not replay stale playback after reconnect'
print('Passed pairing state, library requests, pagination metadata, valid selection, duplicate protection, expiry and offline gating.')
