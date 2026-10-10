// ==== Empty-collection shape preservation ====
// The game writes an empty collection as {} in most places (and [] in a
// few). The editor works on arrays, so a collection that was empty when the
// save was loaded and is still empty could come back in the other shape.
// This puts every such spot back exactly the way the loaded save had it.
// Shapes are recorded when the save is first read, because some tabs work
// directly on the loaded objects.
// Snapshot taken when a save is loaded: { root, list } where list holds every path under the raw root whose value was an
// empty {} (obj:true) or an empty [] (obj:false). Null until a save is loaded. restoreEmptyShapes() only trusts it
// when snapshot.root is the very RAW_SAV_ROOT object being downloaded.
let RAW_EMPTY_SHAPES = null;
// captureEmptyShapes(root) -> { root, list }
// Walks the raw save (plain objects only, max depth 8, does not descend into arrays) and records the path and original
// shape ({} vs []) of every empty collection. Pure: it only reads root.
function captureEmptyShapes(root) {
  const out = [];
  const walk = (o, path, depth) => {
    if (!o || typeof o !== 'object' || Array.isArray(o) || depth > 8) return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (Array.isArray(v)) { if (!v.length) out.push({ path: path.concat(k), obj: false }); }
      else if (v && typeof v === 'object') {
        if (!Object.keys(v).length) out.push({ path: path.concat(k), obj: true });
        else walk(v, path.concat(k), depth + 1);
      }
    }
  };
  walk(root, [], 0);
  return { root, list: out };
}
// restoreEmptyShapes(built, raw) -> built
// Last-but-one step of buildDownloadRoot: for each recorded path, if the editor turned an empty {} into [] (or the
// reverse) and the collection is still empty, convert it back so an untouched section is byte-for-byte the shape the game
// wrote. Mutates and returns `built`. No-op if the snapshot belongs to a different save.
function restoreEmptyShapes(built, raw) {
  if (!RAW_EMPTY_SHAPES || RAW_EMPTY_SHAPES.root !== raw) return built;
  // Each record is a path of keys; walk down to the parent container (stop silently if a parent vanished or is an array).
  for (const { path, obj } of RAW_EMPTY_SHAPES.list) {
    let o = built;
    for (let i = 0; i < path.length - 1 && o; i++) o = o[path[i]];
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    const k = path[path.length - 1], v = o[k];
    // Only flip when the collection is STILL empty; a collection the user filled keeps its new array/object form.
    if (obj && Array.isArray(v) && !v.length) o[k] = {};
    else if (!obj && v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) o[k] = [];
  }
  return built;
}

// ==== Review before download, dated file names ====
// ---------------------------------------------------------------------------
// REVIEW BEFORE DOWNLOAD + dated file names.
// At load the save is kept as text (ORIG_SAVE). Download builds the new save,
// runs both through the same adapter the editor uses and lists what differs,
// so a slip (wrong fighter, wrong field) shows up before the file is written.
// Files are named brggame_YYYY-MM-DD_HHMMSS so older downloads are never replaced (seconds, so two downloads in
// the same minute get different names).
// ---------------------------------------------------------------------------

