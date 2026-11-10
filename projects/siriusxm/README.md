# SiriusXM Remote

BUSY Bar app and Chrome extension for your signed-in SiriusXM player. Audio plays on the PC.

- Turn the dial to tune channels; click to skip when the channel supports it.
- Large Start button toggles playback.
- Hold the dial for Browse All Channels / Browse Library; turn, then click to confirm.
- After 36 seconds, show green/yellow/red equalizer bars while the heading cycles through station, artist, and song in the station's accent color.
- Automatic extension reconnection and optional supervised companion startup.

Follow [repository setup](../../README.md#set-up-a-new-windows-checkout), then load `chrome-extension` in Chrome, install `dist/native/SiriusXM-Remote.tgz`, and run `Start.cmd`. Keep one signed-in SiriusXM player tab open. Live stations can disable skipping.

Native app ID: `local.siriusxm.remote`. Companion: `Companion.ps1` (Windows PowerShell 5.1). Chrome extension version: 1.3.0; native app version: 1.6.2.

Local settings are generated in `bridge.json`; an [example](bridge.example.json) is provided. Shared recovery code is in [companion-supervisor](../../shared/companion-supervisor/) and [extension-bridge](../../shared/extension-bridge/).
