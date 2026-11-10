from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from check_privacy import inspect

assert 'literal credential assignment' in inspect('sample.py',b'password = "'+b'not-a-real-credential'+b'"')
assert 'literal credential assignment' in inspect('sample.json',b'{"token": "'+b'not-a-real-credential'+b'"}')
assert 'provider token' in inspect('sample.txt',b'gh'+b'p_'+b'x'*36)
assert 'email address' in inspect('sample.txt',b'fixture'+b'@'+b'example.invalid')
assert 'user home path' in inspect('sample.txt',b'C:'+b'/Users/'+b'FixtureUser'+b'/Pictures')
assert 'account-number-like literal' in inspect('sample.txt',b'1234'+b'5678'+b'9012')
assert 'private runtime file' in inspect('projects/sample/config.json',b'{}')
assert 'unapproved image asset' in inspect('personal.jpg',b'fixture')
assert not inspect('sample.js',b"const TOKEN='__BRIDGE_TOKEN__'; fetch(BASE+'/state?token='+TOKEN);")
assert not inspect('config.example.json',b'{"token":"GENERATED_LOCALLY_BY_CONFIGURE"}')
assert not inspect('sample.txt',b'http://127.0.0.1:8769/')
print('Passed privacy guard checks for credential literals, tokens, paths, emails, numeric identifiers, runtime files, and approved placeholders.')
