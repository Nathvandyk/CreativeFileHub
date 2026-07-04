# Releasing CreativeHub

CreativeHub installs from an NSIS `setup.exe` and updates itself: on startup it checks
GitHub Releases (`Nathvandyk/CreativeFileHub`), and if a newer version exists it shows an
in-app banner with an "Install & restart" button. Users never need to download installers
manually after the first install.

## One-time setup

The updater signing key lives at `src-tauri/updater-keys/creativehub.key` (git-ignored).
**Back it up somewhere safe** — if it's lost, existing installs can never verify another
update. The matching public key is embedded in `src-tauri/tauri.conf.json`.

## Every release

1. Bump `version` in `src-tauri/tauri.conf.json` (e.g. `0.1.0` → `0.2.0`).
2. Run from the repo root in PowerShell:

   ```powershell
   .\scripts\release.ps1
   ```

   This builds the app, signs the installer with the private key, and writes:
   - `src-tauri\target\release\bundle\nsis\CreativeHub_<version>_x64-setup.exe`
   - `src-tauri\target\release\bundle\nsis\latest.json`

3. On GitHub, create a new release on `Nathvandyk/CreativeFileHub`:
   - Tag: `v<version>` (e.g. `v0.2.0`) — must match, `latest.json` links to this tag.
   - Upload **both** the `-setup.exe` and `latest.json` as release assets.
   - Publish.

That's it. Running apps see the new version within one restart; the banner downloads the
signed installer, verifies the signature, installs silently, and relaunches.

## Notes

- First-time users install by running the `-setup.exe` from the latest release directly.
- Installing a new setup.exe by hand also works — it upgrades in place (same identifier
  `com.filemanagement.app`), so manual and auto update can be mixed freely.
- The update check fails silently when offline or if the repo has no release yet.
- If the repo is **private**, `releases/latest/download/latest.json` won't be publicly
  reachable and the updater can't fetch it — make the repo public or host `latest.json`
  and the installer somewhere public.
