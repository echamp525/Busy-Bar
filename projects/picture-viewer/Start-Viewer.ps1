$ErrorActionPreference='Stop'
& (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'shared/companion-supervisor/Start-Bridges.ps1') -App picture-viewer
$config=Get-Content (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
$url='http://'+$config.listenAddress+':'+$config.port+'/health?token='+$config.token
$alive=$false
try{Invoke-RestMethod -Uri $url -TimeoutSec 2 | Out-Null;$alive=$true}catch{}
if(-not $alive){
    $ready=$false
    for($i=0;$i -lt 20;$i++){Start-Sleep -Milliseconds 250;try{Invoke-RestMethod -Uri $url -TimeoutSec 1 | Out-Null;$ready=$true;break}catch{}}
    if(-not $ready){throw 'Picture Viewer companion did not start. See error.log.'}
}
Invoke-RestMethod -Method Post -Uri 'http://10.0.4.20/api/apps/launch?app_id=local.pictures.viewer' -TimeoutSec 5 | Out-Null
Write-Host 'Picture Viewer started. Add pictures to the Images folder.'
