# Picture Viewer ↔ Picture Studio

[Picture Viewer](../projects/picture-viewer/) and [Picture Studio](../projects/picture-studio/) are linked companion projects in this repository.

| Component | Responsibility |
| --- | --- |
| Picture Studio | Choose/create directories, edit a photo, preview it, and save each image into the selected folder |
| Picture Viewer | Read the selected viewing directory, display photos/GIFs, and provide a dial-driven folder Settings menu |
| `shared/photo-library/photo_library.py` | Discover folders, validate selections, preserve independent viewing/save defaults, and update shared settings atomically |
| `data/photo-library.json` | Generated local registry used by both apps; excluded from Git |

`tools/configure.py` gives both projects the same image directory and `libraryFile` path. Each app keeps its own private configuration. Studio imports Viewer's image converter so its pixel previews match the device conversion.

Create a folder with Studio's **New folder** button or register an existing folder with **Add existing folder**. Choose **Save this image to** before saving. In Viewer, hold the dial to open Settings, turn to highlight a folder, and click to confirm; Back cancels. Studio's **Folder shown on the BUSY Bar** selection changes that same viewing setting.

Viewer refreshes the folder list at app startup, when Settings opens, and while Settings remains open. Studio refreshes on opening/focus and periodically while visible. Registered directories' immediate child folders are discovered automatically, and Studio-created nested folders are registered too. Image files are read from the chosen directory only, without recursive mixing.

Choosing a save destination does not change the current slideshow directory. Missing directories produce an unavailable-folder error instead of silently saving elsewhere. Directory operations and photo saves remain local to the PC.

The bidirectional relationship is also recorded in [projects.json](../projects.json).
