"""Keep the BUSY Bar music and picture companions available for this Windows user."""
from pathlib import Path
import concurrent.futures, datetime, json, msvcrt, os, subprocess, time
from urllib.request import Request, ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parents[1]/'projects'
HTTP = build_opener(ProxyHandler({}))
HIDDEN = subprocess.CREATE_NO_WINDOW
APPS = {'siriusxm': ('bridge.json', 'Companion.ps1'), 'apple-music': ('config.json', 'companion.py'),
        'picture-viewer': ('config.json', 'viewer.py')}

def health(config, name=''):
    try:
        host = config['listenAddress'] if name=='picture-viewer' else '127.0.0.1'
        path = 'health' if name=='picture-viewer' else 'state'
        url = f"http://{host}:{config['port']}/{path}?token={config['token']}"
        with HTTP.open(Request(url), timeout=2) as response:
            return response.status == 200
    except Exception:
        return False

def child_command(name, config):
    script = OUT / name / APPS[name][1]
    if script.suffix == '.py': return [config['python'], str(script)]
    return [str(Path(os.environ['WINDIR']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'),
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script)]

def write_status(states, children):
    temp = ROOT / 'status.tmp'
    try:
        temp.write_text(json.dumps({'updatedAt':datetime.datetime.now().astimezone().isoformat(),
                                   'pid':os.getpid(),'companions':states,
                                   'childPids':{name:p.pid for name,p in children.items() if p.poll() is None}}, indent=2))
        os.replace(temp, ROOT / 'status.json')
    except OSError:
        # A status viewer/virus scanner can briefly lock the file on Windows.
        # Diagnostics must never stop bridge supervision.
        pass

def main():
    # A file lock also works across different launcher processes/Windows sessions.
    with (ROOT / 'supervisor.lock').open('a+b') as lock:
        lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
        try: msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError: return
        children = {}; failures = {}; started = {}; configs = {}
        for name, (file, _) in APPS.items():
            configs[name] = json.loads((OUT / name / file).read_text(encoding='utf-8-sig'))
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(APPS)) as pool:
            while not (ROOT / 'stop.signal').exists():
                checks = {name:pool.submit(health,cfg,name) for name,cfg in configs.items()}
                states = {}
                for name, config in configs.items():
                    if (OUT / name / 'stop.signal').exists():
                        states[name] = 'stopped'; failures[name] = 0; continue
                    if checks[name].result():
                        states[name] = 'running'; failures[name] = 0; continue
                    failures[name] = failures.get(name,0) + 1
                    states[name] = 'recovering'
                    child = children.get(name)
                    # Tolerate transient slow media calls and startup; restart only our own hung child.
                    if time.monotonic() - started.get(name,0) < 12: continue
                    if child and child.poll() is None:
                        if failures[name] < 3: continue
                        child.terminate()
                        try: child.wait(timeout=3)
                        except subprocess.TimeoutExpired: child.kill(); child.wait(timeout=3)
                    try:
                        with (OUT / name / 'error.log').open('ab') as log:
                            children[name] = subprocess.Popen(child_command(name,config),cwd=OUT/name,
                                stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=log,creationflags=HIDDEN)
                    except OSError:
                        states[name] = 'start failed'
                    started[name] = time.monotonic(); failures[name] = 0
                write_status(states, children)
                time.sleep(3)

if __name__ == '__main__': main()
