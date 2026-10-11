# Contributing

Thanks for helping with the LET IT DIE Offline Save Editor. Bug reports, save files that break the editor (see below), ideas and code are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). The project is licensed under the [GNU GPL v3](LICENSE), and anything you contribute is released under the same license.

## Before anything else

- **Back up your save** before testing anything. A broken save can cost a run.
- Close the game before loading a save in the editor. The game rewrites the save when it exits.

## Reporting a bug

Use the **Bug report** form on the [Issues](../../issues/new/choose) page. The most useful reports say:

1. Your platform (PC or PlayStation) and browser.
2. Which tab or button you used, and the exact steps.
3. What you expected and what actually happened (an error message or a screenshot helps a lot).
4. What the **Save check** panel said after you loaded your save.

**Please do not attach your whole save to a public issue.** A save contains your account data. If a maintainer needs it, they will ask, and you can send a trimmed copy or share it privately.

If the *game* gives an error after you load an edited save, say which file you loaded, where the error appeared (menu, loading, a specific floor) and whether the same save loaded fine before you edited it.

## Suggesting a feature

Use the **Feature request** form. Describe what you want to do in the game, not just the button you imagine. Mention if it has to be safe for online play (it should not be, this is for offline saves only).

## Working on the code

The editor ships as one self-contained `index.html`, but that file is **built** from the files under `src/`. Never edit `index.html` by hand.

1. Fork the repo and create a branch.
2. Edit the files in `src/` (see [src/README.md](src/README.md) for what each file does).
3. Rebuild the page: `node build.js` (needs [Node.js](https://nodejs.org/), any current version).
4. Check it: `node build.js --check` must pass. The same check runs on every push and pull request, and fails if `index.html` is out of date.
5. Open the page in a browser, load a save and masters.db, and try your change. Also load a save and download it without changes: the data must come out the way the game wrote it.
6. Open a pull request using the template.

### Guidelines

- Keep the editor **offline and local**: no analytics, no uploading saves, no new network calls.
- Edits apply only when the user clicks **Download**. Never change the loaded file.
- Prefer small, focused pull requests. Say what you tested and on what kind of save.
- Don't add game data you can't verify. If you aren't sure how a field behaves in the game, say so in the pull request.
- Keep wording friendly and plain. Many users are not technical.

## Questions

Open an issue with the **Question** label, or start a discussion if the repo has Discussions turned on.
