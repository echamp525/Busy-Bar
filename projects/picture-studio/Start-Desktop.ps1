param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
try {
    $candidates=@(
        (Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google/Chrome/Application/chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe')
    )
    $browser=$candidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
    if(-not $browser){throw 'Picture Studio needs Google Chrome installed.'}
    if($CheckOnly){Write-Output 'Picture Studio desktop launcher is ready.';exit 0}
    & (Join-Path $PSScriptRoot 'Open-Editor.ps1') -NoBrowser
    # An isolated app profile opens a separate desktop window without changing the
    # user's browser profile, default browser, extensions, or saved sign-ins.
    $profile=Join-Path $PSScriptRoot 'desktop-chrome-profile'
    $arguments=@(
        '--app=http://127.0.0.1:8769/',
        ('--user-data-dir="'+$profile+'"'),
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,1000'
    )
    Start-Process -FilePath $browser -ArgumentList $arguments
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.MessageBox]::Show($_.Exception.Message,'Picture Studio',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    exit 1
}
