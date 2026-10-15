# Editor source

The editor ships as one self-contained `index.html` in the repo root, so it works offline, from disk and on GitHub Pages. That file is **built** from the pieces in this folder. Edit the pieces, never `index.html` directly.

## Build

```
node build.js            # writes index.html from src/
node build.js --check    # fails if index.html doesn't match src/ (run before committing)
```

You need [Node.js](https://nodejs.org/) (any current version). The build only stitches files together: no minifying and no reformatting, so `index.html` is exactly the source, concatenated.

## Tests

Double-click `run-tests.cmd` in the repo folder, or run:

```
node tools/run-tests.js
```

It runs every test against your own saves and writes a report to `test-reports/latest.md` (plus a dated copy). Saves are only read, never changed.

1. **Build check:** `index.html` matches the `src/` files.
2. **Round trip:** each save is loaded through the built `index.html` (in Node, with a stand-in page) and, with no edits, Download must write it back exactly as loaded, and the `.sav` it writes must read back the same. A failure names the first field that changed. The one change made on purpose (the defense lineup's copies of each defender's grade, class and level brought in step with the fighter) is expected.
3. **Save check:** the editor's Save check runs on each save, and the report groups its problems and warnings by kind, with the saves each one appeared in.
4. **Edit tests:** the main edits are made on a sample of saves the way their buttons do: floor move, Lock boss floors (Don, every remaining floor), removing pre-planned floors, End the run, Max everything safe, Max all fighters, every Save check fix button, and Clone (pairs of saves from different accounts). Each edited save must download, write and read back as a `.sav`, and load into the editor again. It fails if the edit didn't take, or if the Save check finds a problem or warning the save didn't have before. Rolls are random, so run again to see if a failure repeats. Scenarios are in `tools/lib/edit-scenarios.js`.

These prove the editor writes saves it can read back and check; they can't prove the game accepts them. [docs/in-game-status.md](../docs/in-game-status.md) lists what's been confirmed in the game.

The first run makes `tools/tests.config.json` with the masters.db and save folders it finds on your PC (the game's Content folder, your Desktop and Downloads). Edit it to test other saves; folders are searched `depth` levels deep for `.sav` files, and identical copies are tested once. `editSaves` sets how many saves get the edit tests (default 30, saves paused in a run first; `"all"` for every save, which takes a while), and `clones` how many pairs are cloned (default 6). Everything runs offline, since sql.js is built into `index.html`. You need Node 18 or newer.

**Sharing a report:** attach `test-reports/latest.md` in a Claude chat (type `@` and pick the file) and ask about the findings. The report names your save folders and fighters and stays on your PC unless you share it. The config, the cache and the reports are git-ignored.

To run only the round trip on particular saves: `node tools/roundtrip-test.js --masters <masters.db> <save.sav | folder> ...`. Keep test saves outside the repo; they hold account ids.

## How it fits together

`index.shell.html` is the page skeleton. Every `@@INCLUDE(path)@@` marker in it is replaced by the file at `src/<path>`. The JavaScript files are plain classic scripts that share one global scope, and they run **in the order they are listed in the shell**. That order matters: a file can only use top-level `const`/`let` values from files listed before it, at load time. Functions can be called from anywhere once everything has loaded.

| File | What it holds |
|---|---|
| `index.shell.html` | Page skeleton: header buttons, status bar, include markers |
| `vendor/` | sql.js 1.11.0 (`sql-wasm.js`, and its `.wasm` as base64), built into the page so it needs no network; MIT licence in `sql.js-LICENSE.txt` |
| `styles.css` | All CSS (the background image lives in `assets/background.jpg.b64`) |
| `data/templates.json` | Blank records the game uses for new entries (kept byte-for-byte) |
| `data/decal-atlas.json` | Which decal icon sits in which cell of the icon sprite sheet (`assets/decal-atlas.webp.b64`, included by `styles.css`); made by the let-it-die-model-viewer repo's tools |
| `data/icon-atlas.json` | The same for item icons: which material, mushroom, beast, blueprint, weapon and armour icon sits in which cell of the three sprite sheets (`assets/icon-items.webp.b64`, `icon-weapons.webp.b64`, `icon-armor.webp.b64`, plus `icon-mastery.webp.b64` for the weapon-type icons), and which pieces borrow another piece's icon; made by the let-it-die-model-viewer repo's tools |
| `data/body-thumbs.json` | Face thumbnail (base64 WebP) per fighter model id, for the model picker; rendered by the let-it-die-model-viewer repo's tools |
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
| `js/36-lucky-run.js` | "I'm feeling lucky" (Location tab): pool, ceilings, seeded plan, download step |
| `js/37-startup.js` | Start-up wiring (runs last) |

## Rules worth keeping

- `RAW_SAV_ROOT` is the save exactly as loaded and must never be changed. Edits go to `SAVE`, and `buildDownloadRoot()` merges them into a **clone** of the raw save.
- Read limits and names from masters.db rather than hard-coding them.
- Wrap every `localStorage` / IndexedDB call in `try/catch`; storage is a convenience only.
- Save files with LF line endings (`.gitattributes` handles this in git; the build also tolerates CRLF).
