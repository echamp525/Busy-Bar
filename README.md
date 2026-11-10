# Busy-Bar

Busy Bar apps and extensions, organized as four projects in one repository.

| Project | Purpose | Related project |
| --- | --- | --- |
| [SiriusXM Remote](projects/siriusxm/) | Channel browsing, playback, and an animated equalizer | — |
| [Picture Viewer](projects/picture-viewer/) | Local photos/GIFs and folder selection on the Bar | [Picture Studio](projects/picture-studio/) |
| [Picture Studio](projects/picture-studio/) | Desktop crop editor, pixel previews, and per-image save folders | [Picture Viewer](projects/picture-viewer/) |
| [Apple Music Remote](projects/apple-music/) | Library, playlists, playback, and an animated equalizer | — |

## Picture Viewer ↔ Picture Studio

These are companion projects. Studio creates/adds folders and saves images; Viewer selects a folder and displays its files. Both use [the shared photo-library module](shared/photo-library/), one local folder registry, and the same image conversion. Saving and viewing folder selections remain independent. See [the integration guide](docs/picture-project-link.md) and [project relationships](projects.json).

## Set up a new Windows checkout

Requirements: Windows, Python 3.12 or newer, Chrome, and a BUSY Bar. Node.js 24 or newer is used for the JavaScript regression tests. Audio plays through the PC, not the Bar. The Bar app manifests target API 27.14.0.

From the repository root in PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe tools/configure.py --pc-address 192.168.1.50 --bar-address 192.168.1.80
```

Replace those example addresses with your PC and Bar LAN addresses. Optionally add `--images "C:\Pictures\BUSY Bar"` to use an existing photo directory. Configuration creates private pairing files, builds the three native Bar apps in `dist/native/`, and generates the local extension files. It does not install anything, change the running applications, or move existing photos.

For each music service, open `chrome://extensions`, enable Developer mode, and Load unpacked from its project's `chrome-extension` folder. Open the respective signed-in player in Chrome. Generated extension files must exist before loading.

To install a built Bar app over USB:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/Install-Bar-App.ps1 -App siriusxm
```

Use `apple-music` or `picture-viewer` for the other native apps. Picture Studio runs on the PC and has no native Bar package.

Each Bar project has a `Start.cmd`. Picture Studio has `Picture-Studio.cmd`. Optional Windows sign-in startup and automatic companion recovery:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File shared/companion-supervisor/Install-Autostart.ps1
```

Your existing deployed apps are separate from this checkout. Before switching to this checkout's companions, stop the old companions using their Stop scripts so that two installations do not compete for the same ports. Install rebuilt Bar packages and reload extensions together after changing pairing/address configuration.

## Develop and check

```powershell
.\.venv\Scripts\python.exe tools/build.py
.\.venv\Scripts\python.exe tools/run_checks.py
```

The focused tests cover music controls, browse menus, equalizers, extension reconnection, picture conversion, shared folders, and save destinations. Folder integration tests use generated images in temporary directories; they do not open personal photos. GitHub Actions runs the checks on Windows.

## Local files

Pairing tokens, generated Bar packages, runtime configuration, photo-library settings, photos, browser profiles, logs, and process status are excluded by `.gitignore`. The checked-in `*.example.json` files document configuration without real credentials. See [configuration and ports](docs/configuration.md).
