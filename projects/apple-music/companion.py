"""LAN-only bridge between the BUSY Bar and the signed-in Apple Music tab."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac,json,secrets,threading,time
from urllib.parse import urlsplit,parse_qs
ROOT=Path(__file__).resolve().parent

class Bridge:
    def __init__(self):
        self.lock=threading.RLock();self.seen=0;self.metadata={};self.queue=[]
        self.library={'state':'idle','scope':'songs','page':0,'items':[],'hasMore':False}
        self.notice='';self.notice_until=0
    def expire(self):
        while self.queue and time.monotonic()-self.queue[0]['created']>60:
            self.queue.pop(0);self.notice='COMMAND TIMED OUT';self.notice_until=time.time()+4
            if self.library['state']=='loading':self.library['state']='error'
    def state(self):
        with self.lock:
            self.expire()
            return {'attached':time.monotonic()-self.seen<12,'track':self.metadata,
                    'library':dict(self.library),'pending':bool(self.queue),
                    'notice':self.notice if time.time()<self.notice_until else ''}
    def command(self,body):
        with self.lock:
            if time.monotonic()-self.seen>=12:return {'ok':False,'message':'CONNECT APPLE MUSIC'}
            self.expire()
            action=body.get('action')
            if action not in {'toggle','next','previous','list','play'}:raise ValueError('Invalid action')
            if len(self.queue)>=4:return {'ok':False,'message':'PLEASE WAIT'}
            command={'id':secrets.token_hex(12),'action':action,'created':time.monotonic()}
            if action=='list':
                scope=body.get('scope');page=body.get('page',0);parent=str(body.get('parent',''))[:500]
                if scope not in {'songs','playlists','playlist'} or not isinstance(page,int) or not 0<=page<=10000:
                    raise ValueError('Invalid library request')
                command.update(scope=scope,page=page,parent=parent)
                self.library={'state':'loading','scope':scope,'page':page,'parent':parent,'requestId':command['id'],'items':[],'hasMore':False}
            if action=='play':
                item=str(body.get('item',''))
                if not any(x['id']==item for x in self.library['items']):raise ValueError('Item is no longer in the displayed list')
                command['item']=item
            self.queue.append(command)
            return {'ok':True,'requestId':command['id'],'message':'LOADING' if action=='list' else 'OK'}
    def poll(self,body):
        with self.lock:
            if self.seen and time.monotonic()-self.seen>=12:
                self.queue.clear()
                if self.library['state']=='loading':self.library['state']='error'
            self.seen=time.monotonic();metadata=body.get('metadata',{})
            self.metadata={'title':str(metadata.get('title',''))[:400],'artist':str(metadata.get('artist',''))[:300],
                           'album':str(metadata.get('album',''))[:300],'playing':metadata.get('playing') is True,
                           'signedIn':metadata.get('signedIn') is True,'version':str(metadata.get('version',''))[:20]}
            ack=body.get('ack')
            if self.queue and isinstance(ack,dict) and ack.get('id')==self.queue[0]['id']:
                command=self.queue.pop(0)
                self.notice=str(ack.get('message','OK'))[:80];self.notice_until=time.time()+3
                if command['action']=='list':
                    result=ack.get('listing',{})
                    items=[]
                    for item in result.get('items',[])[:50]:
                        if not isinstance(item,dict):continue
                        items.append({'id':str(item.get('id',''))[:500],'title':str(item.get('title',''))[:200],
                                      'artist':str(item.get('artist',''))[:150]})
                    self.library.update(state='ok' if ack.get('ok') else 'error',items=items,
                                        hasMore=result.get('hasMore') is True,title=str(result.get('title',''))[:200])
            self.expire()
            command={k:v for k,v in self.queue[0].items() if k!='created'} if self.queue else None
            return {'ok':True,'command':command}

def serve():
    config=json.loads((ROOT/'config.json').read_text(encoding='utf-8-sig'))
    bridge=Bridge();allowed={config['listenAddress'],config['barAddress'],'127.0.0.1'}
    pc={config['listenAddress'],'127.0.0.1'}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*_):pass
        def respond(self,code,result):
            data=json.dumps(result,separators=(',',':')).encode()
            self.send_response(code);self.send_header('Content-Type','application/json')
            self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)))
            self.end_headers();self.wfile.write(data)
        def handle_request(self):
            self.connection.settimeout(4)
            path=urlsplit(self.path)
            token=parse_qs(path.query).get('token',[''])[0]
            remote=self.client_address[0]
            if remote not in allowed or not hmac.compare_digest(token,config['token']):return self.respond(403,{'error':'Forbidden'})
            try:
                if self.command=='GET' and path.path=='/state':return self.respond(200,bridge.state())
                if self.command=='POST' and path.path in {'/browser','/command'}:
                    if path.path=='/browser' and remote not in pc:return self.respond(403,{'error':'PC only'})
                    size=int(self.headers.get('Content-Length',0))
                    if not 0<size<=90000:raise ValueError('Invalid request size')
                    body=json.loads(self.rfile.read(size))
                    if not isinstance(body,dict):raise ValueError('Invalid body')
                    return self.respond(200,bridge.poll(body) if path.path=='/browser' else bridge.command(body))
                return self.respond(404,{'error':'Not found'})
            except (ValueError,TypeError,KeyError):return self.respond(400,{'error':'Invalid command'})
        def do_GET(self):self.handle_request()
        def do_POST(self):self.handle_request()
    server=ThreadingHTTPServer(('0.0.0.0',config['port']),Handler);server.daemon_threads=True;server.timeout=.5
    stop=ROOT/'stop.signal';stop.unlink(missing_ok=True)
    try:
        while not stop.exists():server.handle_request()
    finally:server.server_close()
if __name__=='__main__':serve()
