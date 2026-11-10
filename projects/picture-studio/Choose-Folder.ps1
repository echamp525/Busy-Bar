param([string]$InitialFolder)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
[Windows.Forms.Application]::EnableVisualStyles()
$dialog=New-Object Windows.Forms.FolderBrowserDialog
$dialog.Description='Choose a Picture Studio and Picture Viewer folder'
$dialog.ShowNewFolderButton=$true
if($InitialFolder -and (Test-Path -LiteralPath $InitialFolder -PathType Container)){$dialog.SelectedPath=$InitialFolder}
try{
    if($dialog.ShowDialog() -eq [Windows.Forms.DialogResult]::OK){@{path=$dialog.SelectedPath}|ConvertTo-Json -Compress}
    else{@{cancelled=$true}|ConvertTo-Json -Compress}
}finally{$dialog.Dispose()}
