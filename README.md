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
5. Check the **Save check** panel (see below), make your changes, then click **Download .sav**. A list of everything you changed appears first so you can check it; you can also save a backup of the original from there. The file downloads as `brggame_<date>_<time>.sav` so older downloads are never replaced. Rename it to your save's name (e.g. `brggame.sav`) and put it in place of your save. A copy is also kept in **Download history** (see below), so you can go back if an edit goes wrong.

**PSN players:** your save has to be decrypted first. You'll also need a copy of `masters.db`, which only comes with the PC version. If you don't have the PC game, ask in the [LET IT DIE Discord](https://discordapp.com/invite/gdMZBbK) or DM u/Oberlinx on Reddit.

## Tabs

| Tab | What it does |
|---|---|
| Account | Kill Coins and SPLithium with their bank and tank levels, TDM points and rank, and weapon mastery (setting a level also sets the mastery points behind it, which is what the game reads). The account name and ID are shown but locked |
| Fighters | Fighter Freezer, in collapsible sections (Profile, Stats, Equipment, Skill Decals, Fighter Inventory; the editor remembers which are open): fighter model and gas mask; grade and limit break; stats as dropdowns limited to what the grade and limit break allow, with level worked out from the stats; decals, bags and inventories, with **Repair & refill all** (full durability and ammo); equipped weapons (all 6 weapon slots and which one is in each hand) and armor; the fighter you play is starred and opens first; raise the freezer level (adds hangers), add a new fighter into an empty hanger (the way the Fighter Depot does), delete a fighter the way the game does, and recover a dead fighter (Hater) for free. **Max all fighters** (confirmed in game) sets every fighter to Grade 6, Limit Break 4 and the highest stats, decal slots, Death Bag and rage at once. **Armor Skins** in use (head, body, legs) can be chosen from the skins you've unlocked (armor researched to +4) |
| **Layouts** | A library of fighter loadouts: 6 weapon quick slots (and which one is in hand), head/body/legs armor, and decals. Make one from scratch or save a fighter's current loadout, edit or duplicate it, and export/import the library as a `.json` file (it's kept in your browser, so it works across saves). Apply a layout to any fighter: weapons and armor come from **stock** (the fighter's Death Bag, then the Storage Box), are **created** new (full durability and ammo), or stock first and then created; decals the same way from the decal stock. The usual equipment rules still apply (right slot, not broken, stat requirement met counting the layout's decals), and anything that fails is skipped with the reason. **Preview** first, **Undo** after; the review before download lists every change. Confirmed in game |
| Research | Blueprint research (Chokufunsha) unlocks and levels, with the **Funshots** (Research Stamp) they give. Each researched part adds its Funshot once (Slash and Shoot +0.4, Hit +0.8, Head, Body and Legs +0.2); upgrading a part adds nothing, and some parts give none. Any research change sets the Funshots to what research gives. Armor researched to +4 unlocks its Armor Skin, as in the game. Blueprints the game knows about but you haven't developed are marked (**blueprint known, not developed** or **unrevealed blueprint**); ticking one develops it at +0, and unticking it puts it back the way the game had it |
| Decals | Skill decal stock. Premium decals are marked. PlayStation-only decals are hidden unless **Include PS-only** is ticked (for modded PC games); ones already in the save are tagged and can be set to 0 |
| **Stews** | Mushroom Stew decal queue: see upcoming pulls, dedupe, move a rarity to the front, stack, reroll, clear, undo. **Export to CSV**: every pull in the queue (next pull first, with NEW / own / dupe) and the game's odds for every decal in the pool |
| **Mystery Bags** | Lost Bags from Tokyo Death Metro: see what each rarity will give, set any slot, fill all, or reroll from the game's odds |
| **Death Boxes** | See each box's reward and unlock time, open now, change or reroll the reward, add or remove boxes |
| **Waiting Room** | Unlock Waiting Room decorations (wall, floor, pillar, fountain, flag, poster, giant object, neon, potted plant, RC car) and choose which one each spot shows |
| **Defense** | Tokyo Death Metro defense: set the lineup (up to 9 defenders: one wave 5, the other 4) from your freezer fighters, choose the defense alarm and which defender carries it, max the alarm time (5 days) and kidnap protection (12 hours). Only alarms unlocked at your deepest floor can be picked, and the tab stays locked until Tokyo Death Metro is open |
| **Screenshots** | View and export Kiwako's large-stamp photos stored in the save (view/export only; they can't be deleted because the game refers to them) |
| **Dead Fighters** | Browse the dead fighter archive: yours and other players', when and where they died, Kill Coins carried, and stats, gear and decals when the game kept them (view only) |
| **Dates** | Every date in the save, with fixes for time-jump damage (future dates, dates past 2038, overflowed negative dates) |
| Storage | Storage Box contents and capacity; add weapons and armor at a chosen in-game +n (only levels the part can reach are offered; they arrive with full durability and ammo), blueprints, mushrooms, beasts and items; repair and refill ammo on everything stored |
| Rewards | Send to the Reward Box: weapons and armor at a chosen in-game +n (arriving with full durability and ammo), blueprints (normal or unrevealed), items, mushrooms, beasts, decals (marked Premium or Normal), Kill Coins, SPLithium, and Lost Bags of any rarity (random contents from the game's odds, or chosen). Only things the PC game can hand out are offered, and levels an item can't reach are hidden. PS-only parts, blueprints and decals need **Include PS-only** |
| **Quests** | Current quests (progress, complete, drop), take a new quest, and quest history (times taken / cleared) |
| **Stamp Rally** | Kiwako's Tower Stamp Rally, floor by floor (1F-40F is Stamp Rally I, 41F-50F is Stamp Rally II). Set each floor to not stamped, perfect, or off by 1-16 (how far off the stamp landed, as the game stores it); stamp a 10-floor section or every floor at once. **Reset** a single floor, a section or the whole rally: the stamps are cleared and every bonus that includes them can be earned again. The Bonuses table lists all 12 rewards (50,000 Kill Coins for every 5 floors, and the Grim Reaper's Scythe and X-Ray Glasses blueprints for finishing each rally and finishing it perfectly) with your progress and whether the game has already given each one. Set a bonus to **Not given** to earn it again, or use **Send reward** to put it in the Reward Box now |
| **Location** | For a fighter paused mid-run on a Heaven boss floor (quit the game while standing there): move them to another boss floor of the same route that uses the same map. Regular Heaven (TENGOKU) has one boss map every 5 floors from 55F to 450F; each NEO route (D.O.D, W.E, C.W, M.I.L.K) has map A on 55F, 65F ... 135F and map B on 60F, 70F ... 140F, and only floors with the same map are offered, labelled by route and map. The floor you're on is already built, so only floors where its arena can appear are offered (on regular Heaven a Don floor moves only to 100F and up); planned boss floors that move to a floor where their arena can't appear are re-picked for it (a Don below 100F becomes a mid-boss). The waiting boss is set to the new floor's level, and the unopened treasure boxes and boss drop can be rerolled from the new floor's own drop table (deeper floors roll better rewards, including rare blueprints), with **Reroll again**. Your records (deepest floor, clear times) are left as they are. The run's Exploration Bonus is based on the floor you end on, so moving deeper raises the Bloodnium bonus. Confirmed in game; keep a backup. Rolled rewards are hidden until **Show rewards (spoilers)** is ticked; until then the tab only says how many rewards each floor has. Each boss floor's extra-large chest is called a **Legendary Chest**, as on the game's map; rare ones get a yellow **rare** tag (the game shows their text in yellow), blueprints get a **BLUEPRINT** tag, and metals and Death 'Roids are shown in their colour (orange 'Roids and Platinum in orange, 44CE in gold). Don floors have three large chests and mid-boss floors two, as the game places them. **Lock boss floors (confirmed in game):** for a fighter paused anywhere in Heaven, make the run's upcoming boss floors **Don only** (main bosses), **Mid-boss only**, **Screamer Pit only**, or Don or mid-boss. For Dons and mid-bosses you can also pick **one boss** (confirmed in game): COEN, JIN-DIE, GOTO-9 or U-10, or their Mk-2 Dons. A floor that can't have that boss gets its other version (below 100F a Don becomes the same boss as a mid-boss); NEO routes only have their own group's boss, so other floors keep any boss of the kind, and the table marks them. Regular Heaven has no Dons below 100F, so with Don only those floors become mid-boss floors. Each upcoming boss floor's arena is redrawn from the game's own choices for that floor (`master_ref_boss_area_setting`), with its rewards drawn from the floor's tables; the floor you're on and the NEO routes' fixed map B floors stay as they are. It can also write every remaining boss floor of the route; the game keeps them, so the lock lasts the whole run. Choose what the floors it writes get: **all rewards rolled now** (Legendary Chest, large boxes and boss drop, from the floor's own tables), **only the Legendary Chest**, with the game rolling the large boxes and boss drop itself, or **none**, which leaves the boxes and boss drop to the game but gives those floors no Legendary Chest (the game doesn't make one itself). All three confirmed in game. **Spoiler free** works like Legendary Chest only, but the editor never shows what was rolled, even with spoilers on, so you find out in game. Rare Legendary Chests (yellow on the game's map) come up at the game's rate, and a planned floor's own rare flag is never changed. Only the save is changed, never masters.db. The lock is off while the run is set to end. **End the run (confirmed in game):** send the fighter in a run back to the Waiting Room the way the game does when a run ends (Death Bag kept, carried Kill Coins banked up to the Bank's limit, carried Bloodnium added, the run's floor data cleared). This is the fix for saves that crash on load because the game can't resume the run (renewing the Express Pass doesn't fix it); the tab shows what would be lost before you tick it. **Go back to the last boss floor (confirmed in game):** for a run that crashed on a normal (randomly built) floor, which is what makes those saves crash, keep the run instead: the fighter is put back on the run's last boss floor, paused there with its boss already beaten, and the floors after it are played again. The Death Bag, carried Kill Coins and Bloodnium stay. On NEO routes, a last boss floor on map B falls back to the map A floor before it, and the skipped map B floor keeps its rewards |
| **Current Run** | Only shown when the save is in a run (read only). The fighter (HP the game saves as 999,999 is shown as Full), floor and whether the save was paused or closed without pausing; Kill Coins and Bloodnium carried, enemies killed, play time, EXP gained, force-closes; Bank, SPLithium and Bloodnium at the start of the run and now; when the run began, was last resumed and the current floor was entered; the items the run has left in the tower; the fighter's Death Bag; what's on the current floor right now (unopened chests, zombies and Jackals, with the Jackals' rewards behind their own spoilers box); the run's pace (time per floor) and the Haters met on each floor; the map's next boss-floor rewards (behind the Location spoilers setting); and every floor visited with the map it used and when it was cleared. **Export to CSV** saves all of it (the map rewards only when **Show rewards (spoilers)** is ticked) |
| **Collection** | **Magazines** (Tales From The Barbs and the YB Catalogue): set each page to not found, new or read. The game pays 50,000 Kill Coins when you pick up a volume's last page yourself; for volumes finished here, **Send reward** puts that bonus in the Reward Box. **Mushroom and Beast books**: eaten raw / grilled for each entry, with **Eat everything** to complete both books |
| **Jackals** | Experimental. Each Jackal carries one reward, rolled once and kept until you beat it. Pick what it drops from what that Jackal can carry, or reroll it (or all) with the game's own odds. Weapons and armor drop at +0 with full durability and ammo; blueprints can be set to drop unrevealed. Not confirmed in game yet |
| **Stats** | Read only: everything the game counts about your play (totals, floors and travel, Kill Coins and SPLithium earned and spent, kills by enemy type, deaths by cause, TDM record, fighter history) and your most used decals |
| VIP | Express Pass: None, 1-Day or 30-Day, passes held, expiry, auto-renew. **Free Continues:** set how many free continues the continue screen offers per day (all available today), up to 9,999. Confirmed in game. They last until the game's daily reset (the first login of a new day sets them back to 0), so set them again each day |
| **Compare** | Load a second save, see what differs, and copy ticked parts into the save you're editing (account values, fighters with their gear, research, decal stock, Waiting Room decorations, Reward Box and Storage items). You can also choose which account the downloaded save belongs to, to move progress onto another account, or **clone the whole second save onto the account you're editing**: everything comes from the other save, but the account ID, name and Steam/PSN IDs stay yours, so the game loads it as your save. Cloning a PlayStation save onto a PC account warns you first and lists any PS-only content |
| **Raw data** | Read only, for power users: browse the whole save as the game stores it, field by field (click a name to open it, a breadcrumb to go back; big lists 200 at a time). Search keys and values, copy a value or its path, or download any part as `.json`. Numbers that look like dates show the date. **Show with your edits** shows the save exactly as Download would write it. Nothing can be changed here on purpose; the other tabs check every change against the game's rules |
| **JSON compare (advanced)** | For advanced users, read only. Compares two saves field by field the way the game stores them: this save (as loaded, or with your edits as Download would write it) against a second save, the save loaded on the Compare tab, or the other version of this save. Lists of records are matched by their id, so a reordered list isn't reported as changed. Each changed object is shown side by side, a line per field, with changed lines highlighted and unchanged ones folded; filter by section, by kind (changed, only on the left, only on the right) or by path, open any object to browse it side by side, and download the differences as text. **Search** finds keys and values in both saves. Comparing "as loaded" with "with your edits" shows exactly what your edits change. A warning reminds you that editing a save's JSON by hand can corrupt it |

### Save check

When you load a save, a **Save check** panel above the tabs lists anything the editor knows to be wrong. Each entry is a Problem, Warning or Note, links to the tab that deals with it, and many have a one-click fix (applied when you download). Use **Re-check** after making changes.

- **Dates:** dates left by time jumping (in the future, past 2038, or overflowed negative). These can crash the game. Fix: set them to now.
- **Research:**
  - parts missing their "next level" marker (fix included); on a PC save, PS-only parts missing it (fix included, only matters for modded games);
  - blueprints researched past the highest level their part can reach (fix: cap);
  - Funshots that would be counted twice or are higher than your research gives (fix included), and a note when they're lower than your research gives;
  - Armor Skins in use that are no longer unlocked (fix included).
- **Weapons and fighters:**
  - weapon mastery level that doesn't match its points (fix: sync);
  - weapons or armor above their part's highest level (fix: cap);
  - gear a fighter couldn't wear (fix: unequip);
  - fighters with more decal slots, Death Bag or rage than their type, grade and limit break allow (`master_body_detail`; only Skill Masters gain rage, up to 8 at Limit Break 4). The game never writes these; they come from other editors or old editor versions. The save is left as it is unless you use the fix (bring them back within the limits);
  - more decals equipped than the fighter's decal slots (fix: take off the extras; premium decals go back to the stock);
  - stats above the cap for the grade and limit break, counted without the stat bonus (fix: set to the cap), and a saved level that doesn't match the stats and upgrades (fix: recalculate). Fighters taken from other players (CONCILIATE) and DUMMY fighters follow other rules and aren't checked;
  - weapons or armor with more durability, ammo or spare ammo than the part allows (`master_part`; fix: set to the maximum);
  - gear equipped from an item that isn't in the fighter's Death Bag (fix: unequip);
  - fighters over their Death Bag size (a note with **Renew the Express Pass** when it only fits with a pass that ran out);
  - items in two places at once;
  - freezer hangers naming a fighter that isn't in the save (or one already in another hanger) and Storage Box slots naming an item that isn't stored (fix: empty them);
  - fighters added by an older editor without a freezer slot (fix included);
  - more than 9 defenders (fix: keep the first 9);
  - a defense lineup out of step with the defenders: a place naming a fighter who isn't in the save or isn't a defender, two defenders in one place, a defender who isn't in the lineup, or more than one alarm carrier (fix: drop the bad places, send stray defenders back to the freezer, keep one carrier);
  - a defense alarm this masters.db doesn't know (fix: remove it);
  - no fighter, or more than one, set as the fighter in use (fix: keep one, or pick one).
- **Runs:**
  - a fighter whose run was closed or crashed without pausing 3 or more times. The game cuts that run's Bloodnium, and much harder from 10. Fix: reset the count.
  - a save in a run that ended without pausing. The game tries to resume it on load, and saves like this can crash, most likely when it stopped on a normal floor. Fix: **End the run**, or **Go back to the last boss floor** on the Location tab to keep the run (both confirmed in game).
- **Account and items:**
  - Kill Coins or SPLithium over the Bank or Tank limit (the Bank's limits come from `master_safe_level`, the SPLithium tank's from `master_spirit_tank_level`, so a modified masters.db is followed), and a saved Bank or tank limit that doesn't match its level (fix included);
  - decal counts negative or over the cap;
  - Reward Box items in a format the game can't read (fix included), weapons or armor that would arrive with 0 durability (fix included), and items the game can't hand over (fix: remove);
  - death boxes in an old format (fix included);
  - Waiting Room spots with no decoration (or two) in use;
  - items, decals, quests, stew results or Lost Bag rewards this masters.db doesn't know.
- **Notes:** death boxes ready to open, quests ready to report, broken characters or fighter stats repaired while loading.

### Save report

**📋 Save report** (top bar) makes a plain-text summary of the loaded save to paste when asking for help on Reddit or Discord: platform, whether your masters.db matches the stock PC game, account totals, every fighter, the current run (floor, paused or crashed, last boss floor), Funshots against what research gives, and every Save check result. It never includes account, Steam or PSN ids, and **Hide account and fighter names** takes the names out too. **Copy to clipboard** or **Download as .txt**. It says if you have edits that aren't downloaded yet.

### Download history

**🕘 Download history** (top bar) keeps a copy of every save you download, plus the save as you loaded it (the first time you download from it), in this browser. The last 12 are kept, with when they were made, the account, and what changed. **Download again** gives you the file to put back in the game; **Open in editor** loads it to keep editing. Copies stay on your computer, in this browser only (a private window may not keep them); untick **Keep a copy of every download** to stop, and remove entries or clear the list at any time. Your downloaded files are never touched.

### PlayStation saves

The editor detects PlayStation saves. On a PS save, the **Include PS-only** boxes (Research, Decals, Rewards, Waiting Room) start ticked and PS-only content isn't flagged. On a PC save they start unticked and PS-only content is marked so it can be cleaned up.

### Stews

Stew results are pre-rolled and stored in the save as a queue, and the game pulls from the end of that list. Changing odds in masters.db does nothing until the queue runs out. This tab edits the queue itself, so a change applies on your very next stew. It's a browser version of `tools/stew_luck_rarity.py`.

### Dates

Moving the PC clock forward and back, or past January 2038, leaves bad timestamps that can crash the game. The Dates tab compares every date with your PC clock (or a time you choose). It flags the bad ones and can set them to the reference time. Only the flagged dates change. Future login-bonus days are removed rather than duplicated, and expiry timers are only changed if they overflow.

### Layouts

A layout is a saved loadout: the 6 weapon quick slots (and which one is in hand), head, body and legs armor, and decals. The library is kept in your browser, so the same layouts work with any save, and you can export and import it as a `.json` file to move or share it. The exported file is laid out to read: each gear piece on its own line with its in-game name and +level, empty slots labelled, decal names listed, and notes (fields starting with `_`) explaining each part. Make one from scratch, or save a fighter's current loadout as a layout.

To apply one, pick a fighter and where the pieces come from, separately for gear and for decals: **stock** (the fighter's Death Bag, then the Storage Box; the decal stock for decals), **create** (a new copy, with full durability and ammo for gear, and not taken from the decal stock), or stock first and create only what's missing. The usual equipment rules still apply, including stat requirements counted with the layout's decals, and anything that fails is skipped with the reason. Press **Preview** to see every change before it happens and **Undo** to put the fighter, Storage Box and decal stock back. Replacing decals loses normal decals that come off (premium ones go back to stock), so you're asked first.

## Safety

- Everything runs locally in the browser. The only network request is a one-time fetch of [sql.js](https://sql.js.org/) from cdnjs to read masters.db.
- Edits apply only when you download. The file you loaded isn't touched.
- Download history and the remembered masters.db stay in your browser on your computer.
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
README.md                  this file
LICENSE                    GPL-3.0 licence
.nojekyll                  serve files as-is on GitHub Pages
.gitignore                 keeps saves and masters.db out of git
.gitattributes             line-ending settings
```

`.gitignore` blocks `.sav`, `.db` and save `.json` files. Don't commit your save or the game's masters.db.
