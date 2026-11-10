param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$url='http://127.0.0.1:8769/'
$ready=$false
try{Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 | Out-Null;$ready=$true}catch{}
if(-not $ready){
    $config=Get-Content (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
    Start-Process -FilePath $config.python -ArgumentList @('"'+(Join-Path $PSScriptRoot 'editor.py')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    for($i=0;$i -lt 20;$i++){Start-Sleep -Milliseconds 250;try{Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1 | Out-Null;$ready=$true;break}catch{}}
    if(-not $ready){throw 'The local photo editor did not start.'}
}
if(-not $NoBrowser){Start-Process $url}
