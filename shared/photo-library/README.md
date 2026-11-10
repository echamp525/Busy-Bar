# Shared photo-library settings

Used by [Picture Viewer](../../projects/picture-viewer/) and [Picture Studio](../../projects/picture-studio/). This module owns folder IDs, discovery, independent `viewFolder`/`saveFolder` choices, cross-process locking, and atomic registry updates. It does not open image files.

The generated registry lives in `data/photo-library.json`. The shared path is written into both apps' private configuration by `tools/configure.py`.
