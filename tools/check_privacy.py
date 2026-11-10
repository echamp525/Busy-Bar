"""Fail if publishable files contain common secrets or private runtime data."""
from pathlib import Path
import re,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
RULES={
    'user home path':re.compile(r'(?:[A-Z]:[/\\]+Users[/\\]+[^/\\\s"\']+|/(?:home|Users)/[^/\s"\']+)',re.I),
    'email address':re.compile(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b',re.I),
    'private key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'provider token':re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,})\b'),
    'SSN-like number':re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
    'account-number-like literal':re.compile(r'(?<![\w])\d{8,20}(?![\w])'),
}
ASSIGNMENT=re.compile(r'''(?<![?&])\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|token)\b["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']''',re.I)
PRIVATE_NAMES={'config.json','bridge.json','photo-library.json','status.json','stop.signal','.env'}
ASSETS={f'projects/{name}/app/appmeta/icon_{side}.png' for name in ('siriusxm','apple-music','picture-viewer') for side in ('front_8x8','back_11x11')}
ASSETS.add('projects/picture-studio/Picture-Studio.ico')
def inspect(name,data):
    path=Path(name);issues=[]
    if path.name in PRIVATE_NAMES or path.suffix.lower() in {'.log','.lock','.tgz','.zip','.pyc'}:
        issues.append('private runtime file')
    if set(path.parts)&{'Images','desktop-profile','desktop-chrome-profile','runtime','__pycache__'}:
        issues.append('private data directory')
    if path.suffix.lower() in {'.png','.ico','.jpg','.jpeg','.gif','.webp','.bmp'}:
        if name not in ASSETS:issues.append('unapproved image asset')
        return issues
    try:text=data.decode('utf-8-sig')
    except UnicodeDecodeError:return issues+['unreviewed binary file']
    for label,pattern in RULES.items():
        if pattern.search(text):issues.append(label)
    for match in ASSIGNMENT.finditer(text):
        value=match[1]
        if value.startswith(('__','GENERATED_')) or value in {'test-only','fixture-value'}:continue
        issues.append('literal credential assignment');break
    return issues
def main():
    names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines()
    errors=[]
    for name in sorted(set(names)):
        if not (ROOT/name).is_file():continue
        issues=inspect(name,(ROOT/name).read_bytes())
        if issues:errors.append(name+': '+', '.join(issues))
    if errors:
        print('Privacy check failed (values are intentionally not printed):\n'+'\n'.join(errors),file=sys.stderr)
        return 1
    print(f'Privacy check passed for {len(set(names))} publishable files.')
    return 0
if __name__=='__main__':raise SystemExit(main())
