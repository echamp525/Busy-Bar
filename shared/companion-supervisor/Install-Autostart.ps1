$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$config=Get-Content (Join-Path (Split-Path (Split-Path $root -Parent) -Parent) 'projects/apple-music/config.json') -Raw|ConvertFrom-Json
$pythonw=Join-Path (Split-Path $config.python -Parent) 'pythonw.exe'
if(-not(Test-Path -LiteralPath $pythonw)){throw 'Python windowless runtime is missing'}
$startup=[Environment]::GetFolderPath('Startup')
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut((Join-Path $startup 'BUSY Bar Companions.lnk'))
$shortcut.TargetPath=$pythonw
$shortcut.Arguments='"'+(Join-Path $root 'supervisor.py')+'"'
$shortcut.WorkingDirectory=$root
$shortcut.Description='Keep the BUSY Bar SiriusXM, Apple Music and Picture Viewer companions connected'
$shortcut.WindowStyle=7
$shortcut.Save()
& (Join-Path $root 'Start-Bridges.ps1')
Write-Output 'Music bridge recovery enabled now and at Windows sign-in.'
