# Shared extension recovery

Canonical MV3 recovery script for SiriusXM and Apple Music. `tools/build.py` copies it into each extension's local generated `connection.js`.

It repairs missing content scripts, wakes paused/background player tabs, keeps pairing in session storage, and uses startup/tab events plus a recovery alarm. It only targets the respective extension's music website.
