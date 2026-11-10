param([string]$App='all')
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$output=Join-Path (Split-Path (Split-Path $root -Parent) -Parent) 'projects'
if($App -notin @('all','siriusxm','apple-music','picture-viewer')){throw 'Invalid Bar companion'}
foreach($name in @('siriusxm','apple-music','picture-viewer')){
    if($App -eq 'all' -or $App -eq $name){Remove-Item -LiteralPath (Join-Path $output "$name/stop.signal") -ErrorAction SilentlyContinue}
}
Remove-Item -LiteralPath (Join-Path $root 'stop.signal') -ErrorAction SilentlyContinue
$config=Get-Content (Join-Path $output 'apple-music/config.json') -Raw|ConvertFrom-Json
$pythonw=Join-Path (Split-Path $config.python -Parent) 'pythonw.exe'
if(-not(Test-Path -LiteralPath $pythonw)){$pythonw=$config.python}
Start-Process -FilePath $pythonw -ArgumentList @(('"'+(Join-Path $root 'supervisor.py')+'"')) -WorkingDirectory $root -WindowStyle Hidden