// The save exactly as loaded: { root: the RAW_SAV_ROOT object, text: its JSON text, file: the File (or null), name }.
// Kept as TEXT so reviewDiff can compare against an untouched copy even though other code may mutate objects in place.
// `root` is compared with RAW_SAV_ROOT to detect that a different save has since been loaded.
let ORIG_SAVE = { root: null, text: '', file: null, name: '' };
// reviewSnapshot(file): record ORIG_SAVE for the save that was just loaded. Called by the load path after RAW_SAV_ROOT is set.
function reviewSnapshot(file) {
  ORIG_SAVE = { root: RAW_SAV_ROOT, text: RAW_SAV_ROOT ? JSON.stringify(RAW_SAV_ROOT) : '', file: file || null, name: file ? file.name : '' };
}
// reviewAdapt(raw) -> editor-shaped save (SAVE-like object). Runs the same adapter the editor uses on load
// (adaptFullDumpToLegacyShape) so the "before" and "after" raw roots are compared in the friendly shape.
// The adapter overwrites RAW_EMPTY_SHAPES as a side effect, so it is saved and restored around the call.
function reviewAdapt(raw) {
  const keep = RAW_EMPTY_SHAPES;
  try { return adaptFullDumpToLegacyShape(raw); } finally { RAW_EMPTY_SHAPES = keep; }
}
// reviewStamp(d?) -> "YYYY-MM-DD_HHMMSS" in local time (seconds included so two downloads in one minute differ).
function reviewStamp(d) {
  d = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
// reviewFileName(ext, stamp?) -> "brggame_<stamp>.<ext>"; never reuses the game's own file name so nothing is overwritten.
function reviewFileName(ext, stamp) { return `brggame_${stamp || reviewStamp()}.${ext}`; }

// buildDownloadRoot() -> root object that the download buttons (and the review/diff/report) write.
//
// This is the single place where all edits become a game-format save. It is the pipeline:
//
//   1. normalizePresents(SAVE.presents)   repair malformed Reward Box entries in place (uuid pid, numeric fields...).
//   2. questOrdForSave()                  an emptied quest.ord array must be written back as {} (game shape).
//   3. buildRawSavRootFromSave(SAVE, RAW_SAV_ROOT, RAW_SAV_MAIN_UID)
//                                         deep-CLONES the untouched raw JSON and merges the friendly SAVE edits into
//                                         the clone (RAW_SAV_ROOT itself is never modified).
//   4. applyDateRules                     Dates-tab rules (clamp/fix timestamps) applied to the clone.
//   5. restoreEmptyShapes                 put {} / [] back exactly as the loaded file had them.
//   6. applyAccountChoice                 Compare tab: re-key the save to another account's uid when chosen.
//   7. applyStampMark                     mark the game's one-time Funshot (research stamp) setup as done.
//   8. applyStampRally                    write Stamp Rally edits (floor.stamp.stamps + bonus game flag).
//   9. applyFloorMove                     move the paused floor (soul.flrid) and rewrite floor ids everywhere.
//  10. applyBossLock                      pre-plan upcoming boss floors in soul.hvntrinfo.
//  10b. applyLucky                        "I'm feeling lucky": plan the whole run and hide unknown blueprints in it (seeded, spoiler free).
//  11. applyJackals                       write per-Jackal reward edits into floor.jkls (and item/part tables).
//  12. applyFreeCont                      free-continue counters.
//  12b. applyStews                        the edited stew queue (kept out of RAW_SAV_ROOT until download).
//  12c. applyMasteryCap                   Haters' copies of weapon mastery capped at the game's top level (Save check fix).
//  13. applyShutdownReset                 zero chosen fighters' force-shutdown (force-close) counts.
//  14. applyRewind                        put a crashed run back on its last boss floor.
//  15. applyRunEnd                        end the run entirely (fighter goes home, run data cleared).
//
// The nested call below reads inside-out, so the list above is the order they RUN. The "Apply" steps are driven by
// module-level state objects (FLOOR_MOVE, BOSS_LOCK, ...) that are only honored when their .root === RAW_SAV_ROOT,
// i.e. they were set for the currently loaded save. Order matters: floor move precedes boss lock (which plans from the
// new floor); rewind runs after the other floor edits; run end runs LAST and overrides rewind.
// The result is a fresh object each call, so it is safe (but not cheap) to call repeatedly for diffs and previews.
// Throws are caught by callers (reviewAndDownload shows a toast).
// the root that the download buttons write
function buildDownloadRoot() {
  // Pre-pass steps that mutate the editor's SAVE object (not the raw clone).
  normalizePresents(SAVE.presents);
  questOrdForSave();
  // Build the clone from SAVE, then apply each opt-in transform; innermost call runs first.
  // buildRawSavRootFromSave shares some objects with SAVE (e.g. soul.present IS SAVE.presents), so the result is
  // deep-copied before the transforms run: otherwise a transform (Dates rules, ...) would edit SAVE itself, and the
  // edit would stick even after "Undo" and show up in every later build.
  return applyRunEnd(applyRewind(applyShutdownReset(applyMasteryCap(applyStews(applyFreeCont(applyJackals(applyLucky(applyBossLock(applyFloorMove(applyStampRally(applyStampMark(applyAccountChoice(restoreEmptyShapes(applyDateRules(JSON.parse(JSON.stringify(buildRawSavRootFromSave(SAVE, RAW_SAV_ROOT, RAW_SAV_MAIN_UID)))), RAW_SAV_ROOT))))))))))))));
}

// Friendly labels for soul (account) keys shown in the review list; unknown keys fall back to reviewKeyLabel().
const REVIEW_SOUL_LABELS = {
  free_money: 'Kill Coins', spirit: 'SPLithium', safe_level: 'Kill Coin bank level', spirit_tank_level: 'SPLithium bank level',
  bloodnium_point: 'Bloodnium', recycle_point: 'Recycle Points', rank: 'Rank', rank_point: 'Rank points', tdm_point: 'TDM points',
  tdm_rank: 'TDM rank', freezer_level: 'Freezer level', crntcid: 'Current fighter', whistle_id: 'Defense alarm',
  whistle_limit: 'Defense alarm runs until', abduct_guard_time: 'Kidnap protection until', is_fort_ready: 'Tokyo Death Metro open',
  paid_money: 'Paid Kill Coins', last_rcv_deathbox_time: 'Last death box received'
};
// Friendly names for whole soul sub-sections (arrays/objects) used in the "Other parts" review section ("X changed").
const REVIEW_PART_LABELS = {
  quests: 'Quests', quest: 'Quests', all_quests: 'Quests', mysterybag: 'Mystery Bags (Lost Bags)', deathbox: 'Death Boxes',
  fortsetting: 'Defense lineup', prison: 'Kidnapped fighters', screenshot: 'Screenshots', dchrs: 'Dead fighters',
  researchstamp: 'Research stamps', mail: 'Mail', radio: 'Radio', unlockfighter: 'Fighter unlocks', armorskin: 'Armor skins',
  openelvflr: 'Elevator stops', msrbook: 'Mushroom book', bstbook: 'Beast book', magazine: 'Magazines', waiting: 'Waiting Room',
  playlog: 'Play log counters', hitchart: 'Hit chart', teams: 'Teams', dests: 'Destinations', jointeams: 'Teams',
  terms: 'Terms', relationship: 'Relationships', hvntrinfo: 'Heaven treasure', areaflag: 'Area flags', areaescflag: 'Area flags',
  areamapflags: 'Map flags', force_shutdown_counts: 'Force-close counts'
};
// Abbreviations expanded/upper-cased by reviewKeyLabel (key tokens split on "_").
const REVIEW_KEY_WORDS = { tdm: 'TDM', hp: 'HP', exp: 'EXP', spl: 'SPL', vip: 'VIP', cnt: 'count', num: 'number', flg: 'flag' };
// reviewKeyLabel(key) -> human label, e.g. "tdm_point" -> "TDM point".
function reviewKeyLabel(k) {
  const w = String(k).split('_').filter(Boolean).map(x => REVIEW_KEY_WORDS[x] || x);
  const t = w.join(' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// True for keys that hold epoch-seconds timestamps (suffix _time, _limit, expire, expired_time).
const reviewIsTime = k => /(_time|_limit|expire|expired_time)$/.test(k);
// Soul keys displayed as On/Off instead of 0/1.
const REVIEW_ONOFF = new Set([ 'vip_flag', 'automatic_renewal', 'is_fort_ready' ]);
// reviewVal(key, value) -> display string for one soul value: dash for empty, On/Off flags, VIP kind, TDM rank name,
// formatted dates (epoch seconds > 1e8), thousands separators for numbers.
function reviewVal(k, v) {
  if (v === undefined || v === null || v === '') return '—';
  if (REVIEW_ONOFF.has(k)) return Number(v) ? 'On' : 'Off';
  if (k === 'vip_type') return Number(v) === 1 ? '1-Day Express' : '30-Day Express';
  if (k === 'tdm_rank') { const r = arr(AP && AP.tdmrank).find(x => x.id === v); if (r) return formatTdmRank(resolveName(r.name)) || String(v); }
  if (reviewIsTime(k) && Number(v) > 1e8) return dtFmt(Number(v));
  if (typeof v === 'number') return v.toLocaleString();
  return String(v);
}
// reviewPartLabel(p): "Part name +N" for a part instance (p.lvl is the RAW stored level; displayFromRaw converts it to the in-game +N).
function reviewPartLabel(p) { const r = PT_INDEX[p.ptid]; return r ? `${r.name} +${displayFromRaw(r, p.lvl)}` : p.ptid; }
// reviewInv(chr) -> Map(entity id -> display label) of everything a fighter carries: parts (eptid), items (eitemid),
// mushrooms (emsrid, with cooked state 0=raw 1=grilled) and beasts (ebstid). Entity ids ("eid" keys) identify one instance,
// so the diff can tell an added item from a changed one.
function reviewInv(c) {
  const m = new Map();
  for (const p of arr(c && c.pspts)) m.set(p.eptid, reviewPartLabel(p));
  for (const i of arr(c && c.psitems)) m.set(i.eitemid, itemDisplayName(i.itemId));
  for (const x of arr(c && c.psmsrs)) m.set(x.emsrid, msrDisplayName(x.msrid, x.cooked));
  for (const x of arr(c && c.psbsts)) m.set(x.ebstid, bstDisplayName(x.bstid, x.cooked));
  return m;
}
// reviewGroup(labels) -> comma list with counts: "Dragon Buster Sword S +2 x3, Ammo x2" (uses a real multiplication sign).
// "Dragon Buster Sword S +2 ×3, Ammo ×2"
function reviewGroup(labels) {
  const n = new Map();
  for (const l of labels) n.set(l, (n.get(l) || 0) + 1);
  return [ ...n ].map(([l, c]) => c > 1 ? `${l} ×${c}` : l).join(', ');
}
// reviewMapDiff(a, b) -> { added[], removed[], changed[] } between two Maps keyed by eid. changed entries read "old -> new".
function reviewMapDiff(a, b) {
  const added = [], removed = [], changed = [];
  for (const [k, v] of b) { if (!a.has(k)) added.push(v); else if (a.get(k) !== v) changed.push(`${a.get(k)} → ${v}`); }
  for (const [k, v] of a) if (!b.has(k)) removed.push(v);
  return { added, removed, changed };
}
// reviewRepaired(a, b): count parts (matched by eptid) whose durability (dur) or ammo (rest/spare) went up, i.e. repaired or refilled.
// parts (same eid in both) whose durability or ammo went up
function reviewRepaired(a, b) {
  const m = new Map(arr(a).map(p => [ p.eptid, p ]));
  let n = 0;
  for (const p of arr(b)) { const o = m.get(p.eptid); if (o && (Number(p.dur) > Number(o.dur) || Number(p.rest || 0) > Number(o.rest || 0) || Number(p.spare || 0) > Number(o.spare || 0))) n++; }
  return n;
}
// reviewDecalName(id): decal name from SKL_INDEX (masters.db), or the raw id if unknown.
function reviewDecalName(id) { return (SKL_INDEX[id] || {}).name || id; }

// reviewDiff(A, B, rawA, rawB) -> sections[] ({ title, lines[] }, empty sections dropped).
// Builds the human-readable "what changed" list. A/B are editor-shaped saves (before/after, via reviewAdapt); rawA/rawB
// are the matching raw-format roots, needed for data the adapter hides (floor.stamp, floor.jkls, soul.flrid, uid...).
// Sections: Account (+VIP), Weapon Mastery, Fighters, Decal stock, Research, Stamp Rally, Weapon/armor levels,
// Collection, Jackals, Location, Boss floor lock, Armor Skins, Waiting Room, Reward Box, Storage Box, Stews, Defense, Other parts.
// The exact line text is also used as a key by uiReverts() to attach Undo buttons, so do not reword lines casually.
// Read-only: never mutates its inputs.
function reviewDiff(A, B, rawA, rawB) {
  const S = [];   // sections: {title, lines[]}
  const sec = title => { const s = { title, lines: [] }; S.push(s); return s; };
  const aS = A.soul || {}, bS = B.soul || {};
  // Account section: attached account (uid), then every scalar soul key that differs.
  // account and other single values
  const acc = sec('Account');
  const uA = String((rawA.user || {}).uid || ''), uB = String((rawB.user || {}).uid || '');
  if (uA !== uB) acc.lines.push(`Attached to account: ${(rawA.user || {}).nm || uA} → ${(rawB.user || {}).nm || uB}`);
  const chrName = cid => { const c = arr(bS.chrs).concat(arr(aS.chrs)).find(x => x.cid === cid); return c ? c.name || cid : cid || '—'; };
  // Keys with their own sections below (or ignored) are skipped in the generic scalar loop.
  const done = new Set([ 'chrs', 'chrslots', 'psskls', 'hubcustom', 'mstlvl', 'vip', 'modified', 'uid' ]);
  for (const k of new Set(Object.keys(aS).concat(Object.keys(bS)))) {
    if (done.has(k)) continue;
    const a = aS[k], b = bS[k];
    if ((a && typeof a === 'object') || (b && typeof b === 'object')) continue;
    if (a === b || (a == null && b === '') || (b == null && a === '')) continue;
    const label = REVIEW_SOUL_LABELS[k] || reviewKeyLabel(k);
    acc.lines.push(k === 'crntcid' ? `${label}: ${chrName(a)} → ${chrName(b)}` : `${label}: ${reviewVal(k, a)} → ${reviewVal(k, b)}`);
  }
  const va = aS.vip || {}, vb = bS.vip || {};
  const vipLabel = { vip_flag: 'Express member', vip_type: 'Express Pass kind', vip_pass_num: '30-Day passes held', oneday_vip_pass_num: '1-Day passes held', expired_time: 'VIP expires', automatic_renewal: 'VIP auto-renew' };
  for (const k of new Set(Object.keys(va).concat(Object.keys(vb)))) if (JSON.stringify(va[k]) !== JSON.stringify(vb[k])) acc.lines.push(`${vipLabel[k] || 'VIP ' + k}: ${reviewVal(k, va[k])} → ${reviewVal(k, vb[k])}`);
  // Weapon mastery: compare level per weapon category (missing = level 1).
  // weapon mastery
  const ma = {}, mb = {}, pa0 = {}, pb0 = {};
  for (const m of arr(aS.mstlvl)) { ma[m.ptarmtp] = m.lvl; pa0[m.ptarmtp] = Number(m.abp) || 0; }
  for (const m of arr(bS.mstlvl)) { mb[m.ptarmtp] = m.lvl; pb0[m.ptarmtp] = Number(m.abp) || 0; }
  const mst = sec('Weapon Mastery');
  const mstName = id => { const r = arr(AP && AP.ptarmtps).find(x => x.id === id); return (r && resolveName(r.name)) || id; };
  for (const id of new Set(Object.keys(ma).concat(Object.keys(mb)))) {
    if ((ma[id] || 1) !== (mb[id] || 1)) mst.lines.push(`${mstName(id)}: Lv ${ma[id] || 1} → Lv ${mb[id] || 1}`);
    else if ((pa0[id] || 0) !== (pb0[id] || 0)) mst.lines.push(`${mstName(id)}: mastery points ${(pa0[id] || 0).toLocaleString()} → ${(pb0[id] || 0).toLocaleString()} (Lv ${mb[id] || 1})`);
  }
  // Fighters: added/removed by cid, then per-fighter field-by-field changes. uid is ignored when comparing (re-keying the account must not look like a change).
  // fighters
  const fs = sec('Fighters');
  const byA = new Map(arr(aS.chrs).map(c => [ c.cid, c ])), byB = new Map(arr(bS.chrs).map(c => [ c.cid, c ]));
  for (const [cid, c] of byB) if (!byA.has(cid)) fs.lines.push(`Added: ${c.name || '?'} (${cmpChrSummary(c)})`);
  for (const [cid, c] of byA) if (!byB.has(cid)) fs.lines.push(`Removed: ${c.name || '?'} (${cmpChrSummary(c)})`);
  if (arr(aS.chrslots).length !== arr(bS.chrslots).length) fs.lines.push(`Freezer hangers: ${arr(aS.chrslots).length} → ${arr(bS.chrslots).length}`);
  // Fighter state codes as stored by the game -> wording.
  const STATES = { FREE: 'in the freezer', GUARD: 'on defense', USE: 'being played', ENEMY: 'dead (Hater)', DUMMY: 'dummy' };
  for (const [cid, b] of byB) {
    const a = byA.get(cid);
    const noUid = x => JSON.stringify(x, (k, v) => k === 'uid' ? undefined : v);
    if (!a || noUid(a) === noUid(b)) continue;
    const ch = [];
    if (a.name !== b.name) ch.push(`name ${a.name} → ${b.name}`);
    if (a.type !== b.type) ch.push(`class ${CLASS_NAMES[a.type] || a.type} → ${CLASS_NAMES[b.type] || b.type}`);
    if (a.body !== b.body) ch.push(`model ${bodyLabel(a.body)} → ${bodyLabel(b.body)}`);
    if (a.gasmask !== b.gasmask) ch.push(`gas mask ${Number(String(a.gasmask).slice(-3)) || a.gasmask} → ${Number(String(b.gasmask).slice(-3)) || b.gasmask}`);
    if (a.grade !== b.grade) ch.push(`grade ${a.grade} → ${b.grade}`);
    if ((a.limit_break || 0) !== (b.limit_break || 0)) ch.push(`limit break ${a.limit_break || 0} → ${b.limit_break || 0}`);
    if (a.lvl !== b.lvl) ch.push(`level ${a.lvl} → ${b.lvl}`);
    if (a.state !== b.state) ch.push(`${STATES[a.state] || a.state} → ${STATES[b.state] || b.state}`);
    // Stat levels (missing = 1), then decal slots (bodylvl.skill), Death Bag (bodylvl.bag) and rage.
    const ba = a.bodylvl || {}, bb = b.bodylvl || {};
    const st = [ 'hp', 'str', 'dex', 'vit', 'stm', 'luk' ].filter(k => (ba[k] || 1) !== (bb[k] || 1)).map(k => `${k.toUpperCase()} ${ba[k] || 1}→${bb[k] || 1}`);
    if ((ba.skill || 0) !== (bb.skill || 0)) st.push(`decal slots +${ba.skill || 0}→+${bb.skill || 0}`);
    if ((ba.bag || 0) !== (bb.bag || 0)) st.push(`Death Bag +${ba.bag || 0}→+${bb.bag || 0}`);
    if ((a.rage || 0) !== (b.rage || 0)) st.push(`rage +${a.rage || 0}→+${b.rage || 0}`);
    if (st.length) ch.push(st.join(', '));
    const inv = reviewMapDiff(reviewInv(a), reviewInv(b));
    if (inv.added.length) ch.push(`items added: ${reviewGroup(inv.added)}`);
    if (inv.removed.length) ch.push(`items removed: ${reviewGroup(inv.removed)}`);
    if (inv.changed.length) ch.push(`items changed: ${inv.changed.join(', ')}`);
    const rep = reviewRepaired(a.pspts, b.pspts);
    if (rep) ch.push(`${rep} item${rep === 1 ? '' : 's'} repaired / ammo refilled`);
    // Decals worn: multiset difference between the two eqskls lists.
    const da = arr(a.eqskls).map(e => e.sklid), db = arr(b.eqskls).map(e => e.sklid);
    const dAdd = db.filter(x => { const i = da.indexOf(x); if (i >= 0) { da.splice(i, 1); return false; } return true; });
    if (dAdd.length) ch.push(`decals put on: ${reviewGroup(dAdd.map(reviewDecalName))}`);
    if (da.length) ch.push(`decals taken off: ${reviewGroup(da.map(reviewDecalName))}`);
    // Gear signature: arm slots plus (site, part id, arm slot) triples, sorted so order does not matter.
    const gear = c => JSON.stringify([ c.armslots || {}, arr(c.eqpts).map(e => [ e.site, e.eptid, e.arm_slot ]).sort() ]);
    if (gear(a) !== gear(b)) ch.push('equipped gear changed');
    // Fallback so a change in some field not covered above is still reported by key name.
    if (!ch.length) {
      const seen = new Set([ 'uid', 'name', 'body', 'gasmask', 'type', 'grade', 'limit_break', 'lvl', 'state', 'bodylvl', 'rage', 'pspts', 'psitems', 'psmsrs', 'psbsts', 'eqskls', 'armslots', 'eqpts' ]);
      const keys = Object.keys(Object.assign({}, a, b)).filter(k => !seen.has(k) && noUid(a[k]) !== noUid(b[k]));
      ch.push(keys.length ? 'changed: ' + keys.map(reviewKeyLabel).join(', ') : 'other details changed');
    }
    fs.lines.push(`${b.name || '?'}: ${ch.join('; ')}`);
  }
  // Decal stock: owned count per decal id (psskls).
  // decal stock
  const dk = sec('Decal stock');
  const ka = {}, kb = {};
  for (const s of arr(aS.psskls)) ka[s.id] = s.cnt || 0;
  for (const s of arr(bS.psskls)) kb[s.id] = s.cnt || 0;
  for (const id of new Set(Object.keys(ka).concat(Object.keys(kb)))) if ((ka[id] || 0) !== (kb[id] || 0)) dk.lines.push(`${reviewDecalName(id)}: ${ka[id] || 0} → ${kb[id] || 0}`);
  // Research: per blueprint, compare the highest finished level; also report forgotten/newly-known blueprints and the Chokufunsha "next level" (LEVELUP/REMODEL) markers.
  // research
  const rs = sec('Research');
  const ra = arr(A.user_research), rb = arr(B.user_research);
  for (const ptid of new Set(ra.concat(rb).map(r => r.ptid))) {
    const ta = cmpTopFinished(ra, ptid), tb = cmpTopFinished(rb, ptid);
    if (ta === tb) continue;
    const r = PT_INDEX[ptid], lv = (t, list) => t ? '+' + displayFromRaw(r, t) : RESEARCH_KNOWN_LABEL[researchKnownState(list, ptid)] || 'not researched';
    const cap = maxPartLevel(r);
    rs.lines.push(r && cap && (ta > cap || tb > cap) ? `${r.name || ptid}: researched to level ${ta || 0} → ${tb || 0} (goes up to +${maxDisplayLevel(r)})` : `${(r && r.name) || ptid}: ${lv(ta, ra)} → ${lv(tb, rb)}`);
  }
  // Blueprints that are not developed in either save but whose known/unknown state changed.
  // blueprints the game knew about that are now forgotten (or newly known) without being developed
  for (const ptid of new Set(ra.concat(rb).map(r => r.ptid))) {
    if (cmpTopFinished(ra, ptid) || cmpTopFinished(rb, ptid)) continue;
    const ka = researchKnownState(ra, ptid), kb = researchKnownState(rb, ptid);
    if (ka !== kb) rs.lines.push(`${(PT_INDEX[ptid] && PT_INDEX[ptid].name) || ptid}: ${RESEARCH_KNOWN_LABEL[ka] || 'not known'} → ${RESEARCH_KNOWN_LABEL[kb] || 'not known'}`);
  }
  // LEVELUP / REMODEL rows are the game's "can be upgraded next" markers; key them as ptid|type|lvl.
  // "next level" / "next tier" markers (what Chokufunsha lets you research next)
  const mk = list => new Set(list.filter(r => r.research_type === 'LEVELUP' || r.research_type === 'REMODEL').map(r => `${r.ptid}|${r.research_type}|${r.lvl}`));
  const mkA = mk(ra), mkB = mk(rb);
  const mkAdd = [ ...mkB ].filter(x => !mkA.has(x)), mkDel = [ ...mkA ].filter(x => !mkB.has(x));
  const mkNames = xs => [ ...new Set(xs.map(x => { const id = x.split('|')[0]; return (PT_INDEX[id] && PT_INDEX[id].name) || id; })) ];
  if (mkAdd.length) rs.lines.push(`Can now be upgraded at Chokufunsha (${mkAdd.length}): ${mkNames(mkAdd).slice(0, 25).join(', ')}${mkAdd.length > 25 ? ', …' : ''}`);
  if (mkDel.length && mkDel.length !== mkAdd.length) rs.lines.push(`Next-level markers removed or moved (${mkDel.length})`);
  // Stamp Rally: per-floor stamp offset (0 = perfect) read from the raw floor.stamp.stamps; collapse to a count when many floors changed; then the bonus bit-flags.
  const sr = sec('Stamp Rally');
  const stA = arr(rawA.floor && rawA.floor.stamp && rawA.floor.stamp.stamps), stB = arr(rawB.floor && rawB.floor.stamp && rawB.floor.stamp.stamps);
  const offA = new Map(stA.map(x => [ Number(x.idx), Number(x.offset) ])), offB = new Map(stB.map(x => [ Number(x.idx), Number(x.offset) ]));
  const stTxt = o => o == null ? 'not stamped' : o === 0 ? 'perfect' : 'off by ' + o;
  const stDiff = [];
  for (let i = 0; i < 50; i++) if (offA.get(i) !== offB.get(i)) stDiff.push(`${i + 1}F: ${stTxt(offA.get(i))} → ${stTxt(offB.get(i))}`);
  if (stDiff.length > 12) sr.lines.push(`Stamps: ${stA.length} → ${stB.length} stamped (${stDiff.length} floors changed)`); else sr.lines.push(...stDiff);
  const bfA = rallyFlagEntry(rawA), bfB = rallyFlagEntry(rawB), bA = bfA ? Number(bfA.value) || 0 : 0, bB = bfB ? Number(bfB.value) || 0 : 0;
  if (bA !== bB) for (const b of arr(AP && AP.stampBonus)) { const f = Number(b.flg); if ((bA & f) !== (bB & f)) sr.lines.push(`Bonus ${Number(b.stidx) + 1}F-${Number(b.edidx) + 1}F${Number(b.perfect) ? ' perfect' : ''}: ${(bA & f) ? 'given' : 'not given'} → ${(bB & f) ? 'given' : 'not given'}`); }
  // Weapon/armor levels: compare the stored (raw) lvl of the same part instance (same eid and ptid), e.g. clamped to its cap by the save check.
  // part instances whose stored level changed (e.g. set back to their cap by the save check)
  { const pl = new Map(jklPartsOf(rawA).map(p => [ p.eid, p ])), lv = sec('Weapon and armor levels');
    for (const p of jklPartsOf(rawB)) { const o = pl.get(p.eid); if (o && o.ptid === p.ptid && Number(o.lvl) !== Number(p.lvl)) lv.lines.push(`${(PT_INDEX[p.ptid] || {}).name || p.ptid}: stored level ${o.lvl} → ${p.lvl} (the part goes up to +${maxDisplayLevel(PT_INDEX[p.ptid])})`); }
    if (lv.lines.length > 12) { const n = lv.lines.length; lv.lines.length = 0; lv.lines.push(`${n} weapons/armor had their stored level changed`); } }
  // Collection: armor skins, magazines (status_list is a comma string: 1=new, 2=read, otherwise not found), then mushroom/beast book flags.
  const cl = sec('Collection');
  const skinOf = (so, t) => ((arr(so.armorskin).find(x => x && x.type === t) || {}).ptid) || '';
  for (const [ t, lbl ] of SKIN_SLOTS) { const x = skinOf(aS, t), y = skinOf(bS, t); if (x !== y) cl.lines.push(`${lbl} skin: ${x ? (PT_INDEX[x] || {}).name || x : 'none'} → ${y ? (PT_INDEX[y] || {}).name || y : 'none'}`); }
  { const ma = String((aS.magazine || {}).status_list || '').split(','), mb = String((bS.magazine || {}).status_list || '').split(',');
    const txt = v => Number(v) === 2 ? 'read' : Number(v) === 1 ? 'new' : 'not found';
    const ch = arr(AP && AP.magazines).filter(p => (Number(ma[p.idx]) > 0 ? ma[p.idx] : '-1') !== (Number(mb[p.idx]) > 0 ? mb[p.idx] : '-1'));
    if (ch.length > 8) cl.lines.push(`Magazines: ${ch.length} pages changed`);
    else for (const p of ch) cl.lines.push(`${p.type === 'BOSS' ? 'Tales From The Barbs Vol. ' + p.volume : 'YB Catalogue'} page ${p.page}: ${txt(ma[p.idx])} → ${txt(mb[p.idx])}`); }
  for (const [ key, lbl, nm ] of [ [ 'msrbook', 'Mushroom book', id => msrDisplayName(id, 0) ], [ 'bstbook', 'Beast book', id => bstDisplayName(id, 0) ] ]) {
    const fa = new Map(arr(aS[key]).map(e => [ e.id, Number(e.flag) || 0 ])), fb = new Map(arr(bS[key]).map(e => [ e.id, Number(e.flag) || 0 ]));
    const ch = [ ...new Set([ ...fa.keys(), ...fb.keys() ]) ].filter(id => fa.get(id) !== fb.get(id));
    if (ch.length) cl.lines.push(`${lbl}: ${ch.length} entr${ch.length === 1 ? 'y' : 'ies'} changed (${ch.slice(0, 6).map(nm).join(', ')}${ch.length > 6 ? ', …' : ''})`);
  }
  // Jackals: raw floor.jkls entries whose reward (rwd) changed. Describes the first item, part or Kill Coin amount parsed by jklParse.
  const jk = sec('Jackals');
  const jA = new Map(arr(rawA.floor && rawA.floor.jkls).map(j => [ j.type, j.rwd ])), jB = arr(rawB.floor && rawB.floor.jkls);
  for (const j of jB) if (jA.get(j.type) !== j.rwd) { const l = (() => { const r = jklParse(j) || {}; if (arr(r.items).length) return itemDisplayName(r.items[0].itemId); if (arr(r.pts).length) { const i = jklPartsOf(rawB).find(p => p.eid === r.pts[0].eptid); return i ? (PT_INDEX[i.ptid] || {}).name || i.ptid : 'a part'; } return Number(r.money) ? `${Number(r.money).toLocaleString()} Kill Coins` : 'nothing'; })(); jk.lines.push(`${String(j.type).replace(/^JACKAL_/, 'Jackal ')}: now drops ${l}`); }
  // Location: the paused floor (soul.flrid), the experimental Screamer Pit twin swap noted by a pending floor move, and the Boss floor lock plan.
  const lc = sec('Location');
  const fa = rawA.soul && rawA.soul.flrid, fb = rawB.soul && rawB.soul.flrid;
  const locLbl = id => !id ? 'none' : hvnFloor(id) ? hvnFloorLabel(hvnFloor(id)) : id;
  if (fa !== fb) lc.lines.push(`Paused floor: ${locLbl(fa)} → ${locLbl(fb)}`);
  if (fa !== fb && FLOOR_MOVE.root === RAW_SAV_ROOT && FLOOR_MOVE.target === fb && flmSwapRef(fb)) lc.lines.push(`Screamer Pit turned into its ${flmPitNo(flmSwapRef(fb)) > 5 ? '100F+' : 'below-100F'} twin (RUSH${flmPitNo(flmCurRef())} → RUSH${flmPitNo(flmSwapRef(fb))}) so it can be on ${hvnFloor(fb).no}F (EXPERIMENTAL)`);
  if (LUCKY_LAST && luckyPending()) lc.lines.push('Lucky run planned');
  // Boss lock is shown only if it will actually be written (a run end overrides it); hvntrinfo is the per-floor area plan.
  if (BOSS_LOCK.root === RAW_SAV_ROOT && BOSS_LOCK.mode && !(RUN_END.root === RAW_SAV_ROOT && RUN_END.on)) {
    // compare with the planned floors as they'd be after any floor move (the paused floor is never locked); the lock
    // starts from the floor before a go-back to the last boss floor, so that's what it's compared with
    const bl = sec('Boss floor lock'), hA = blkExisting(blkFrom());
    bl.lines.push(`Locked to: ${BLK_MODES[BOSS_LOCK.mode].label}${BOSS_LOCK.which ? ' · only ' + ((blkWhichOptions(BOSS_LOCK.mode).find(o => o.v === BOSS_LOCK.which) || {}).label || BOSS_LOCK.which) : ''}`);
    // only the floors the lock writes (a go-back can add a skipped map B floor of its own)
    const lp = blkPlanFresh(), wrote = new Set(arr(lp && lp.items).filter(it => it.entry).map(it => it.floor.id));
    for (const e of arr(rawB.soul && rawB.soul.hvntrinfo)) {
      if (e.flrid === rawB.soul.flrid || !wrote.has(e.flrid)) continue;
      const o = hA.get(e.flrid), f = hvnFloor(e.flrid), lbl = f ? f.no + 'F' : e.flrid;
      if (!o) bl.lines.push(`${lbl}: added as ${blkKind(e.refareaid).label}`);
      else if (o.refareaid !== e.refareaid) bl.lines.push(`${lbl}: ${blkKind(o.refareaid).label} → ${blkKind(e.refareaid).label}`);
    }
    if (bl.lines.length === 1) bl.lines.push('No planned boss floors needed changing');
    else if (bl.lines.length > 14) { const n = bl.lines.length - 1; bl.lines.length = 1; bl.lines.push(`${n} boss floors written`); }
  }
  // Armor skins unlocked by researching armor to +4.
  const sk = sec('Armor Skins (unlocked by R&D at +4)');
  const skA = armorSkinsUnlocked(ra), skB = armorSkinsUnlocked(rb);
  const skNew = [ ...skB ].filter(x => !skA.has(x)).map(x => (PT_INDEX[x] || {}).name || x), skGone = [ ...skA ].filter(x => !skB.has(x)).map(x => (PT_INDEX[x] || {}).name || x);
  if (skNew.length) sk.lines.push(`Newly unlocked (${skNew.length}): ${skNew.join(', ')}`);
  if (skGone.length) sk.lines.push(`No longer unlocked (${skGone.length}): ${skGone.join(', ')}`);
  // Waiting Room customizations (hubcustom): owned / in use (flg bit 4) / not owned.
  // waiting room
  const hb = sec('Waiting Room');
  const hA = {}, hB = {};
  for (const e of arr(aS.hubcustom)) hA[e.cstmid] = e;
  for (const e of arr(bS.hubcustom)) hB[e.cstmid] = e;
  const hubName = id => { const m = arr(AP && AP.hubCustom).find(x => x.id === id); return (m && resolveName(m.name)) || id; };
  const hubState = e => !e ? 'not owned' : (Number(e.flg) & 4) ? 'in use' : hubOwned(e) ? 'owned' : 'not owned';
  for (const id of new Set(Object.keys(hA).concat(Object.keys(hB)))) if (hubState(hA[id]) !== hubState(hB[id])) hb.lines.push(`${hubName(id)}: ${hubState(hA[id])} → ${hubState(hB[id])}`);
  // Reward Box: presents compared by pid (unique id).
  // reward box
  const rw = sec('Reward Box');
  const pl = p => lostBagPresentLabel(p) ? `${lostBagPresentLabel(p)} (${cmpPresentLabel(p)})` : cmpPresentLabel(p);
  const pa = new Map(arr(A.presents).map(p => [ p.pid, pl(p) ])), pb = new Map(arr(B.presents).map(p => [ p.pid, pl(p) ]));
  const pd = reviewMapDiff(pa, pb);
  if (pd.added.length) rw.lines.push(`Added: ${reviewGroup(pd.added)}`);
  if (pd.removed.length) rw.lines.push(`Removed: ${reviewGroup(pd.removed)}`);
  { const ra = new Map(arr(A.presents).map(p => [ p.pid, p ])), changed = [];
    for (const p of arr(B.presents)) { const o = ra.get(p.pid); if (o && JSON.stringify(o) !== JSON.stringify(p)) changed.push(pl(p)); }
    if (changed.length) rw.lines.push(`Changed: ${reviewGroup(changed)}`); }
  // Storage Box: slots keyed by entity id, plus repaired items and capacity change.
  // storage
  const sg = sec('Storage Box');
  const sl = cl => { const m = new Map(); for (const s of arr(cl && cl.slots)) { const e = cmpSlotEid(s); if (e) m.set(e, cmpStorageLabel(cl, s) || 'item'); } return m; };
  const sd = reviewMapDiff(sl(A.cl), sl(B.cl));
  if (sd.added.length) sg.lines.push(`Added (${sd.added.length}): ${reviewGroup(sd.added)}`);
  if (sd.removed.length) sg.lines.push(`Removed (${sd.removed.length}): ${reviewGroup(sd.removed)}`);
  if (sd.changed.length) sg.lines.push(`Changed: ${sd.changed.join(', ')}`);
  const srep = reviewRepaired(A.cl && A.cl.pts, B.cl && B.cl.pts);
  if (srep) sg.lines.push(`${srep} item${srep === 1 ? '' : 's'} repaired / ammo refilled`);
  { const m = new Map(arr(A.cl && A.cl.pts).map(p => [ p.eptid, JSON.stringify(p) ]));
    const n = arr(B.cl && B.cl.pts).filter(p => m.has(p.eptid) && m.get(p.eptid) !== JSON.stringify(p)).length - srep;
    if (n > 0) sg.lines.push(`${n} stored weapon${n === 1 ? '' : 's'} / armor changed (level, durability or ammo)`); }
  if (arr(A.cl && A.cl.slots).length !== arr(B.cl && B.cl.slots).length) sg.lines.push(`Capacity: ${arr(A.cl && A.cl.slots).length} → ${arr(B.cl && B.cl.slots).length}`);
  // Defense: TDM lineup as "W<wave>#<order> <fighter>" (stored wave/order are 0-based).
  // defense lineup (named)
  // Stews: the queue lives in raw soul.skl.gacha.normal.sklids (the adapter hides it), so compare the raw roots.
  // The game pulls from the END of the queue, so the last entry is the next stew.
  const sw = sec('Stews');
  { const q = r => { const g = r && r.soul && r.soul.skl && r.soul.skl.gacha && r.soul.skl.gacha.normal; return g && Array.isArray(g.sklids) ? g.sklids : []; };
    const qa = q(rawA), qb = q(rawB);
    if (JSON.stringify(qa) !== JSON.stringify(qb)) {
      let n = 0;
      for (let i = 0; i < Math.max(qa.length, qb.length); i++) if (qa[i] !== qb[i]) n++;
      sw.lines.push(qa.length === qb.length ? `Stew queue: ${n.toLocaleString()} of ${qb.length.toLocaleString()} upcoming stews changed` : `Stew queue: ${qa.length.toLocaleString()} → ${qb.length.toLocaleString()} stews`);
      const next = x => x.length ? reviewDecalName(x[x.length - 1]) : 'none (empty queue)';
      if (next(qa) !== next(qb)) sw.lines.push(`Next stew: ${next(qa)} → ${next(qb)}`);
    }
  }
  const df = sec('Defense');
  const fl = x => arr(x).map(e => `W${Number(e.wave) + 1}#${Number(e.order) + 1} ${chrName(e.cid)}${Number(e.is_equip_whistle) ? ' (alarm)' : ''}`).sort().join(', ') || 'nobody';
  if (fl(A.fortsetting) !== fl(B.fortsetting)) df.lines.push(`Lineup: ${fl(A.fortsetting)} → ${fl(B.fortsetting)}`);
  // Other parts: any remaining soul sub-structure that differs, plus the pending run-level operations (dates rules, rewind, run end, Funshot setup flag).
  // everything else: which parts changed
  const ot = sec('Other parts');
  const namedOther = new Set();
  const note = k => { const l = REVIEW_PART_LABELS[k] || k; if (!namedOther.has(l)) { namedOther.add(l); ot.lines.push(`${l} changed`); } };
  for (const k of new Set(Object.keys(aS).concat(Object.keys(bS)))) {
    if (done.has(k)) continue;
    const a = aS[k], b = bS[k];
    if (!((a && typeof a === 'object') || (b && typeof b === 'object'))) continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) note(k);
  }
  for (const k of [ 'all_quests', 'prison', 'playlog', 'hitchart', 'teams', 'dests' ]) if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) note(k);
  if (JSON.stringify(rawA.force_shutdown_counts || {}) !== JSON.stringify(rawB.force_shutdown_counts || {})) note('force_shutdown_counts');
  if (DATE_RULES.length) ot.lines.push('Dates fixed by the Dates tab rules');
  if (REWIND.root === RAW_SAV_ROOT && REWIND.on && !(RUN_END.root === RAW_SAV_ROOT && RUN_END.on)) { const rw = rewindInfo(RAW_SAV_ROOT); if (rw) ot.lines.push(`Run put back on its last boss floor (${rw.floor.no}F, boss beaten; ${rw.dropped} floor${rw.dropped === 1 ? '' : 's'} after it dropped)`); }
  if (RUN_END.root === RAW_SAV_ROOT && RUN_END.on) { const ri = runEndInfo(RAW_SAV_ROOT); if (ri) ot.lines.push(`Run ended: the run's floor data (${ri.floors} floors), its force-close count and ${ri.made.toLocaleString()} items it left on floors, in chests and on Jackals cleared`); }
  if (!stampFlagIn(rawA) && stampFlagIn(rawB)) ot.lines.push("Game's one-time Funshot setup marked as done (so it won't re-count research)");
  // Hide empty sections.
  return S.filter(s => s.lines.length);
}

// reviewClose(): remove the shared overlay (review, report and history all use id "review-overlay") and its Escape handler.
function reviewClose() { const o = document.getElementById('review-overlay'); if (o) o.remove(); document.removeEventListener('keydown', reviewKey); }
function reviewKey(e) { if (e.key === 'Escape') reviewClose(); }

// reviewDownloadOriginal(stamp): download a "brggame_backup_<stamp>.sav" of the save exactly as loaded.
// Prefers the original File bytes when it was a .sav; otherwise (e.g. a .json load) rebuilds a .sav from the saved JSON text.
async function reviewDownloadOriginal(stamp) {
  const nm = `brggame_backup_${stamp}.sav`;
  try {
    if (ORIG_SAVE.file && /\.sav$/i.test(ORIG_SAVE.file.name)) triggerDownload(await ORIG_SAVE.file.arrayBuffer(), nm, 'application/octet-stream');
    else triggerDownload(await buildBrgSav(JSON.parse(ORIG_SAVE.text)), nm, 'application/octet-stream');
    toast(`Saved a backup of the save as loaded: ${nm}`);
  } catch (err) {
    try { triggerDownload(await buildBrgSav(JSON.parse(ORIG_SAVE.text)), nm, 'application/octet-stream'); toast(`Saved a backup of the save as loaded: ${nm}`); }
    catch (e2) { toast('Could not make the backup: ' + e2.message, true); }
  }
}

// reviewAndDownload(kind) kind = 'sav' | 'json'. The Download button handler.
// Flow: build the download root, diff it against the loaded text, show the "Review changes" overlay, and only when the
// user confirms build the file (buildBrgSav for .sav, pretty JSON for .json), save it, update the status bar and record it
// in Download history. A diff failure never blocks the download (the overlay says the list could not be made).
async function reviewAndDownload(kind) {
  if (!SAVE || !RAW_SAV_ROOT) { toast('Load a save first', true); return; }
  let root;
  // buildDownloadRoot can throw on a broken edit; report it and stop before anything is written.
  try { root = buildDownloadRoot(); } catch (err) { toast(`Failed to build .${kind}: ` + err.message, true); return; }
  let sections = null, why = '';
  try {
    // Compare against the pristine loaded text when it is still for this save, else the current raw root.
    const rawA = JSON.parse(ORIG_SAVE.root === RAW_SAV_ROOT && ORIG_SAVE.text ? ORIG_SAVE.text : JSON.stringify(RAW_SAV_ROOT));
    const rawB = JSON.parse(JSON.stringify(root));
    sections = reviewDiff(reviewAdapt(JSON.parse(JSON.stringify(rawA))), reviewAdapt(rawB), rawA, rawB);
  } catch (err) { why = err.message; console.warn('review failed', err); }
  const stamp = reviewStamp(), fname = reviewFileName(kind, stamp);
  const total = sections ? sections.reduce((n, s) => n + s.lines.length, 0) : 0;
  reviewClose();
  const ov = document.createElement('div');
  ov.id = 'review-overlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.7); display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; overflow:auto;';
  const body = sections === null
    ? `<div class="capNote">The change list couldn't be made (${escapeHtml(why)}). The download itself is not affected.</div>`
    : !sections.length ? `<div class="capNote" style="margin:0;">No changes since you loaded this save.</div>`
    : sections.map(s => `<details ${s.lines.length <= 12 ? 'open' : ''} style="margin-bottom:8px;"><summary style="cursor:pointer;"><b>${escapeHtml(s.title)}</b> <span class="id">(${s.lines.length})</span></summary>
        <ul style="margin:6px 0 0 18px; padding:0; font-size:12px; line-height:1.6;">${s.lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul></details>`).join('');
  ov.innerHTML = `<section class="block" style="max-width:860px; width:100%; margin:0;">
    <div class="block-head"><div><div class="eyebrow">Before you download</div><h2>Review changes</h2></div><div class="id">${sections ? total + ' change' + (total === 1 ? '' : 's') : ''}</div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Everything below differs from the save as you loaded it${ORIG_SAVE.name ? ` (${escapeHtml(ORIG_SAVE.name)})` : ''}. Check it's what you meant before putting the file in the game.</div>
      <div style="max-height:55vh; overflow:auto; padding-right:6px;">${body}</div>
      <div class="capNote">The file is named <b>${escapeHtml(fname)}</b> so earlier downloads are never replaced. Rename it to the game's save name (e.g. <b>brggame.sav</b>) when you copy it into the game's save folder, and keep the original somewhere safe.</div>
      <div class="toolbar" style="margin-top:10px;">
        <button class="action" id="review-go">⬇ Download ${escapeHtml(fname)}</button>
        <button class="subtle" id="review-backup" title="The save exactly as you loaded it">Download a backup of the original</button>
        <button class="subtle" id="review-cancel">Cancel</button>
      </div>
    </div>
  </section>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) reviewClose(); });
  document.addEventListener('keydown', reviewKey);
  document.getElementById('review-cancel').addEventListener('click', reviewClose);
  document.getElementById('review-backup').addEventListener('click', () => reviewDownloadOriginal(stamp));
  // Confirm: serialize the root that was reviewed (not a rebuilt one) so the file matches the list the user saw.
  document.getElementById('review-go').addEventListener('click', async () => {
    try {
      const data = kind === 'sav' ? await buildBrgSav(root) : JSON.stringify(root, null, 2);
      triggerDownload(data, fname, kind === 'sav' ? 'application/octet-stream' : 'application/json');
      toast(`Downloaded ${fname}`);
      reviewClose();
      if (sections) { UI.changes = sections; UI.curSig = uiSig(sections); UI.dlSig = UI.curSig; uiStatusUpdate(); }
      histRecord(kind, fname, data, sections);
    } catch (err) { toast(`Failed to build .${kind}: ` + err.message, true); }
  });
}

// ==== Save report (plain text for asking for help) ====
// ---------------------------------------------------------------------------
// Save report: a plain-text summary of the loaded save (platform, masters.db, account, fighters, the run,
// Funshots and every Save check result) to paste when asking for help. No account, Steam or PSN ids;
// names can be hidden. Made from the save as it is in the editor, and says if there are edits not yet downloaded.
// ---------------------------------------------------------------------------
// Editor build date shown in the save report.
const EDITOR_BUILD = '2026-10-08';
// UI state for the report dialog (remember the "hide names" checkbox).
const REPORT_UI = { hideNames: false };
// Fighter state codes -> report wording.
const REPORT_STATE = { USE: 'playing', FREE: 'in the freezer', GUARD: 'defender', DIE: 'dead', ENEMY: 'enemy', DUMMY: 'dummy' };
// reportPlain(html) -> text. Strips markup from a Save check message using DOMParser (inert: no scripts run, no images load).
function reportPlain(html) {
  // DOMParser documents never run scripts or load images
  const d = new DOMParser().parseFromString('<body>' + String(html == null ? '' : html) + '</body>', 'text/html');
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
}
// reportPendingChanges() -> number of review lines for unsaved edits, or null if it cannot be computed.
function reportPendingChanges() {
  try {
    if (!ORIG_SAVE.text || ORIG_SAVE.root !== RAW_SAV_ROOT) return null;
    const rawA = JSON.parse(ORIG_SAVE.text), rawB = JSON.parse(JSON.stringify(buildDownloadRoot()));
    return reviewDiff(reviewAdapt(JSON.parse(JSON.stringify(rawA))), reviewAdapt(rawB), rawA, rawB).reduce((n, s) => n + s.lines.length, 0);
  } catch (err) { return null; }
}
// saveReportText(opts) -> CRLF-joined text summary of the loaded save: platform, masters.db sanity, account, fighters, current run,
// Funshots and every Save check result. Contains no account/Steam/PSN ids; opts.hideNames also redacts fighter and account names.
function saveReportText(opts) {
  opts = opts || {};
  const L = [], n = v => (Number(v) || 0).toLocaleString('en-US'), soul = SAVE.soul || {}, root = RAW_SAV_ROOT || {};
  const hide = !!opts.hideNames, chrs = arr(soul.chrs).filter(c => c && c.state !== 'ENEMY' && c.state !== 'DUMMY');
  const fname = (c, i) => hide ? `Fighter ${i + 1}` : (c.name || `Fighter ${i + 1}`);
  const head = t => { L.push(''); L.push(`== ${t} ==`); };
  const when = t => Number(t) > 0 ? dtFmt(Number(t)) : 'unknown';
  L.push('LET IT DIE save report');
  L.push(`Made by the LET IT DIE Offline Editor (build ${EDITOR_BUILD}) on ${new Date().toLocaleString()}`);
  head('Save');
  L.push(`File: ${ORIG_SAVE.name || 'unknown'} · ${isPsSave() ? 'PlayStation save' : savePlatform(root) === 'PC' ? 'PC (Steam) save' : 'platform unknown'}`);
  const u = root.user || {};
  L.push(`Last saved by the game: ${when(u.modified || soul.modified)}`);
  const pend = reportPendingChanges();
  if (pend) L.push(`Edits made in the editor and not downloaded yet: ${pend} (this report shows the save with them)`);
  else if (pend === 0) L.push('No edits made in the editor (this is the save as loaded)');
  // Stock PC masters.db has 88 PS-only parts and 1,337 open blueprints; a different count suggests a modded or mismatched masters.db.
  // masters.db: stock PC data has 88 PS-only parts and 1,337 open blueprints
  const pts = arr(AP && AP.pts), ps = pts.filter(p => Number(p.platform) === 1).length, open = arr(AP && AP.partresearch).filter(r => Number(r.is_open)).length;
  L.push(`masters.db: ${n(pts.length)} parts, ${n(ps)} PS-only, ${n(open)} open blueprints${ps === 88 && open === 1337 ? ' (matches the stock PC game)' : ' (differs from the stock PC game: 88 PS-only, 1,337 open; modded?)'}`);
  head('Account');
  if (!hide) L.push(`Name: ${u.nm || u.olid || '—'}`);
  L.push(`Rank ${n(soul.rank)} · TDM points ${n(soul.tdm_point)}`);
  L.push(`Kill Coins in the Bank: ${n(soul.free_money)} (Bank level ${n(soul.safe_level)}, limit ${n(bankCapacityForLevel(soul.safe_level != null ? soul.safe_level : 1))})`);
  L.push(`SPLithium: ${n(soul.spirit)} · Bloodnium: ${n(soul.bloodnium_point)}`);
  const v = soul.vip || {}, plan = vipPlanOf(v);
  L.push(`Express Pass: ${plan === 'none' ? 'none' : (plan === 'day' ? '1-Day' : '30-Day') + ', ' + (Number(v.expired_time) * 1000 > Date.now() ? 'active until ' : 'ran out ') + when(v.expired_time)} · passes held: ${n(v.vip_pass_num)} 30-Day, ${n(v.oneday_vip_pass_num)} 1-Day`);
  head(`Fighters (${chrs.length}, Freezer level ${n(soul.freezer_level)})`);
  const fsc = root.force_shutdown_counts || {};
  chrs.forEach((c, i) => {
    const bits = [ `Lv ${n(c.lvl)}`, c.type, `Grade ${n(c.grade)}${Number(c.limit_break) ? ' LB ' + c.limit_break : ''}`, REPORT_STATE[c.state] || String(c.state || '').toLowerCase() ];
    if (Number(fsc[c.cid])) bits.push(`force-closed ${n(fsc[c.cid])}×`);
    L.push(`${c.state === 'USE' ? '*' : '-'} ${fname(c, i)}: ${bits.filter(Boolean).join(' · ')}`);
  });
  head('Current run');
  const d = typeof runData === 'function' ? runData() : null;
  if (!d) L.push('Not in a run (the save is in the Waiting Room).');
  else {
    const cur = chrs.findIndex(c => c.state === 'USE');
    const f = hvnFloor(d.flrid);
    L.push(`${hide ? (cur >= 0 ? fname(chrs[cur], cur) : 'The fighter') : d.name || '—'} on ${d.where}${f ? (Number(f.mbsmax) > 0 ? ' (boss floor)' : ' (normal floor)') : ''}`);
    L.push(`State: ${d.crashed ? `closed without pausing (${d.pause}); the game tries to resume this on load` : `paused (${d.pause})`}`);
    L.push(`Floors visited this run: ${n(d.floors.length)} · deepest ${d.deepest || '—'} · position ${d.pos}`);
    L.push(`Carried: ${n(d.money)} Kill Coins, ${n(d.blood)} Bloodnium · force-closes this run: ${n(d.fsc)}`);
    const rw = typeof rewindInfo === 'function' ? rewindInfo(root) : null;
    if (rw) L.push(`Last boss floor of the run: ${rw.floor.no}F (${rw.dropped} floor${rw.dropped === 1 ? '' : 's'} back)`);
  }
  head('Funshots (saved / what research gives)');
  try {
    const comp = computeStampTotals(), cur = {};
    for (const e of arr(soul.researchstamp)) cur[e.type] = Number(e.rate) || 0;
    L.push(RESEARCH_STAMP_TYPES.map(t => `${STAMP_LABELS[t]} ${cur[t] || 0} / ${comp[t]}`).join(' · '));
    L.push(`One-time Funshot setup done: ${stampInitDone() ? 'yes' : 'no'} · blueprints developed: ${n(new Set(arr(SAVE.user_research).filter(r => r.research_type === 'FINISHED').map(r => r.ptid)).size)}`);
  } catch (err) { L.push(`(couldn't work out: ${err.message})`); }
  head('Save check');
  const items = arr(HEALTH.items), cnt = k => items.filter(x => x.level === k).length;
  L.push(items.length ? `${cnt('problem')} problem(s), ${cnt('warning')} warning(s), ${cnt('note')} note(s)` : 'Nothing found.');
  let names = hide ? chrs.map(c => c.name).filter(Boolean).sort((a, b) => b.length - a.length) : [];
  for (const it of items) {
    let t = reportPlain(it.text);
    if (hide) { for (const nm of names) t = t.split(nm).join('[fighter]'); if (u.nm) t = t.split(u.nm).join('[account]'); }
    L.push(`[${it.level.toUpperCase()}] ${t}`);
  }
  L.push('');
  L.push(hide ? 'Names are hidden. No account, Steam or PSN ids are included.' : 'No account, Steam or PSN ids are included.');
  return L.join('\r\n');
}
// openSaveReport(): show the report in the shared overlay with copy / download / hide-names controls.
function openSaveReport() {
  if (!SAVE || !RAW_SAV_ROOT) { toast('Load a save first', true); return; }
  reviewClose();
  const ov = document.createElement('div');
  ov.id = 'review-overlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.7); display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; overflow:auto;';
  ov.innerHTML = `<section class="block" style="max-width:900px; width:100%; margin:0;">
    <div class="block-head"><div><div class="eyebrow">Ask for help with this</div><h2>Save report</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">A summary of this save to paste when asking for help (Reddit, Discord). It holds no account, Steam or PSN ids. It's made from the save as it is in the editor now.</div>
      <label style="cursor:pointer; display:inline-block; margin:6px 0;"><input type="checkbox" id="report-hide" ${REPORT_UI.hideNames ? 'checked' : ''} style="width:auto; margin-right:6px;">Hide account and fighter names</label>
      <textarea id="report-text" readonly spellcheck="false" style="width:100%; height:52vh; font-family:ui-monospace, Consolas, monospace; font-size:12px; line-height:1.5; white-space:pre; overflow:auto;"></textarea>
      <div class="toolbar" style="margin-top:10px;">
        <button class="action" id="report-copy">Copy to clipboard</button>
        <button class="subtle" id="report-dl">Download as .txt</button>
        <button class="subtle" id="report-close">Close</button>
      </div>
    </div>
  </section>`;
  document.body.appendChild(ov);
  const ta = document.getElementById('report-text');
  const fill = () => { try { ta.value = saveReportText({ hideNames: REPORT_UI.hideNames }); } catch (err) { ta.value = 'The report could not be made: ' + err.message; } };
  fill();
  ov.addEventListener('click', e => { if (e.target === ov) reviewClose(); });
  document.addEventListener('keydown', reviewKey);
  document.getElementById('report-close').addEventListener('click', reviewClose);
  document.getElementById('report-hide').addEventListener('change', e => { REPORT_UI.hideNames = e.target.checked; fill(); });
  document.getElementById('report-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ta.value); toast('Save report copied'); }
    catch (err) { ta.focus(); ta.select(); try { document.execCommand('copy'); toast('Save report copied'); } catch (e2) { toast('Copy failed: select the text and copy it', true); } }
  });
  document.getElementById('report-dl').addEventListener('click', () => triggerDownload(ta.value.replace(/\r?\n/g, '\r\n') + '\r\n', `save_report_${reviewStamp()}.txt`, 'text/plain'));
}

