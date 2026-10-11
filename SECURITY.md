# Security Policy

## What this project is

A save editor that runs entirely in your browser. Your save and masters.db are read locally and are never uploaded. The only network request is a one-time download of the [sql.js](https://sql.js.org/) library from cdnjs.

## Reporting a vulnerability

If you find something that could harm a user (for example a way the page could send a save somewhere, run code from a save file, or damage a save without telling the user), please **do not open a public issue**.

Report it privately through GitHub: go to the **Security** tab of the repository and choose **Report a vulnerability**
(https://github.com/oberlinx/let-it-die-save-editor/security/advisories/new).

Please include what you found, how to reproduce it, and which browser and which version of the page (the date of the latest commit on GitHub) you tested.

You can expect an answer within about a week. This is a hobby project run by one person, so fixes may take longer, but real problems will be taken seriously and you will be credited if you want.

## Supported versions

Only the current version on the `main` branch and the live site at https://oberlinx.github.io/let-it-die-save-editor/ are supported.

## Not a security issue

A save that the game rejects, a wrong value, or a crash after editing is a **bug**, not a vulnerability. Please use the Bug report form for those.
