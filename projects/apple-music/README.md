# Apple Music Remote

BUSY Bar app and Chrome extension for your signed-in Apple Music web player. Audio plays on the PC.

- Turn the dial for next/previous track; click for next.
- Large Start button toggles playback.
- Hold the dial to browse Library Songs, Playlists, or Now Playing. Click to open/play a selection.
- After 36 seconds, show green/yellow/red equalizer bars and a red heading cycling through Apple Music, artist, and song.
- Automatic extension reconnection and optional supervised companion startup.

Follow [repository setup](../../README.md#set-up-a-new-windows-checkout), then load `chrome-extension` in Chrome, install `dist/native/Apple-Music-Remote.tgz`, and run `Start.cmd`. Keep a signed-in Apple Music tab open. No Apple developer key is needed.

Native app ID: `local.applemusic.remote`. Companion: `companion.py`. Chrome extension version: 1.1.0; native app version: 1.2.0.

Local settings are generated in `config.json`; an [example](config.example.json) is provided. Shared recovery code is in [companion-supervisor](../../shared/companion-supervisor/) and [extension-bridge](../../shared/extension-bridge/).
