#!/usr/bin/env node
// Runs every editor test on this PC and writes a report you can hand to Claude (or read yourself).
//
//   node tools/run-tests.js            (or double-click run-tests.cmd in the repo folder)
//
// Tests:
//   1. Build check   index.html matches the src/ files (node build.js --check).
//   2. Round trip    each save loads and, with no edits, Download writes it back exactly (see tools/lib/editor-sandbox.js).
//   3. Save check    the editor's Save check, run on each save; its problems and warnings are listed in the report.
//   4. Edit tests    the main edits (floor move, boss floor lock, removing pre-planned floors, End the run, Max
//                    everything, Max all fighters, the Save check's fix buttons, Clone) made on a sample of saves; each
//                    edited save must download, read back and load again with no new Save check problem or warning
//                    (see tools/lib/edit-scenarios.js).
//
// Where masters.db and the saves are comes from tools/tests.config.json (made on the first run; edit it to change).
// The report goes to test-reports/report-<date>_<time>.md, and a copy to test-reports/latest.md. Saves are only
// read, never changed. The report names your save folders and fighters, and stays on this PC unless you share it.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { createEditor, roundTrip, collectSaves, plain, kindOf, ROOT } = require('./lib/editor-sandbox');
const { SCENARIOS, runEdits, runClone } = require('./lib/edit-scenarios');

const CONFIG = path.join(__dirname, 'tests.config.json');
const REPORTS = path.join(ROOT, 'test-reports');
const started = new Date();

// ---- config: made on the first run from the usual places, then read from the file ----
function defaultConfig() {
  const steam = [ 'C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary', 'E:\\SteamLibrary', 'D:\\Steam' ]
    .map(d => path.join(d, 'steamapps', 'common', 'LET IT DIE', 'BrgGame', 'Content', 'masters.db')).find(p => fs.existsSync(p));
  const home = os.homedir();
  const saves = [ path.join(home, 'Desktop'), path.join(home, 'Downloads'), 'D:\\Downloads' ].filter(p => fs.existsSync(p));
  return {
    _help: 'masters: the masters.db to test with (the game\'s own is in the LET IT DIE Content folder). saves: files or folders to test; folders are searched "depth" levels deep for .sav files. includeNotes: also list Save check notes in the report, not only problems and warnings. editSaves: how many saves get the edit tests (a number, or "all"; saves paused in a run go first). clones: how many pairs of saves to clone onto each other.',
    masters: steam || '',
    saves,
    depth: 2,
    includeNotes: false,
    editSaves: 30,
    clones: 6
  };
}
let firstRun = false;
if (!fs.existsSync(CONFIG)) { fs.writeFileSync(CONFIG, JSON.stringify(defaultConfig(), null, 2) + '\n'); firstRun = true; }
const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
if (firstRun) console.log(`Made ${path.relative(ROOT, CONFIG)} with the places found on this PC. Edit it to test other saves.\n`);
if (!cfg.masters || !fs.existsSync(cfg.masters)) { console.error(`masters.db not found (${cfg.masters || 'not set'}). Set "masters" in ${CONFIG}.`); process.exit(2); }

// ---- small helpers ----
const short = f => path.join(path.basename(path.dirname(f)), path.basename(f));
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'ignore' ] }).trim(); } catch (e) { return ''; } };
const pad = n => String(n).padStart(2, '0');
const stamp = `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())}_${pad(started.getHours())}${pad(started.getMinutes())}${pad(started.getSeconds())}`;
const md = s => String(s).replace(/\|/g, '\\|');

