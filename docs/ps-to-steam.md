# Moving a PlayStation save to Steam

This guide takes your LET IT DIE progress from a PS4 or PS5 and puts it on the Steam (PC) Offline Edition: fighters, gear, research, decals, money, quests and everything else.

It is a one-way copy. Your PlayStation save is not changed, and you can keep playing on the console afterwards. The two saves do not stay in sync.

## How it works, in short

A save holds two things: your progress, and the account it belongs to. A PlayStation save carries your PlayStation account's ids, not your Steam ones, so it should not be dropped into the Steam folder as it is.

The editor's **Clone** button solves this. You load a save made by your own Steam game, load the PlayStation save next to it, and the editor builds a new save with **all the progress from PlayStation** on **your Steam account**.

## What you need

- A PS4 or PS5 with your LET IT DIE save.
- A USB drive formatted FAT32 or exFAT (not set up as "extended storage").
- LET IT DIE Offline Edition installed on Steam, started at least once (see Part 3).
- A free account on [garlicsaves.com](https://garlicsaves.com), to decrypt the PlayStation save.
- The editor: https://oberlinx.github.io/let-it-die-save-editor/

No PlayStation Plus subscription is needed.

## Before you start

- **Finish your run on the console first.** Take your fighter back to the Waiting Room before you copy the save. A save taken in the middle of a run can be moved, but it is the most likely kind to cause trouble.
- **Keep backups.** You will make two: the PlayStation save in Part 1 and the Steam save in Part 3. Do not skip them. They are your way back if anything goes wrong.

## Part 1: Copy the save from the console to USB

LET IT DIE Offline Edition is a PS4 game. A PS5 runs it through backwards compatibility, so the save is a PS4 save on both consoles and can be copied to USB.

1. Plug the USB drive into the console.
2. Go to **Settings > Saved Data and Game/App Settings > Saved Data (PS4)**.
3. Copy the save to the drive:
   - **PS4:** choose **Upload or Delete from Console Storage > Copy to USB Drive**.
   - **PS5:** choose **Console Storage**, then the **Copy to USB Drive** tab.
4. Tick the LET IT DIE save and press **Copy**.
5. Plug the drive into your computer. You will see a folder called `PS4`.
6. **Copy the whole `PS4` folder somewhere safe.** This is your PlayStation backup. Never edit it.

## Part 2: Decrypt the PlayStation save

The save on the USB drive is encrypted. The editor cannot read it until it is decrypted.

1. Log in at [garlicsaves.com](https://garlicsaves.com). Decrypting does not need a profile.
2. Open **Decrypt**.
3. Drop in the two files from your USB copy: `savedata.bin` and the matching `savedata` file. They are inside `PS4/SAVEDATA/<a 16-character folder>/CUSA03769/`. A zip holding both also works.
4. Leave **Include sce_sys folder** ticked and **Ignore second-layer checks** unticked.
5. Click **Start Decrypt** and download the result.
6. Unzip it. You get `brggame.sav` and a folder called `sce_sys`.

The `brggame.sav` from this step is your **PlayStation save**. You only need that one file for the rest of this guide. Give it a name you will recognise, such as `playstation.sav`, so you do not mix it up with the Steam save later.

## Part 3: Get a save from your own Steam game

The editor needs a save that already belongs to your Steam account. If you have played the Steam version, you have one. If not:

1. Start LET IT DIE on Steam and play until you reach the Waiting Room.
2. Quit the game from its menu. The game writes the save when it exits.

Then find the save:

1. In Steam, right-click the game and choose **Manage > Browse local files**.
2. Open the `Savedata` folder, then the folder inside it named with a 17-digit number. That number is your Steam ID.
3. The save is the file `brggame.sav`.

The full path looks like this:

```
...\steamapps\common\LET IT DIE\Savedata\<your 17-digit Steam ID>\brggame.sav
```

**Copy `brggame.sav` somewhere safe.** This is your Steam backup.

Make sure the game is closed before you go on.

## Part 4: Clone the PlayStation save onto your Steam account

1. Open the editor.
2. Click **1. Load masters.db** and pick it from `...\steamapps\common\LET IT DIE\BrgGame\Content\masters.db`.
3. Click **2. Load your save** and pick your **Steam** `brggame.sav` from Part 3. This must be the Steam one: it decides which account the result belongs to.
4. Open the **Tools** group and the **Compare** tab.
5. Click **Load second save (.sav or .json)** and pick your **PlayStation** save from Part 2.
6. A box called **Clone the whole save** appears. Read it. It names both saves and says which account stays. It should say the other save is a PlayStation save and that your account is PC (Steam). If it has them the wrong way round, reload the page and start Part 4 again.
7. Click the **Clone ...** button, then click it again to confirm.

The editor now shows the PlayStation progress on your Steam account. A notice at the top of the Compare tab says what was done. Nothing has been written to disk yet.

## Part 5: Clean up PlayStation-only content

Some weapons, armor, decals and decorations exist only in the PlayStation version. A normal Steam game does not have them. After cloning, the notice on the Compare tab lists every one it found and where it is.

If the list is empty, skip to Part 6.

Otherwise remove them:

- **Decals:** open **Items > Decals**. A warning lists the PlayStation-only decals in the save. Use **Set them to 0**.
- **Reward Box:** the **Save check** lists Reward Box items the PC game cannot hand over, with a button to remove them.
- **Gear:** remove PlayStation-only weapons and armor from **Items > Storage** and from each fighter's Death Bag on the **Fighters** tab. Unequip a piece first if a fighter is wearing it.
- **Decals on fighters:** take PlayStation-only decals off any fighter that has them equipped.

PlayStation-only research and Waiting Room decorations are listed too. The editor has no one-click removal for those. They are items the PC game has no use for; see the note under "If something goes wrong" if they cause trouble.

If your PC game is modded to include the PlayStation content, you can leave all of it in place.

## Part 6: Check and download

1. Look at the **Save check** in the status bar at the bottom. Click it to step through anything marked Problem or Warning, and use the fix buttons it offers.
2. Click **Download .sav**.
3. A review window lists what will change compared with the Steam save you loaded. Because you cloned a whole save, the list is long. That is expected.
4. Confirm the download. The file is named `brggame_<date>_<time>.sav`.

## Part 7: Put the save into the Steam game

1. Make sure the game is closed.
2. Rename the downloaded file to `brggame.sav`.
3. Copy it into `...\steamapps\common\LET IT DIE\Savedata\<your 17-digit Steam ID>\`, replacing the file that is there. You already backed that one up in Part 3.
4. Start the game.

**Steam Cloud:** the game uses Steam Cloud. If Steam shows a message that your local save and the cloud save differ, choose the **local** file, which is the one you just put there. Choosing the cloud copy brings back your old Steam save.

## Part 8: Check it in the game

Before you delete any backup:

- Open the Fighter Freezer and check your fighters and what they carry.
- Check your Kill Coins, SPLithium and Storage Box.
- Take a fighter up one floor and come back, then quit and start the game again to confirm the save still loads.

Keep both backups until you have played for a while without trouble.

## If something goes wrong

- **The game starts a new account, or shows your old Steam progress.** The file is in the wrong place or has the wrong name. It must be called exactly `brggame.sav` and sit inside the folder named with your 17-digit Steam ID. Also check the Steam Cloud note in Part 7.
- **The editor refuses the PlayStation file** (for example "not a LET IT DIE save"). You loaded the encrypted PlayStation file. Go back to Part 2 and load the `brggame.sav` that garlicsaves gave you.
- **The Clone box has the accounts the wrong way round.** You loaded the PlayStation save first. Reload the page, load the Steam save with button 2, and load the PlayStation save on the Compare tab.
- **The game crashes or resets the save on loading.** Put your Steam backup from Part 3 back. Then try again from Part 4, and this time remove all PlayStation-only content in Part 5 and fix everything the Save check reports. If the PlayStation save was taken mid-run, return to the Waiting Room on the console and take a fresh copy.
- **Something is missing in the game.** PlayStation-only items do not appear in a normal Steam game. Everything else should be there; compare with the list in the editor's review window.
- **Still stuck?** In the editor, open **Save report**, copy the text and post it with your question. It contains no account, Steam or PSN ids.

## Going back

To undo the transfer, close the game and copy your Steam backup from Part 3 back into the Steam ID folder.

Your PlayStation save was never changed. If you later want to put an edited save back on the console, that is a different process: see "PlayStation saves: step by step" in the [README](../README.md#playstation-saves-step-by-step).
