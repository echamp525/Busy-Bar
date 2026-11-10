param(
    [Parameter(Mandatory=$true)][ValidateSet('siriusxm','apple-music','picture-viewer')][string]$App,
    [string]$BarUrl='http://10.0.4.20'
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$packages=@{'siriusxm'='SiriusXM-Remote.tgz';'apple-music'='Apple-Music-Remote.tgz';'picture-viewer'='Picture-Viewer.tgz'}
$ids=@{'siriusxm'='local.siriusxm.remote';'apple-music'='local.applemusic.remote';'picture-viewer'='local.pictures.viewer'}
Add-Type -AssemblyName System.Net.Http
$handler=New-Object Net.Http.HttpClientHandler;$handler.UseProxy=$false
$client=New-Object Net.Http.HttpClient($handler);$client.Timeout=[TimeSpan]::FromSeconds(30)
try{
    $bytes=[IO.File]::ReadAllBytes((Join-Path $root ('dist/native/'+$packages[$App])))
    $body=New-Object Net.Http.ByteArrayContent(,$bytes)
    $stage=$client.PostAsync(($BarUrl+'/api/apps/stage'),$body).GetAwaiter().GetResult()
    $stage.EnsureSuccessStatusCode()|Out-Null
    $key=($stage.Content.ReadAsStringAsync().GetAwaiter().GetResult()|ConvertFrom-Json).install_key
    $body.Dispose();$stage.Dispose()
    foreach($url in @('/api/apps/quit',('/api/apps/install?install_key='+$key),('/api/apps/launch?app_id='+$ids[$App]))){
        $empty=New-Object Net.Http.StringContent('')
        $reply=$client.PostAsync(($BarUrl+$url),$empty).GetAwaiter().GetResult()
        try{$reply.EnsureSuccessStatusCode()|Out-Null}finally{$reply.Dispose();$empty.Dispose()}
    }
}finally{$client.Dispose()}
Write-Output ('Installed and launched '+$App)