(async () => {
  // 1. build check
  let build;
  try { build = { ok: true, text: execFileSync(process.execPath, [ path.join(ROOT, 'build.js'), '--check' ], { cwd: ROOT, encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ] }).trim() }; }
  catch (e) { build = { ok: false, text: ((e.stdout || '') + (e.stderr || '')).trim() || e.message }; }
  console.log(`Build check: ${build.ok ? 'ok' : 'FAILED'} (${build.text})`);

  // the saves, each distinct file once
  const all = cfg.saves.flatMap(p => collectSaves(p, cfg.depth == null ? 2 : cfg.depth));
  const seen = new Map(), saves = [];
  for (const f of all) {
    let h;
    try { h = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'); } catch (e) { continue; }
    if (seen.has(h)) { seen.get(h).copies.push(f); continue; }
    const s = { file: f, copies: [] }; seen.set(h, s); saves.push(s);
  }
  console.log(`Saves: ${saves.length} different files (${all.length - saves.length} duplicate copies skipped)\n`);

  // 2 + 3. round trip and Save check, per save
  const ed = await createEditor();
  await ed.loadMasters(cfg.masters);
  const levels = cfg.includeNotes ? [ 'problem', 'warning', 'note' ] : [ 'problem', 'warning' ];
  for (const [ i, s ] of saves.entries()) {
    const t0 = Date.now();
    ed.pageErrors.length = 0;
    try {
      if (!await ed.loadSave(s.file)) s.status = 'skip';
      else {
        const r = await roundTrip(ed);
        s.status = r.ok ? 'ok' : 'fail'; s.diff = r.diff; s.synced = r.synced;
        s.findings = ed.run('HEALTH.items').map(it => ({ level: it.level, text: plain(it.text) }));
        const so = ed.run('RAW_SAV_ROOT.soul') || {};
        s.uid = String(ed.run('RAW_SAV_MAIN_UID') || '');
        s.where = so.pause ? `${so.pause} ${so.flrid || ''}`.trim() : 'not in a run';
      }
    } catch (err) { s.status = 'error'; s.diff = err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : String(err); }
    s.pageErrors = [ ...ed.pageErrors ];
    s.ms = Date.now() - t0;
    const n = { problem: 0, warning: 0 }; for (const f of s.findings || []) if (f.level in n) n[f.level]++;
    console.log(`[${String(i + 1).padStart(String(saves.length).length)}/${saves.length}] ${s.status.toUpperCase().padEnd(5)} ${short(s.file)}${s.status === 'fail' || s.status === 'error' ? ' -- ' + s.diff : ''}${n.problem || n.warning ? `  (Save check: ${n.problem} problem${n.problem === 1 ? '' : 's'}, ${n.warning} warning${n.warning === 1 ? '' : 's'})` : ''}`);
  }

  // 4. edit tests on a sample: saves paused in a run first (most edits apply to them), then the rest, in list order
  const loadable = saves.filter(s => s.findings);
  const nEdit = cfg.editSaves === 'all' ? loadable.length : Math.max(0, Number(cfg.editSaves == null ? 30 : cfg.editSaves) || 0);
  const editSet = [ ...loadable.filter(s => s.where !== 'not in a run'), ...loadable.filter(s => s.where === 'not in a run') ].slice(0, nEdit);
  if (editSet.length) console.log(`\nEdit tests on ${editSet.length} save${editSet.length === 1 ? '' : 's'}:`);
  for (const [ i, s ] of editSet.entries()) {
    s.edits = await runEdits(ed, s.file);
    const bad = s.edits.filter(e => e.status === 'fail');
    console.log(`[${String(i + 1).padStart(String(editSet.length).length)}/${editSet.length}] ${bad.length ? 'FAIL ' : 'ok   '} ${short(s.file)} (${s.edits.length} edit${s.edits.length === 1 ? '' : 's'})${bad.map(e => `\n      ${e.name}: ${e.error}`).join('')}`);
  }
  // clones: each sampled save gets the next save from another account cloned onto it
  const clones = [];
  const nClone = Math.max(0, Number(cfg.clones == null ? 6 : cfg.clones) || 0);
  for (let i = 0; i < loadable.length && clones.length < nClone; i++) {
    const a = loadable[i], b = loadable.slice(i + 1).find(x => x.uid && x.uid !== a.uid);
    if (!b) continue;
    const r = await runClone(ed, a.file, b.file);
    if (r) { clones.push(Object.assign(r, { a: short(a.file), b: short(b.file) })); console.log(`clone ${r.status === 'ok' ? 'ok  ' : 'FAIL'} ${short(b.file)} onto ${short(a.file)}${r.error ? ' -- ' + r.error : ''}`); }
  }

  // ---- report ----
  const count = st => saves.filter(s => s.status === st).length;
  const tested = saves.filter(s => s.findings);
  const withLevel = lv => tested.filter(s => s.findings.some(f => f.level === lv)).length;
  const L = [];
  L.push(`# Editor test report`, '');
  L.push(`- **When:** ${started.toLocaleString()} (took ${Math.round((Date.now() - started) / 1000)} s)`);
  const head = git('rev-parse', '--short', 'HEAD'), dirty = git('status', '--porcelain', '--', 'src', 'index.html', 'build.js', 'tools');
  L.push(`- **Editor:** commit ${head || 'unknown'}${dirty ? ' with uncommitted changes' : ''} (${git('log', '-1', '--format=%s') || '?'})`);
  const mst = fs.statSync(cfg.masters);
  L.push(`- **masters.db:** ${cfg.masters} (${(mst.size / 1048576).toFixed(1)} MB, modified ${mst.mtime.toLocaleDateString()})`);
  L.push(`- **Node** ${process.version}, sql.js ${ed.sqlJsVersion}, ${os.type()} ${os.release()}`);
  L.push(`- **Saves:** ${saves.length} different files from ${cfg.saves.join(', ')} (${all.length - saves.length} duplicate copies skipped)`, '');

  L.push(`## Summary`, '', `| Test | Result |`, `|---|---|`);
  L.push(`| Build check | ${build.ok ? 'ok' : '**FAILED**'}: ${md(build.text)} |`);
  L.push(`| Round trip | ${count('ok')} ok, ${count('fail') ? `**${count('fail')} failed**` : '0 failed'}, ${count('error') ? `**${count('error')} errors**` : '0 errors'}, ${count('skip')} skipped (not a save) |`);
  L.push(`| Save check | ${withLevel('problem')} save${withLevel('problem') === 1 ? '' : 's'} with problems, ${withLevel('warning')} with warnings, out of ${tested.length} |`);
  const edited = saves.filter(s => s.edits), editRuns = edited.flatMap(s => s.edits);
  const ec = st => editRuns.filter(e => e.status === st).length, cf = clones.filter(c => c.status !== 'ok').length;
  L.push(`| Edit tests | ${ec('ok')} ok, ${ec('fail') ? `**${ec('fail')} failed**` : '0 failed'}, ${ec('skip')} skipped, on ${edited.length} save${edited.length === 1 ? '' : 's'} |`);
  L.push(`| Clone | ${clones.length - cf} ok, ${cf ? `**${cf} failed**` : '0 failed'} (${clones.length} pair${clones.length === 1 ? '' : 's'}) |`);
  const pe = saves.filter(s => s.pageErrors.length).length;
  L.push(`| Page errors | ${pe ? `**${pe} save${pe === 1 ? '' : 's'}** logged errors` : 'none'} |`, '');

  const bad = saves.filter(s => s.status === 'fail' || s.status === 'error');
  if (bad.length) {
    L.push(`## Round-trip failures`, '', 'Download would change these saves without any edit (or the test crashed on them):', '');
    for (const s of bad) L.push(`- **${md(short(s.file))}** (${s.status}): \`${s.diff}\`  `, `  ${s.file}`);
    L.push('');
  }

  const editBad = edited.flatMap(s => s.edits.filter(e => e.status === 'fail').map(e => Object.assign({ save: short(s.file), file: s.file }, e)));
  if (editBad.length || cf) {
    L.push(`## Edit test failures`, '', 'The edited save failed to download, read back or load, the edit didn\'t take, or the Save check found something new after it. Rolls are random: run the tests again to see if it repeats.', '');
    for (const e of editBad) L.push(`- **${md(e.name)}** on **${md(e.save)}**${e.label ? ` (${md(e.label)})` : ''}: ${md(e.error)}  `, `  ${e.file}`);
    for (const c of clones.filter(x => x.status !== 'ok')) L.push(`- **Clone** of **${md(c.b)}** onto **${md(c.a)}**: ${md(c.error)}`);
    L.push('');
  }
  if (edited.length) {
    L.push(`## Edit tests by kind`, '', `| Edit | Saves it applied to | ok | Failed | Skipped |`, `|---|---|---|---|---|`);
    for (const sc of SCENARIOS) {
      const runs = editRuns.filter(e => e.name === sc.name);
      L.push(`| ${md(sc.name)} | ${runs.length} | ${runs.filter(e => e.status === 'ok').length} | ${runs.filter(e => e.status === 'fail').length} | ${runs.filter(e => e.status === 'skip').length} |`);
    }
    L.push(`| Clone | ${clones.length} pairs | ${clones.length - cf} | ${cf} | 0 |`, '');
  }

  // Save check findings grouped by kind, most common first
  const kinds = new Map();
  for (const s of tested) for (const f of s.findings) {
    if (!levels.includes(f.level)) continue;
    const k = f.level + '|' + kindOf(f.text);
    if (!kinds.has(k)) kinds.set(k, { level: f.level, example: f.text, saves: [] });
    kinds.get(k).saves.push(short(s.file));
  }
  const order = { problem: 0, warning: 1, note: 2 };
  const groups = [ ...kinds.values() ].sort((a, b) => order[a.level] - order[b.level] || b.saves.length - a.saves.length);
  L.push(`## Save check findings`, '');
  if (!groups.length) L.push(`No ${levels.join(' or ')} found in any save.`, '');
  for (const g of groups) {
    L.push(`### ${g.level === 'problem' ? 'Problem' : g.level === 'warning' ? 'Warning' : 'Note'} in ${g.saves.length} save${g.saves.length === 1 ? '' : 's'}`, '');
    L.push(`> ${g.example.length > 600 ? g.example.slice(0, 600) + '…' : g.example}`, '');
    L.push(`Saves: ${g.saves.slice(0, 12).map(md).join(', ')}${g.saves.length > 12 ? ` and ${g.saves.length - 12} more` : ''}`, '');
  }

  if (pe) {
    L.push(`## Page errors`, '', 'The editor logged these errors while loading or checking:', '');
    for (const s of saves.filter(x => x.pageErrors.length)) L.push(`- **${md(short(s.file))}**: ${s.pageErrors.slice(0, 3).map(e => '`' + e.slice(0, 200) + '`').join('; ')}`);
    L.push('');
  }

  L.push(`## Every save`, '', '<details><summary>Show the full list</summary>', '', `| Save | Run state | Round trip | Problems | Warnings | Notes | Time |`, `|---|---|---|---|---|---|---|`);
  for (const s of saves) {
    const n = { problem: 0, warning: 0, note: 0 }; for (const f of s.findings || []) n[f.level]++;
    L.push(`| ${md(short(s.file))}${s.copies.length ? ` (+${s.copies.length} cop${s.copies.length === 1 ? 'y' : 'ies'})` : ''} | ${md(s.where || '')} | ${s.status}${s.synced ? ' (lineup synced)' : ''} | ${n.problem} | ${n.warning} | ${n.note} | ${(s.ms / 1000).toFixed(1)} s |`);
  }
  L.push('', '</details>', '');

  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, `report-${stamp}.md`);
  fs.writeFileSync(out, L.join('\n'));
  fs.copyFileSync(out, path.join(REPORTS, 'latest.md'));
  const failedAny = !build.ok || bad.length || editBad.length || cf;
  console.log(`\n${failedAny ? 'Some tests FAILED.' : 'All tests passed.'} Report: ${path.relative(ROOT, out)} (also test-reports/latest.md)`);
  console.log('To share it with Claude, attach test-reports/latest.md in the chat (type @ and pick the file).');
  process.exit(failedAny ? 1 : 0);
})().catch(err => { console.error('\nThe test run stopped: ' + (err.message || err)); process.exit(2); });
