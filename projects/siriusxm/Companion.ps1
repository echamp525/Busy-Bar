param([switch]$ProbeOnly)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$null=[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'} | Select-Object -First 1)
function Await($operation,$type){
    $task=$asTask.MakeGenericMethod($type).Invoke($null,@($operation))
    if(-not $task.Wait(4000)){throw 'Windows media operation timed out'}
    return $task.Result
}
$manager=$null
try{$manager=Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])}catch{}
$browserLastSeen=[DateTime]::MinValue
$browserInfo=$null
$browserQueue=New-Object 'Collections.Generic.List[object]'
$commandNotice='';$noticeUntil=0L
function Find-Sirius {
    # Fresh browser metadata is sufficient; avoid fragile/costly Windows media enumeration.
    if($browserInfo -and $browserInfo.title -and ([DateTime]::UtcNow-$browserLastSeen).TotalSeconds -lt 10){return $null}
    if(-not $manager){return $null}
    foreach($session in $manager.GetSessions()){
        $properties=Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $exactTrack=$browserInfo -and $browserInfo.title -and $properties.Title -eq $browserInfo.title -and $properties.Artist -eq $browserInfo.artist
        $exactChannel=$browserInfo -and $browserInfo.channel -and
            ([string]$properties.Title).IndexOf([string]$browserInfo.channel,[StringComparison]::OrdinalIgnoreCase) -ge 0
        $browserMatch=$browserInfo -and ([DateTime]::UtcNow-$browserLastSeen).TotalSeconds -lt 10 -and
            $session.SourceAppUserModelId -eq 'Chrome' -and ($exactTrack -or $exactChannel)
        if($browserMatch -or ($properties.Title+' '+$properties.Artist+' '+$properties.AlbumTitle) -match '(?i)SiriusXM'){
            return @{session=$session;properties=$properties;info=$session.GetPlaybackInfo()}
        }
    }
    return $null
}
function Get-State($media) {
    if($browserInfo -and $browserInfo.title -and ([DateTime]::UtcNow-$browserLastSeen).TotalSeconds -lt 10){
        $playback='Paused';if($browserInfo.playing){$playback='Playing'}
        return @{available=$true;title=$browserInfo.title;artist=$browserInfo.artist;status=$playback;canToggle=[bool]$browserInfo.canToggle;canNext=$true;canPrevious=$false}
    }
    if(-not $media){return @{available=$false;message='Start SiriusXM in Chrome';title='';artist='';status='not connected'}}
    return @{available=$true;title=$media.properties.Title;artist=$media.properties.Artist;
        status=[string]$media.info.PlaybackStatus;canToggle=$media.info.Controls.IsPlayPauseToggleEnabled;
        canNext=$media.info.Controls.IsNextEnabled;canPrevious=$media.info.Controls.IsPreviousEnabled}
}
if($ProbeOnly){Get-State (Find-Sirius) | ConvertTo-Json;exit}
$config=Get-Content (Join-Path $PSScriptRoot 'bridge.json') -Raw | ConvertFrom-Json
$mutex=New-Object Threading.Mutex($false,'Local\BusyBarSiriusXM')
if(-not $mutex.WaitOne(0)){exit}
$stop=Join-Path $PSScriptRoot 'stop.signal'
$statusPath=Join-Path $PSScriptRoot 'status.json'
$server=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Any,[int]$config.port)
$utf8=[Text.UTF8Encoding]::new($false)
$media=$null; $lastPoll=[DateTime]::MinValue
try {
    Remove-Item -LiteralPath $stop -ErrorAction SilentlyContinue
    $server.Start()
    while(-not (Test-Path -LiteralPath $stop)){
        if(([DateTime]::UtcNow-$lastPoll).TotalSeconds -ge 2){
            try{
                $media=Find-Sirius; $state=Get-State $media
                @{updatedAt=[DateTimeOffset]::Now.ToString('o');state='running';media=$state} | ConvertTo-Json -Depth 5 | Set-Content $statusPath -Encoding UTF8
            }catch{$media=$null;$state=@{available=$false;message='Windows media unavailable'};@{state='error';error=$_.Exception.Message}|ConvertTo-Json|Set-Content $statusPath -Encoding UTF8}
            $lastPoll=[DateTime]::UtcNow
        }
        if(-not $server.Pending()){Start-Sleep -Milliseconds 50;continue}
        $client=$server.AcceptTcpClient()
        try {
            $client.ReceiveTimeout=1500;$client.SendTimeout=1500
            $remote=$client.Client.RemoteEndPoint.Address.ToString()
            if($remote -notin @($config.barAddress,$config.listenAddress,'127.0.0.1')){continue}
            $stream=$client.GetStream();$buffer=New-Object byte[] 8192;$count=0;$headerEnd=-1
            while($count -lt $buffer.Length){
                $read=$stream.Read($buffer,$count,$buffer.Length-$count)
                if($read -le 0){break};$count+=$read
                $raw=[Text.Encoding]::ASCII.GetString($buffer,0,$count);$headerEnd=$raw.IndexOf("`r`n`r`n")
                if($headerEnd -ge 0){break}
            }
            if($headerEnd -lt 0){continue}
            $headers=$raw.Substring(0,$headerEnd);$requestLine=($headers -split "`r`n")[0]
            if($requestLine -notmatch '^(GET|POST) (/[^ ]*) HTTP/1\.[01]$'){continue}
            $method=$Matches[1];$target=$Matches[2]
            $expected='?token='+$config.token
            $code=200;$result=@{ok=$false}
            if($target -notin @(('/state'+$expected),('/command'+$expected),('/browser'+$expected))){$code=403;$result=@{error='Forbidden'}}
            elseif($target.StartsWith('/state') -and $method -eq 'GET'){
                $result=@{}+(Get-State $media)
                $result.browserAttached=([DateTime]::UtcNow-$browserLastSeen).TotalSeconds -lt 10
                $result.channel=$browserInfo.channel
                $result.browseModesSupported=$browserInfo.browseModes -eq $true
                $result.browserBrowseMode=$browserInfo.browseMode
                $result.browserExtensionVersion=$browserInfo.browseVersion
                $result.tuning=@($browserQueue | Where-Object {$_.action -eq 'channel'}).Count -gt 0
                $result.notice=$commandNotice;$result.noticeUntil=$noticeUntil
            }
            elseif(($target.StartsWith('/command') -or $target.StartsWith('/browser')) -and $method -eq 'POST'){
                $length=0
                if($headers -match '(?im)^Content-Length:\s*(\d+)\s*$'){$length=[int]$Matches[1]}
                if($length -gt 4096){$code=413;$result=@{error='Too large'}}
                else{
                    $bodyStart=$headerEnd+4
                    while($count-$bodyStart -lt $length){$read=$stream.Read($buffer,$count,$buffer.Length-$count);if($read -le 0){throw 'Incomplete body'};$count+=$read}
                    $body=$utf8.GetString($buffer,$bodyStart,$length)|ConvertFrom-Json
                    if($target.StartsWith('/browser')){
                        # Browser commands can only be collected/acknowledged by this PC.
                        if($remote -notin @($config.listenAddress,'127.0.0.1')){$code=403;$result=@{error='Forbidden'}}
                        else{
                            # Never replay old dial/playback commands after a disconnected player returns.
                            if(([DateTime]::UtcNow-$browserLastSeen).TotalSeconds -ge 10){$browserQueue.Clear()}
                            $browserLastSeen=[DateTime]::UtcNow;$browserInfo=$body.metadata
                            if($body.ack -and $browserQueue.Count -gt 0 -and $body.ack.id -eq $browserQueue[0].id){
                                $commandNotice=([string]$body.ack.message -replace '[^A-Z0-9 /_-]','').Substring(0,[Math]::Min(32,([string]$body.ack.message -replace '[^A-Z0-9 /_-]','').Length))
                                $noticeUntil=[DateTimeOffset]::Now.ToUnixTimeMilliseconds()+2200
                                $browserQueue.RemoveAt(0)
                            }
                            while($browserQueue.Count -gt 0 -and ([DateTime]::UtcNow-$browserQueue[0].created).TotalSeconds -gt 45){$browserQueue.RemoveAt(0)}
                            $next=$null
                            if($browserQueue.Count -gt 0){$q=$browserQueue[0];$next=@{id=$q.id;action=$q.action;delta=$q.delta;browseMode=$q.browseMode}}
                            $result=@{ok=$true;command=$next};$state=Get-State $media
                        }
                    }elseif($body.action -in @('channel','skip','toggle') -and ([DateTime]::UtcNow-$browserLastSeen).TotalSeconds -lt 10){
                        $delta=0
                        if($body.action -eq 'channel'){$delta=[int]$body.delta}
                        $browseMode='all';if($body.browseMode -eq 'library'){$browseMode='library'}
                        if($body.action -eq 'channel' -and $browserInfo.browseModes -ne $true){$result=@{ok=$false;message='RELOAD EXTENSION'}}
                        elseif($body.browseMode -and $body.browseMode -notin @('all','library')){$code=400;$result=@{ok=$false;message='INVALID MODE'}}
                        elseif($browserQueue.Count -ge 5){$result=@{ok=$false;message='DIAL BUSY'}}
                        elseif($body.action -eq 'channel' -and ($delta -eq 0 -or [Math]::Abs($delta) -gt 50)){$code=400;$result=@{ok=$false;message='INVALID DIAL'}}
                        else{
                            $browserQueue.Add(@{id=[guid]::NewGuid().ToString('N');action=$body.action;delta=$delta;browseMode=$browseMode;created=[DateTime]::UtcNow})
                            $message='TUNING';if($body.action -eq 'skip'){$message='SKIPPING'};if($body.action -eq 'toggle'){$message='PLAY / PAUSE'}
                            $result=@{ok=$true;message=$message}
                        }
                    }elseif($body.action -eq 'channel'){$result=@{ok=$false;message='CONNECT CHROME'}}
                    else{
                    # Re-resolve immediately so an old browser session cannot control another app.
                    $media=Find-Sirius;$ok=$false
                    if($media){
                        if($body.action -eq 'toggle' -and $media.info.Controls.IsPlayPauseToggleEnabled){$ok=Await ($media.session.TryTogglePlayPauseAsync()) ([bool])}
                        elseif($body.action -in @('next','skip') -and $media.info.Controls.IsNextEnabled){$ok=Await ($media.session.TrySkipNextAsync()) ([bool])}
                        elseif($body.action -eq 'previous' -and $media.info.Controls.IsPreviousEnabled){$ok=Await ($media.session.TrySkipPreviousAsync()) ([bool])}
                    }
                    $result=@{ok=[bool]$ok};$lastPoll=[DateTime]::MinValue
                    }
                }
            }else{$code=405;$result=@{error='Method not allowed'}}
            $bytes=$utf8.GetBytes(($result|ConvertTo-Json -Depth 6 -Compress))
            $reply=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $code Response`r`nContent-Type: application/json`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n")
            $stream.Write($reply,0,$reply.Length);$stream.Write($bytes,0,$bytes.Length)
        }catch{ }finally{$client.Close()}
    }
}finally{$server.Stop();$mutex.ReleaseMutex();$mutex.Dispose()}
