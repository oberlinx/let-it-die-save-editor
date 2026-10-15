// Edit tests: each scenario makes one of the editor's edits on a loaded save the way its button does (by setting the
// same state), then runEdit() builds the download, writes and reads back the .sav, loads it into the editor again, and
// checks it. An edit fails when:
//   - the download can't be built, written, read back or loaded,
//   - the edit didn't do what it's for (the scenario's own check),
//   - or the edited save's Save check has a problem or warning the save didn't have before the edit.
// Rolls are random, so a failure names the save and the scenario; run the tests again to see if it repeats.
const { firstDiff, kindOf, plain } = require('./editor-sandbox');

// kinds of the Save check problems and warnings on the save loaded now (notes don't count: an edit may add one on purpose)
const problemKinds = ed => new Set(ed.run('HEALTH.items').filter(it => it.level === 'problem' || it.level === 'warning').map(it => it.level + ': ' + kindOf(it.text)));
// the Save check's own wording for one of those kinds, shortened, for a failure message
const findingText = (ed, k) => { const it = ed.run('HEALTH.items').find(x => x.level + ': ' + kindOf(x.text) === k); const t = it ? plain(it.text) : k; return `${it ? it.level : ''} "${t.length > 160 ? t.slice(0, 160) + '…' : t}"`; };
const hvn = root => root && root.soul && root.soul.hvntrinfo;
const hvnList = root => Array.isArray(hvn(root)) ? hvn(root) : [];

const SCENARIOS = [
  {
    name: 'Floor move',
    // paused on a Heaven boss floor with somewhere to go: the deepest floor offered
    applies: ed => ed.run('flmTargets()').length > 0,
    apply(ed) {
      const t = ed.run('flmTargets()').slice().sort((a, b) => b.no - a.no)[0];
      ed.run('flmSync()');
      const F = ed.run('FLOOR_MOVE');
      F.target = t.id; F.reroll = true; F.rolls = ed.run('flmRoll')(t.id); F.past = [];
      return { label: `to ${t.no}F`, target: t.id };
    },
    check: (ctx, built) => built.soul.flrid === ctx.target ? '' : `the fighter is on ${built.soul.flrid}, not ${ctx.target}`
  },
  {
    name: 'Boss floor lock (Don only, every remaining floor)',
    applies: ed => { const s = ed.run('RAW_SAV_ROOT.soul'); return !!(s && s.pause && s.stgid === 'S_HVN' && ed.run('AP').hvnBossAreas && ed.run('AP').hvnBossAreas.length); },
    apply(ed) {
      ed.run('blkSync()');
      const B = ed.run('BOSS_LOCK');
      B.mode = 'don'; B.extend = true; B.rewards = 'roll'; B.plan = null;
      const p = ed.run('blkPlanFresh()');
      const want = p ? p.items.filter(it => it.entry).map(it => ({ id: it.floor.id, ref: it.entry.refareaid })) : [];
      return { label: `${want.length} floor${want.length === 1 ? '' : 's'} written`, want, skip: !want.length && 'nothing to write' };
    },
    check(ctx, built) {
      const L = hvnList(built);
      const miss = ctx.want.filter(w => !L.some(e => e.flrid === w.id && e.refareaid === w.ref));
      return miss.length ? `${miss.length} planned floor${miss.length === 1 ? ' is' : 's are'} missing from the download (first ${miss[0].id})` : '';
    }
  },
  {
    name: 'Remove pre-planned floors',
    applies: ed => { const s = ed.run('RAW_SAV_ROOT.soul'); return !!(s && s.pause && s.stgid === 'S_HVN') && ed.run('blkExtraPlanned(blkFrom())').length > 0; },
    apply(ed) {
      ed.run('blkSync()');
      const n = ed.run('blkExtraPlanned(blkFrom())').length;
      ed.run('BOSS_LOCK').clear = true;
      return { label: `${n} floor${n === 1 ? '' : 's'} removed` };
    },
    check(ctx, built, ed) {
      const beyond = ed.run('blkBeyondGame')(built.soul.flrid);
      const left = hvnList(built).filter(e => beyond.has(e.flrid));
      return left.length ? `${left.length} floor${left.length === 1 ? ' is' : 's are'} still planned past the game's own` : '';
    }
  },
  {
    name: 'End the run',
    applies: ed => !!ed.run('runEndInfo(RAW_SAV_ROOT)'),
    apply(ed) { const R = ed.run('RUN_END'); R.root = ed.run('RAW_SAV_ROOT'); R.on = true; return { label: 'fighter sent home' }; },
    check(ctx, built) {
      const s = built.soul;
      if (s.pause) return `the save is still paused (${s.pause})`;
      if (hvnList(built).length) return 'the run\'s boss floor plan was left';
      return '';
    }
  },
  {
    name: 'Max everything safe',
    applies: ed => !!ed.run('SAVE'),
    apply(ed) {
      const rows = ed.run('uiMaxRows()').filter(r => r.on);
      for (const r of rows) r.apply();
      return { label: `${rows.length} row${rows.length === 1 ? '' : 's'}`, skip: !rows.length && 'already at the limits' };
    },
    check: () => ''
  },
  {
    name: 'Max all fighters',
    applies: ed => !!ed.run('SAVE') && ed.run('arr(SAVE.soul.chrs)').some(c => c && c.state !== 'ENEMY' && c.state !== 'DUMMY'),
    apply(ed) { ed.run('maxAllFighters()'); return { label: 'every fighter' }; },
    check: () => ''
  },
  {
    name: 'Save check fixes',
    applies: ed => ed.run('HEALTH.items').some(it => it.fix),
    apply(ed) {
      const items = ed.run('HEALTH.items').filter(it => it.fix);
      const fixed = [];
      for (const it of items) { it.fix.run(); fixed.push({ level: it.level, kind: kindOf(it.text) }); }
      return { label: `${fixed.length} fix${fixed.length === 1 ? '' : 'es'}`, fixed };
    },
    // every problem or warning a fix was pressed for is gone after the reload
    check(ctx, built, ed) {
      const now = new Set(ed.run('HEALTH.items').filter(it => it.level !== 'note').map(it => kindOf(it.text)));
      const still = ctx.fixed.filter(f => f.level !== 'note' && now.has(f.kind));
      return still.length ? `still reported after its fix: "${still[0].kind}…"` : '';
    }
  }
];

