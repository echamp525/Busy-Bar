# Picture Viewer

BUSY Bar local-folder photo and GIF slideshow. **Companion project: [Picture Studio](../picture-studio/).**

- Dial: previous/next image.
- Dial click or large Start button: pause/resume.
- Hold dial: open Settings / View Folder. Turn to highlight, click to save; Back cancels.
- Folder options refresh automatically from Studio's shared registry.
- Front image: 72 × 16 color. Rear image: 160 × 68 grayscale plus the app footer.

Follow [repository setup](../../README.md#set-up-a-new-windows-checkout), install `dist/native/Picture-Viewer.tgz`, and run `Start.cmd`. Optional sign-in startup and crash recovery are supplied by the [shared supervisor](../../shared/companion-supervisor/).

Use [Picture Studio](../picture-studio/) to add/create image folders and prepare images. The apps share [photo-library settings](../../shared/photo-library/) and [this integration contract](../../docs/picture-project-link.md). Selecting where Studio saves an image does not change Viewer's viewing folder.

Native app ID: `local.pictures.viewer`; version 1.1.0. Companion: `viewer.py`. Settings are generated in `config.json`; see [the example](config.example.json). Photos and the shared folder registry remain outside Git.
