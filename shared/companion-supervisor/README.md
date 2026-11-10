# Companion supervisor

Supervises [SiriusXM](../../projects/siriusxm/), [Apple Music](../../projects/apple-music/), and [Picture Viewer](../../projects/picture-viewer/).

After root configuration, use `Start-Bridges.ps1` to enable all three or `-App siriusxm`, `-App apple-music`, or `-App picture-viewer` for one. Optional `Install-Autostart.ps1` creates the current user's **BUSY Bar Companions** Windows Startup shortcut. `Stop-All.cmd` stops all three and the supervisor.

Intentional per-app Stop commands are respected. Failed companions recover automatically, while existing healthy processes are adopted. Picture Viewer's health check does not decode photos or advance its slideshow. Process status and errors remain gitignored local files.
