# Configuration and ports

Run `tools/configure.py` from the root before launching apps or loading extensions. It preserves existing local tokens when regenerating configuration. Tokens are random local pairing secrets, not SiriusXM or Apple Music credentials.

| Project | Local file | Port |
| --- | --- | --- |
| SiriusXM | `projects/siriusxm/bridge.json` | 8766 |
| Picture Viewer | `projects/picture-viewer/config.json` | 8768 |
| Picture Studio | `projects/picture-studio/config.json` | 8769, loopback only |
| Apple Music | `projects/apple-music/config.json` | 8770 |

Music extensions contact their respective companions through `127.0.0.1`. The Bar contacts the PC's configured LAN address. Companions check the configured source addresses and pairing token. Studio's editing/folder APIs additionally check local Host, Origin, and its editor nonce.

`data/Images` is the default source/save directory. `data/photo-library.json` is shared by Viewer and Studio. Pass `--images` to choose another default root; use Studio to add additional directories.

`shared/companion-supervisor` supervises the three Bar companions and respects their `stop.signal` files. `Start.cmd` re-enables an intentionally stopped app. Studio starts its local editing service when its desktop launcher runs.

If the PC or Bar LAN address changes, rerun configuration, reinstall the generated Bar packages, and reload the extensions. Reserve the addresses in your router if you want to avoid that step. The PC must be awake; music websites must remain signed in and open.

Generated `background.js`, extension `connection.js`, native packages, configuration, images, profiles, and status files remain local and must not be committed. These are public project sources; no browser cookies, subscription credentials, or user photos are needed to build them.

Run `python tools/check_privacy.py` before publishing. CI runs the same check for common credential literals, private keys, provider tokens, email addresses, user-home paths, and private runtime files. It reports filenames and categories without printing detected values. Personal names or arbitrary account numbers are not always recognizable by a pattern, so review additions as well as running the check. GitHub's repository ownership and commit attribution are separate from file contents.
