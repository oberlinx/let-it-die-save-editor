# LET IT DIE Offline Save Editor

A save editor for **LET IT DIE (Offline edition)** that runs entirely in your browser. There's nothing to install and no Python. Your save never leaves your computer.

**Use it online:** https://oberlinx.github.io/let-it-die-save-editor/

You can also download `index.html` and open it straight from your PC.

## How to use

1. **Close LET IT DIE.** The game writes the save when it exits and would overwrite your edits.
2. **Back up your save.** Copy `brggame.sav` (or your numbered `.sav`) somewhere safe.
3. Open the editor and click **1. Load masters.db**. It's in
   `...\steamapps\common\LET IT DIE\BrgGame\Content\masters.db`.
   The browser remembers it after the first time. Use **Forget masters.db** to stop that.
4. Click **2. Load your save** and pick your `.sav` from
   `...\steamapps\common\LET IT DIE\Savedata\`.
5. Make your changes, then click **Download .sav**. Put the downloaded file in place of your save.

PSN saves have to be decrypted first.

## Tabs

| Tab | What it does |
|---|---|
| Account | Account name, TDM points/rank, Kill Coins and SPLithium with their bank levels |
| Fighters | Fighter Freezer: fighter stats, levels, decals, bags and inventories; equipped weapons (all 6 weapon slots and which one is in each hand) and armor; raise the freezer level (adds hangers), add a new fighter into an empty hanger (the way the Fighter Depot does), delete a fighter the way the game does, and recover a dead fighter (Hater) for free |
| Research | Blueprint research (Chokufunsha) unlocks and levels |
| Decals | Skill decal counts |
| **Stews** | Mushroom Stew decal queue: see upcoming pulls, dedupe, move a rarity to the front, stack, reroll, clear, undo |
| **Mystery Bags** | Lost Bags from Tokyo Death Metro: see what each rarity will give, set any slot, fill all, or reroll from the game's odds |
| **Death Boxes** | See each box's reward and unlock time, open now, change or reroll the reward, add or remove boxes |
| **Waiting Room** | Unlock Waiting Room decorations (wall, floor, pillar, fountain, flag, poster, giant object, neon, potted plant, RC car) and choose which one each spot shows |
| **Screenshots** | View and export Kiwako's large-stamp photos stored in the save (view/export only; they can't be deleted because the game refers to them) |
| **Dead Fighters** | Browse the dead fighter archive: yours and other players', when and where they died, Kill Coins carried, and stats, gear and decals when the game kept them (view only) |
| **Dates** | Every date in the save, with fixes for time-jump damage (future dates, dates past 2038, overflowed negative dates) |
| Storage | Storage Box contents and capacity |
| Rewards | Reward Box items |
| **Quests** | Current quests (progress, complete, drop), take a new quest, and quest history (times taken / cleared) |
| VIP | VIP Express Pass status |
| **Compare** | Load a second save, see what differs, and copy ticked parts into the save you're editing (account values, fighters with their gear, research, decal stock, Waiting Room decorations, Reward Box and Storage items). You can also choose which account the downloaded save belongs to, to move progress onto another account |

### Save check

When you load a save, a **Save check** panel above the tabs lists anything the editor knows to be wrong: dates damaged by time jumping, research missing its upgrade marker, items in two places, fighters over their Death Bag limit, currencies over the bank limit, IDs this masters.db doesn't know, and more. Each entry links to the tab that deals with it, and the safe ones (dates, research markers) have a one-click fix. Use **Re-check** after making changes.

### Stews

Stew results are pre-rolled and stored in the save as a queue, and the game pulls from the end of that list. Changing odds in masters.db does nothing until the queue runs out. This tab edits the queue itself, so a change applies on your very next stew. It's a browser version of `tools/stew_luck_rarity.py`.

### Dates

Moving the PC clock forward and back, or past January 2038, leaves bad timestamps that can crash the game. The Dates tab compares every date with your PC clock (or a time you choose). It flags the bad ones and can set them to the reference time. Only the flagged dates change. Future login-bonus days are removed rather than duplicated, and expiry timers are only changed if they overflow.

## Safety

- Everything runs locally in the browser. The only network request is a one-time fetch of [sql.js](https://sql.js.org/) from cdnjs to read masters.db.
- Edits apply only when you download. The file you loaded isn't touched.
- Loading a save and downloading it without edits keeps the data as the game wrote it. The only difference is number formatting (for example `52.0` becomes `52`), which the game reads the same way.
- Keep backups anyway.

## Hosting (GitHub Pages)

This repo is a plain static site: `index.html` at the root, plus `.nojekyll`.

1. Push to `main` on GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment**. Set Source to **Deploy from a branch**, the branch to **main**, and the folder to **/ (root)**.
3. After a minute or so the site is live at `https://oberlinx.github.io/let-it-die-save-editor/`.

## Repo layout

```
index.html                 the editor (single file)
tools/stew_luck_rarity.py  original command-line stew tool (reference)
.nojekyll                  serve files as-is on GitHub Pages
.gitignore                 keeps saves and masters.db out of git
```

`.gitignore` blocks `.sav`, `.db` and save `.json` files. Don't commit your save or the game's masters.db.
