#!/usr/bin/env node
// Round-trip test for the editor's download pipeline (just this one test; tools/run-tests.js runs every test and
// writes a report).
//
// Loads masters.db and each save through the editor's own code (the built index.html, run in Node with a stand-in
// page), then checks two things without making any edit:
//   1. the save Download would write is exactly the save as loaded (buildDownloadRoot() == the loaded JSON), and
//   2. writing that save as a .sav and reading it back gives the same JSON again (the BRG codec).
// A difference means the pipeline changes saves nobody asked it to change.
//
// Usage:
//   node build.js && node tools/roundtrip-test.js --masters <masters.db> <save.sav | save.json | folder> ...
// Folders are searched (two levels deep) for .sav files. Saves are only read, never written.
const fs = require('fs');
const path = require('path');
const { createEditor, roundTrip, collectSaves } = require('./lib/editor-sandbox');

const args = process.argv.slice(2);
const mi = args.indexOf('--masters');
if (mi < 0 || !args[mi + 1]) { console.error('Usage: node tools/roundtrip-test.js --masters <masters.db> <save.sav | folder> ...'); process.exit(2); }
const mastersPath = args[mi + 1];
const inputs = args.filter((a, i) => i !== mi && i !== mi + 1);
if (!inputs.length) { console.error('Give at least one save file or folder.'); process.exit(2); }
const missing = [ mastersPath, ...inputs ].filter(p => !fs.existsSync(p));
if (missing.length) { console.error('Not found: ' + missing.join(', ')); process.exit(2); }
const saves = inputs.flatMap(p => collectSaves(p));

(async () => {
  const ed = await createEditor();
  await ed.loadMasters(mastersPath);
  let failed = 0;
  for (const f of saves) {
    // short name: the save's folder and file name (saves are usually all called brggame.sav)
    const name = path.join(path.basename(path.dirname(f)), path.basename(f));
    try {
      if (!await ed.loadSave(f)) { console.log(`SKIP  ${name}: not loaded as a save`); continue; }
      const r = await roundTrip(ed);
      if (!r.ok) { failed++; console.log(`FAIL  ${name}: ${r.diff}`); } else console.log(`ok    ${name}${r.synced ? ' (defense lineup copies brought in step with the fighters, as intended)' : ''}`);
    } catch (err) { failed++; console.log(`ERROR ${name}: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err}`); }
  }
  console.log(`\n${saves.length - failed} of ${saves.length} save${saves.length === 1 ? '' : 's'} round-trip unchanged.`);
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err.message || err); process.exit(2); });
