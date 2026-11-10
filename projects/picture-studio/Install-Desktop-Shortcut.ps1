$ErrorActionPreference='Stop'
$desktop=[Environment]::GetFolderPath('Desktop')
if(-not $desktop -or -not(Test-Path -LiteralPath $desktop)){throw 'The Windows Desktop folder could not be located.'}
$shortcutPath=Join-Path $desktop 'Picture Studio.lnk'
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
$shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $PSScriptRoot 'Start-Desktop.ps1')+'"'
$shortcut.WorkingDirectory=$PSScriptRoot
$shortcut.IconLocation=(Join-Path $PSScriptRoot 'Picture-Studio.ico')+',0'
$shortcut.Description='Picture Studio - crop, preview and save photos for BUSY Bar'
$shortcut.WindowStyle=7
$shortcut.Save()
Write-Output $shortcutPath
