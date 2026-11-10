# Picture Studio

Local desktop image editor for the BUSY Bar. **Companion project: [Picture Viewer](../picture-viewer/).**

1. Choose a photo or try the built-in generated sample.
2. Frame for the front or rear screen; drag, zoom, rotate, and adjust brightness/contrast.
3. Check the exact pixel previews.
4. Choose **Save this image to**, name the file, and save a PNG. Existing filenames receive a suffix.

**New folder** creates a directory beneath the selected parent. **Add existing folder** opens a Windows folder chooser; Folder Settings also accepts a full directory path. **Folder shown on the BUSY Bar** changes Viewer's selection. Save and viewing preferences are remembered separately.

Follow [repository setup](../../README.md#set-up-a-new-windows-checkout), then run `Picture-Studio.cmd`. It opens a dedicated Chrome app window backed by the local editor at `http://127.0.0.1:8769/`. Run `Install-Desktop-Shortcut.ps1` if you want a desktop shortcut. The complete repository is required because Studio uses Viewer's converter and the shared library module.

See [Picture Viewer](../picture-viewer/), [shared photo-library](../../shared/photo-library/), and [the project-link guide](../../docs/picture-project-link.md). Studio version: 1.1.0. Local settings are generated in `config.json`; see [the example](config.example.json).

Image editing, folder selection, and saving stay on the PC. GIF input becomes a still PNG when saved through Studio. Your images, desktop browser profile, and local settings are excluded from Git.
