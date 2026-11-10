from pathlib import Path
import shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
(ROOT/'.test-tmp').mkdir(exist_ok=True)
for path in sorted((ROOT/'tests').iterdir()):
    if path.suffix not in ('.py','.cjs'):continue
    executable=sys.executable if path.suffix=='.py' else shutil.which('node')
    if not executable:raise SystemExit('Node.js is required for JavaScript regression checks.')
    subprocess.run([executable,str(path)],cwd=ROOT,check=True)
print('All focused regression checks passed.')
