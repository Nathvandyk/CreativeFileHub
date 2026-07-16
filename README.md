# CreativeHub

**A desktop companion for creatives who work across many apps and drives.**

CreativeHub watches the folders you care about and quietly builds a picture of what you're working on — which projects are active, how many hours you've put into each, where your files live, and what's cluttering your drives. It detects the creative apps you have open (Blender, Unreal, Photoshop, and dozens more) and ties your recent work back to real project folders.

> Windows desktop app built with **Tauri 2** (Rust) + **React / TypeScript / Tailwind**.

---

## What it does

- **Dashboard** — drives overview, recent projects grouped by app, what's currently open, and your most-worked apps with time bars.
- **Creative Hub** — a card per tracked app showing total time worked, recent project files grouped into collapsible per‑project dropdowns, with per‑file hours and a live "open now" badge.
- **Activity Log** — a persistent history of every app + project you've worked in, with sessions, hours, and last‑worked times.
- **Recent Files** — everything recently modified across your watched folders, filterable by app and type.
- **Duplicates** — a deep, content‑hash duplicate finder (compares full file contents), with a progress bar and a stop button; runs in the background so the UI stays responsive.
- **Organise** — add a panel per folder, label it *In Progress* or *Done*, and **drag a project from one folder to another to actually move it on disk** (works across drives). Panels detect whether their drive is currently connected.
- **AI Search** — natural‑language file search across your watched paths (uses a local Ollama model to improve results when it's running).
- **Applications** — pick which folders to watch and which apps to track. App detection is driven by a knowledge base (`src-tauri/app_profiles.json`) covering ~50 tools.
- **Desktop Overlay** — an always‑on‑top widget with quick copy‑to‑clipboard shortcuts to your project directories, recent projects, and drive space.
- **Live app detection** — sees which creative apps are running and, where possible, which project file they have open.
- **Light / dark theme** and an **in‑app auto‑updater**.

---

## Install

1. Download the latest **`CreativeHub_x.y.z_x64-setup.exe`** from the [Releases](../../releases) page.
2. Run the installer.
3. Future updates: open **Settings → Check for updates** — the app updates itself.

**First run:** go to **Applications**, add the folders you want CreativeHub to watch (e.g. your Blender / Unreal / project folders), and tick the apps you use. Everything else populates from there.

---

## Development

**Prerequisites**
- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://www.rust-lang.org/tools/install) + the [Tauri prerequisites for Windows](https://tauri.app/start/prerequisites/) (MSVC build tools + WebView2)

**Run in dev (hot reload):**
```bash
npm install
npm run tauri dev
```

**Build an installer:**
```bash
npm run tauri build
```
The signed installer is written to `src-tauri/target/release/bundle/nsis/`.

---

## Tech stack

| Layer | Tech |
|---|---|
| Shell | Tauri 2 (Rust, WebView2) |
| UI | React 19, TypeScript, Tailwind CSS 4, Vite |
| Backend work | Rust — `walkdir` (scanning), `sysinfo` (running apps), `sha2` (dup hashing) |
| Data | Settings + activity log in the app data dir; app profiles embedded from `app_profiles.json` |

## Extending app support

To teach CreativeHub about a new application, add an entry to **`src-tauri/app_profiles.json`** — its file extensions, category, and how to find a project's root folder. No code changes needed.
