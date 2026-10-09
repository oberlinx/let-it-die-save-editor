# Editor source

The editor ships as one self-contained `index.html` in the repo root, so it works offline, from disk and on GitHub Pages. That file is **built** from the pieces in this folder. Edit the pieces, never `index.html` directly.

## Build

```
node build.js            # writes index.html from src/
node build.js --check    # fails if index.html doesn't match src/ (run before committing)
```

You need [Node.js](https://nodejs.org/) (any current version). The build only stitches files together: no minifying and no reformatting, so `index.html` is exactly the source, concatenated.

## How it fits together

`index.shell.html` is the page skeleton. Every `@@INCLUDE(path)@@` marker in it is replaced by the file at `src/<path>`. The JavaScript files are plain classic scripts that share one global scope, and they run **in the order they are listed in the shell**. That order matters: a file can only use top-level `const`/`let` values from files listed before it, at load time. Functions can be called from anywhere once everything has loaded.

| File | What it holds |
|---|---|
| `index.shell.html` | Page skeleton: header buttons, status bar, include markers |
| `styles.css` | All CSS (the background image lives in `assets/background.jpg.b64`) |
| `data/templates.json` | Blank records the game uses for new entries (kept byte-for-byte) |
| `js/01-core-state-and-tables.js` | File overview, global state, game constants and lookup tables |
| `js/02-save-codec.js` | `.sav` read/write: BRG header + zlib chunks |
| `js/03-load-adapter.js` | Raw save JSON → the editor's `SAVE` shape (works on a copy) |
| `js/04-save-writeback.js` | `SAVE` → game JSON, merged into a clone of the raw save |
| `js/05-masters-db-and-loading.js` | masters.db via sql.js, and `loadSaveFiles` |
| `js/06-names-session-factories.js` | Name lookups, search index, new-session reset, blank records |
| `js/07-tabs-and-render.js` | Tab list and `renderAll()` |
| `js/08-account.js` … `js/31-compare-and-copy.js` | One file per tab or feature (names say which) |
| `js/29-save-check.js` | The Save check rules and engine |
| `js/32-download-pipeline.js` | `{}`/`[]` shape restore, review diff, `buildDownloadRoot()` |
| `js/33-download-history.js` | Download history (IndexedDB) |
| `js/34-ui-pack.js`, `js/35-ui-pack-2.js` | Search, status bar, changes drawer, shortcuts, themes, tour, recent saves |
| `js/36-startup.js` | Start-up wiring (runs last) |

## Rules worth keeping

- `RAW_SAV_ROOT` is the save exactly as loaded and must never be changed. Edits go to `SAVE`, and `buildDownloadRoot()` merges them into a **clone** of the raw save.
- Read limits and names from masters.db rather than hard-coding them.
- Wrap every `localStorage` / IndexedDB call in `try/catch`; storage is a convenience only.
- Save files with LF line endings (`.gitattributes` handles this in git; the build also tolerates CRLF).
