# What's been confirmed in the game

The automated tests (`run-tests.cmd`, see [src/README.md](../src/README.md#tests)) prove that a save the editor writes reads back, loads in the editor and passes its Save check. They can't prove the *game* accepts it. This list says which features someone has checked in the game, so you know what to try next and which warnings in the editor can go once a feature is confirmed.

When you test one in game, keep a backup of your save, then note the date, the save (route and floor for Location features) and what happened. Move the line up to **Confirmed**, and drop the matching "not yet tested" text in the editor (the file is named next to each line).

## Not yet tested in game

| Feature | Where | What to check | Editor file |
|---|---|---|---|
| Remove boss floors planned past the game's own | Location tab, Lock boss floors (with "Leave as rolled"), or the Save check's "Let the game plan them" | After the download, the game plans the next boss floors itself as you go, and the floors still planned (the next 3) play as before | `14-location-floors-runs.js` (the "Not yet tested in game" note), `29-save-check.js` |
| Defense lineup, alarm and kidnap protection edits | Defense tab | Defenders are on defense in game, the alarm works, and kidnap protection holds | `31-compare-and-copy.js` ("Not yet confirmed in game") |
| Adding new Death Boxes | Death Boxes tab | New boxes appear and open with what was set | `27-lost-bags-death-boxes.js` |
| Holding more than 3 quests at once | Quests tab | All of them track progress and pay out | `12-quests.js` |
| Boss floor lock: Completely random | Location tab | Every upcoming boss floor is a Don, mid-boss or Screamer Pit as drawn, and the run plays them | `14-location-floors-runs.js` |
| Stews: Rebalance (pity) | Stews tab | After Apply, the next stews follow the preview: good pulls, top pulls and NEW decals at the spacing set | `25-stews.js` |
| Restroom: releasing a prisoner while lowering the size | Account tab, Restroom | Lowering the size over a cell with a prisoner and choosing to release it first frees them and shows the smaller restroom | `38-restroom.js` |
| Carried SPLithium edit | Current Run tab | The fighter starts the run with the SPLithium you set (Kill Coins and Bloodnium are confirmed) | `18-current-run.js` |
| Carried amounts on a crashed run put back on a boss floor | Current Run tab with Location's rewind | The rewound run loads with the edited Kill Coins, SPLithium and Bloodnium | `18-current-run.js` |

## Confirmed in game

| Feature | Confirmed | Notes |
|---|---|---|
| Floor move to another boss floor of the same route and map | yes | The Exploration Bonus follows the floor you end on |
| Floor move that turns a Screamer Pit into its twin ("pit converted") | 2026-10-15 | |
| Lock boss floors: Don, mid-boss, Screamer Pit, or Don or mid-boss, for the rest of the run | yes, whole run | A D.O.D. run locked at 52F built the later floors as locked |
| Lock one particular boss | 2026-10-07 | |
| Lock rewards "Roll all now" | yes | |
| Lock rewards "Legendary Chest now, the rest rolled by the game" | 2026-10-05 | 55F had the written Legendary Chest and the mid-boss dropped a reward |
| Lock rewards "None" | 2026-10-05 | The large boxes and boss drop are rolled by the game, but there's no Legendary Chest |
| End the run | yes | The fighter goes back to the Waiting Room with the Death Bag; also fixes saves that crash on load mid-run |
| Go back to the last boss floor (a run that crashed on a normal floor) | 2026-10-05, regular Heaven | Not yet tried on the NEO routes |
| Jackal loot | 2026-10-08 | Holds only until the game builds the next floor |
| Taking, completing and dropping quests | yes | Progress counts and rewards pay out |
| Free Continues per day | yes | |
| Edit the Kill Coins and Bloodnium a fighter carries in a saved run | 2026-11-07 | A save paused on an 80F boss floor with 5,000,000 Kill Coins and 99,999 Bloodnium carried loaded fine. On return the bank filled to about its 2.5 million limit and the rest was lost, which is what the editor's warning says |
| Store purchases left refill (Current Run tab) | 2026-11-11 | A save with 2 of 3 store purchases left, set to 3 with the editor, showed 3/3 in the store. The count is the save flag `SGF_PRAR_RESEARCH_BUYABLE_COUNT` (gameflg) |
| Restroom size 1-6 | 2026-10-26 | Lowering 6 to 1 and back up with the dropdown worked |
| Release a prisoner | 2026-10-26 | A save with three prisoners: the game released all three with no error |
| Rewards tab: ammo values (loaded and spare) | yes | Checked by claiming test rewards |
| Mystery Bags order (the game takes the first entry) | yes | |
| Funshots counted twice by the game's one-time setup | seen in game | Why the Save check warns before that setup has run |
| Clone the whole save (Compare tab) | 2026-10-15 | |
| Clone a PlayStation save onto a Steam account ([guide](ps-to-steam.md)) | 2026-10-15 | |
| Copying fighters, research, decals and items between saves (Compare tab) | 2026-10-15 | |
| I'm feeling lucky (Location tab) | 2026-10-15 | |
| Max everything safe | 2026-10-15 | |
| Max all fighters | 2026-10-15 | |
| The Save check's fix buttons | 2026-10-15 | Every one tried so far worked; if one you haven't used before goes wrong, note which |