// Builds the download for the edit just made, writes and reads back the .sav, and loads it into the editor again.
// Returns { built, error }.
async function buildAndReload(ed) {
  const built = JSON.parse(JSON.stringify(ed.run('buildDownloadRoot()')));
  const bytes = new Uint8Array(await ed.run('buildBrgSav')(built));
  const back = await ed.run('parseBrgSav')(bytes);
  const d = firstDiff(built, back);
  if (d) return { built, error: 'the .sav read back differently: ' + d };
  if (!await ed.loadBytes(bytes, 'edited.sav')) return { built, error: 'the edited save did not load' };
  return { built, error: '' };
}

// Runs every scenario that applies to `file`. Returns [{ name, label, status: ok|fail|skip, error }].
async function runEdits(ed, file) {
  const out = [];
  for (const sc of SCENARIOS) {
    try {
      if (!await ed.loadSave(file)) return out;
      if (!sc.applies(ed)) continue;
      const before = problemKinds(ed);
      const ctx = sc.apply(ed) || {};
      if (ctx.skip) { out.push({ name: sc.name, label: ctx.label || '', status: 'skip', error: ctx.skip }); continue; }
      const { built, error } = await buildAndReload(ed);
      let err = error || sc.check(ctx, built, ed);
      if (!err) {
        const added = [ ...problemKinds(ed) ].filter(k => !before.has(k));
        if (added.length) err = `new Save check ${findingText(ed, added[0])}`;
      }
      out.push({ name: sc.name, label: ctx.label || '', status: err ? 'fail' : 'ok', error: err });
    } catch (e) {
      out.push({ name: sc.name, label: '', status: 'fail', error: 'crashed: ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e) });
    }
  }
  return out;
}

// Clone test: clones save `fileB` onto save `fileA`'s account (as the Compare tab's Clone button does), then loads the
// clone, builds its download and checks it's on A's account. Returns { status, label, error } or null when not possible.
async function runClone(ed, fileA, fileB) {
  const fs = require('fs'), path = require('path');
  try {
    if (!await ed.loadSave(fileA)) return null;
    const A = ed.run('RAW_SAV_ROOT'), uA = String(ed.run('RAW_SAV_MAIN_UID'));
    const idA = JSON.stringify([ A.user.uid, A.user.nm, A.user.psnacid, A.user.olid ]);
    const beforeA = problemKinds(ed);
    ed.run('cmpSync()');
    await ed.run('cmpLoadFile')(new File([ fs.readFileSync(fileB) ], path.basename(fileB)));
    const uB = String(ed.run('CMP.uidB'));
    const clone = ed.run('cmpBuildClone()');
    // B's own problems come along with its progress, so they don't count against the clone
    const bytesB = fs.readFileSync(fileB);
    if (!await ed.loadBytes(bytesB, 'b.sav')) return null;
    const beforeB = problemKinds(ed);
    if (!await ed.loadBytes(new TextEncoder().encode(JSON.stringify(clone)), 'clone.json')) return { status: 'fail', label: '', error: 'the clone did not load' };
    const { built, error } = await buildAndReload(ed);
    let err = error;
    const u = built.user || {};
    if (!err && JSON.stringify([ u.uid, u.nm, u.psnacid, u.olid ]) !== idA) err = `the clone isn't on ${A.user.nm}'s account (uid ${u.uid}, name ${u.nm})`;
    if (!err && uB !== uA && built.bodyuser && uB in built.bodyuser) err = `the other account's uid ${uB} is still a key in bodyuser`;
    if (!err) { const added = [ ...problemKinds(ed) ].filter(k => !beforeA.has(k) && !beforeB.has(k)); if (added.length) err = `new Save check ${findingText(ed, added[0])} in the clone`; }
    return { status: err ? 'fail' : 'ok', label: `${path.basename(path.dirname(fileB))} onto ${path.basename(path.dirname(fileA))}`, error: err };
  } catch (e) {
    return { status: 'fail', label: '', error: 'crashed: ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e) };
  }
}

module.exports = { SCENARIOS, runEdits, runClone };
