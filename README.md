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
5. Check the **Save check** panel (see below), make your changes, then click **Download .sav**. A list of everything you changed appears first so you can check it; you can also save a backup of the original from there. The file downloads as `brggame_<date>_<time>.sav` so older downloads are never replaced. Rename it to your save's name (e.g. `brggame.sav`) and put it in place of your save.

**PSN players:** your save has to be decrypted first. You'll also need a copy of `masters.db`, which only comes with the PC version. If you don't have the PC game, ask in the [LET IT DIE Discord](https://discordapp.com/invite/gdMZBbK) or DM u/Oberlinx on Reddit.

## Tabs

| Tab | What it does |
|---|---|
| Account | Kill Coins and SPLithium with their bank and tank levels, TDM points and rank, and weapon mastery. The account name and ID are shown but locked |
| Fighters | Fighter Freezer: fighter model and gas mask; grade and limit break; stats as dropdowns limited to what the grade and limit break allow, with level worked out from the stats; decals, bags and inventories, with **Repair & refill all** (full durability and ammo); equipped weapons (all 6 weapon slots and which one is in each hand) and armor; raise the freezer level (adds hangers), add a new fighter into an empty hanger (the way the Fighter Depot does), delete a fighter the way the game does, and recover a dead fighter (Hater) for free |
| Research | Blueprint research (Chokufunsha) unlocks and levels. Armor researched to +4 unlocks its Armor Skin, as in the game. Blueprints the game knows about but you haven't developed are marked (**blueprint known, not developed** or **unrevealed blueprint**); ticking one develops it at +0, and unticking it puts it back the way the game had it |
| Decals | Skill decal stock. Premium decals are marked. PlayStation-only decals are hidden unless **Include PS-only** is ticked (for modded PC games); ones already in the save are tagged and can be set to 0 |
| **Stews** | Mushroom Stew decal queue: see upcoming pulls, dedupe, move a rarity to the front, stack, reroll, clear, undo |
| **Mystery Bags** | Lost Bags from Tokyo Death Metro: see what each rarity will give, set any slot, fill all, or reroll from the game's odds |
| **Death Boxes** | See each box's reward and unlock time, open now, change or reroll the reward, add or remove boxes |
| **Waiting Room** | Unlock Waiting Room decorations (wall, floor, pillar, fountain, flag, poster, giant object, neon, potted plant, RC car) and choose which one each spot shows |
| **Screenshots** | View and export Kiwako's large-stamp photos stored in the save (view/export only; they can't be deleted because the game refers to them) |
| **Dead Fighters** | Browse the dead fighter archive: yours and other players', when and where they died, Kill Coins carried, and stats, gear and decals when the game kept them (view only) |
| **Dates** | Every date in the save, with fixes for time-jump damage (future dates, dates past 2038, overflowed negative dates) |
| Storage | Storage Box contents and capacity; repair and refill ammo on everything stored |
| Rewards | Send to the Reward Box: weapons and armor at a chosen in-game +n (arriving with full durability and ammo), blueprints (normal or unrevealed), items, mushrooms, beasts, decals (marked Premium or Normal), Kill Coins, SPLithium, and Lost Bags of any rarity (random contents from the game's odds, or chosen). Only things the PC game can hand out are offered, and levels an item can't reach are hidden. PS-only parts, blueprints and decals need **Include PS-only** |
| **Quests** | Current quests (progress, complete, drop), take a new quest, and quest history (times taken / cleared) |
| **Stamp Rally** | Kiwako's Tower Stamp Rally, floor by floor (1F-40F is Stamp Rally I, 41F-50F is Stamp Rally II). Set each floor to not stamped, perfect, or off by 1-16 (how far off the stamp landed, as the game stores it); stamp a 10-floor section or every floor at once. **Reset** a single floor, a section or the whole rally: the stamps are cleared and every bonus that includes them can be earned again. The Bonuses table lists all 12 rewards (50,000 Kill Coins for every 5 floors, and the Grim Reaper's Scythe and X-Ray Glasses blueprints for finishing each rally and finishing it perfectly) with your progress and whether the game has already given each one. Set a bonus to **Not given** to earn it again, or use **Send reward** to put it in the Reward Box now |
| **Location** | For a fighter paused mid-run on a Heaven boss floor (quit the game while standing there): move them to another boss floor of the same route that uses the same map. Regular Heaven (TENGOKU) has one boss map every 5 floors from 55F to 450F; each NEO route (D.O.D, W.E, C.W, M.I.L.K) has map A on 55F, 65F ... 135F and map B on 60F, 70F ... 140F, and only floors with the same map are offered, labelled by route and map. The waiting boss is set to the new floor's level, and the unopened treasure boxes and boss drop can be rerolled from the new floor's own drop table (deeper floors roll better rewards, including rare blueprints), with **Reroll again**. Your records (deepest floor, clear times) are left as they are. The run's Exploration Bonus is based on the floor you end on, so moving deeper raises the Bloodnium bonus. Confirmed in game; keep a backup. **Lock boss floors (experimental, not confirmed in game):** for a fighter paused anywhere in Heaven, make the run's upcoming boss floors **Don only** (main bosses), **Mid-boss only**, **Screamer Pit only**, or Don or mid-boss. Regular Heaven has no Dons below 100F, so with Don only those floors become mid-boss floors. Each upcoming boss floor's arena is redrawn from the game's own choices for that floor (`master_ref_boss_area_setting`), with its rewards drawn from the floor's tables; the floor you're on and the NEO routes' fixed map B floors stay as they are. It can also write every remaining boss floor of the route, to test whether the game keeps them for the whole run. Only the save is changed, never masters.db |
| VIP | Express Pass: None, 1-Day or 30-Day, passes held, expiry, auto-renew. **Free Continues:** set how many free continues the continue screen offers per day (all available today), up to 9,999. Confirmed in game. They last until the game's daily reset (the first login of a new day sets them back to 0), so set them again each day |
| **Compare** | Load a second save, see what differs, and copy ticked parts into the save you're editing (account values, fighters with their gear, research, decal stock, Waiting Room decorations, Reward Box and Storage items). You can also choose which account the downloaded save belongs to, to move progress onto another account, or **clone the whole second save onto the account you're editing**: everything comes from the other save, but the account ID, name and Steam/PSN IDs stay yours, so the game loads it as your save. Cloning a PlayStation save onto a PC account warns you first and lists any PS-only content |
| **Defense** | Tokyo Death Metro defense: set the lineup (up to 9 defenders: one wave 5, the other 4) from your freezer fighters, choose the defense alarm and which defender carries it, max the alarm time (5 days) and kidnap protection (12 hours). Only alarms unlocked at your deepest floor can be picked, and the tab stays locked until Tokyo Death Metro is open |

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
