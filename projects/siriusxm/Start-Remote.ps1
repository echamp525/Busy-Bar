$ErrorActionPreference='Stop'
$root=$PSScriptRoot
& (Join-Path (Split-Path (Split-Path $root -Parent) -Parent) 'shared/companion-supervisor/Start-Bridges.ps1') -App 'siriusxm'
$config=Get-Content (Join-Path $root 'bridge.json') -Raw|ConvertFrom-Json
Add-Type -AssemblyName System.Net.Http
$handler=New-Object Net.Http.HttpClientHandler;$handler.UseProxy=$false
$client=New-Object Net.Http.HttpClient($handler);$client.Timeout=[TimeSpan]::FromSeconds(4)
$launched=$false
try{
 foreach($barUrl in @('http://10.0.4.20',('http://'+$config.barAddress))){
  try{
   $response=$client.PostAsync(($barUrl+'/api/apps/launch?app_id=local.siriusxm.remote'),(New-Object Net.Http.StringContent(''))).GetAwaiter().GetResult()
   try{if($response.IsSuccessStatusCode){$launched=$true;break}}finally{$response.Dispose()}
  }catch{}
 }
}finally{$client.Dispose()}
if($launched){Write-Host 'Music remote launched. The PC companion reconnects automatically.'}
else{Write-Host 'PC companion enabled. Select the music app from the Bar Apps menu.'}
