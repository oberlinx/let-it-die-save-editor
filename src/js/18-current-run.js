// ==== Current Run tab: data model (read-only view of the in-progress tower run) ====
// Decode the creation time of a version-1 (time-based) UUID into Unix seconds.
// uuidTime(u): u = UUID string (arcid values are v1 UUIDs); returns 0 if not a v1 UUID or invalid.
// UUID v1 stores 100ns ticks since 1582-10-15 split across time_low/mid/hi; 122192928000000000 is the
// offset (in 100ns ticks) between that epoch and 1970-01-01.
function uuidTime(u) {
  const h = String(u || '').replace(/-/g, '');
  if (h.length !== 32 || h[12] !== '1') return 0;
  // reassemble the 60-bit timestamp: time_hi (12 bits) * 2^48 + time_mid * 2^32 + time_low
  const v = parseInt(h.slice(13, 16), 16) * 281474976710656 + parseInt(h.slice(8, 12), 16) * 4294967296 + parseInt(h.slice(0, 8), 16);
  const t = Math.round((v - 122192928000000000) / 1e7);
  return t > 0 ? t : 0;
}
// Index the archived enemy fighters ("Haters") by floor id.
// root.diedchara.dchrarcs holds lists of archived fighters; entries with state 'ENEMY' were placed on a
// floor when the game built it. Returns { flrid: [created timestamps...] }.
function runHaterIndex(root) {
  const by = {};
  for (const L of Object.values((root.diedchara && root.diedchara.dchrarcs) || {})) for (const a of arr(L)) if (a && a.state === 'ENEMY' && a.flrid) (by[a.flrid] = by[a.flrid] || []).push(Number(a.created) || 0);
  return by;
}
// Work out when each floor of the current run was entered (built).
// user = root.floor.rlg.user (the run's floor list, oldest first). Exact times come from each floor's
// arcid UUID; if any are missing, fall back to the newest Hater batch time that is not later than the
// next floor's time (walking backwards from the end). Returns { t: [secs per floor], exact: bool, by: haterIndex }.
function runEntryTimes(root, user) {
  const by = runHaterIndex(root);
  const t = user.map(u => uuidTime(u.arcid));
  if (t.every(Boolean)) return { t, exact: true, by };
  // fallback: walk from the newest floor backwards, each floor must be built before the one after it
  let bound = Infinity;
  for (let i = user.length - 1; i >= 0; i--) {
    if (t[i]) { bound = t[i]; continue; }
    const c = arr(by[user[i].flrid]).filter(x => x <= bound + 5);
    if (c.length) { t[i] = Math.max(...c); bound = t[i]; }
  }
  return { t, exact: false, by };
}
// Collect everything the Current Run tab shows from RAW_SAV_ROOT (never the friendlier SAVE copy).
// Returns null when the save is not mid-run (no soul.pause). Otherwise a flat summary object: fighter,
// floor/position, earnings, times, account deltas (bank/SPLithium/Bloodnium now vs at run start),
// per-floor list, counts of items the run left behind (by owner), and upcoming map rewards (hvntrinfo).
// Quirk: soul.chr.chrs and item/part lists are either an array or an object keyed by the main uid, so
// each is normalised with Array.isArray / arr(v[uid]). bloodnium_result is a JSON string inside the fighter.
function runData() {
  const root = RAW_SAV_ROOT, s = root && root.soul;
  if (!s || !s.pause) return null;
  const uid = String(RAW_SAV_MAIN_UID || (root.user && root.user.uid) || '');
  // the active fighter is the one whose state is 'USE'
  const cl = s.chr && s.chr.chrs, list = Array.isArray(cl) ? cl : cl && typeof cl === 'object' ? arr(cl[uid]) : [];
  const c = list.find(x => x && x.state === 'USE') || null;
  let br = {};
  try { br = JSON.parse((c && c.bloodnium_result) || '{}') || {}; } catch (e) {}
  const num = v => Number(v) || 0;
  // human-readable floor label; fall back to raw stage/floor/area ids
  const f = hvnFloor(s.flrid);
  const where = f ? hvnFloorLabel(f) : [ s.stgid, s.flrid, s.areaid ].filter(Boolean).join(' / ') || '—';
  const rlg = root.floor && root.floor.rlg;
  // archive of visited floors keyed 'flrid|areaid' (gives the map used, ref_areaid)
  const archive = {};
  for (const a of arr(rlg && rlg.archive)) if (a && a.flrid) archive[a.flrid + '|' + a.areaid] = a;
  const ct = root.clear_times || {};
  const users = arr(rlg && rlg.user);
  const et = runEntryTimes(root, users);
  // one entry per floor visited this run: label, boss flag, map used, first-ever clear time, entry time, Hater count
  const floors = users.map((u, i) => {
    const hf = hvnFloor(u.flrid), a = archive[u.flrid + '|' + u.areaid] || {};
    return { n: i + 1, id: u.flrid, label: hf ? hvnFloorLabel(hf) : u.flrid, boss: hf ? Number(hf.mbsmax) > 0 : false, ref: a.ref_areaid || '', cleared: Number(ct[u.flrid + '-' + u.areaid]) || 0, entered: et.t[i] || 0, haters: et.t[i] ? arr(et.by[u.flrid]).filter(x => Math.abs(x - et.t[i]) <= 30).length : 0 };
  });
  // count items/parts the run itself generated (owner matches RUN_OWNERS: floor, chests, enemies, zombies, bosses, Jackals)
  const owners = {};
  for (const [ sec, key ] of [ [ 'item', 'items' ], [ 'part', 'pts' ] ]) {
    const v = root[sec] && root[sec][key], L = Array.isArray(v) ? v : v && typeof v === 'object' ? arr(v[uid]) : [];
    for (const x of L) { const o = String((x && x.owner) || ''); if (RUN_OWNERS.test(o)) { const k = /^JACKAL_/.test(o) ? 'Jackals' : ({ FLOOR: 'On floors', TRBOX: 'In chests', ZAKO: 'Treasure enemies', ZOMBIE: 'Zombies', MBOSS: 'Bosses' })[o] || o; owners[k] = (owners[k] || 0) + 1; } }
  }
  // force-close counter for this fighter (3+ triggers a Bloodnium penalty in the UI)
  const fsc = root.force_shutdown_counts && c ? num(root.force_shutdown_counts[c.cid]) : 0;
  const maxF = hvnFloor(br.max_floor_id);
  return {
    name: c ? c.name || '' : '', cls: c ? [ c.type, c.grade != null ? 'Grade ' + c.grade : '', c.limit_break ? 'LB ' + c.limit_break : '' ].filter(Boolean).join(' · ') : '',
    pause: s.pause, crashed: /_CRASH$/.test(s.pause), where, stage: s.stgid || '', flrid: s.flrid || '',
    deepest: maxF ? maxF.no + 'F' : br.max_floor_id || '', money: c ? num(c.money) : 0, blood: c ? num(c.bloodnium) : 0,
    bloodFloors: num(br.bloodnium), bloodMsr: num(br.msr_bloodnium), enemies: num(br.enemy_count),
    began: floors.length ? floors[0].entered || (floors.find(x => x.entered) || {}).entered || 0 : 0, beganExact: et.exact, started: num(br.start_time), elapsed: num(br.elapsed_time), floorStart: num(s.area_start_time),
    exp: c ? num(c.gain_exp) - num(c.start_exp) : 0, expNow: c ? num(c.gain_exp) : 0, hp: c ? num(c.hp) : 0,
    bank: num(s.free_money), bankStart: num(s.replica_money), spl: num(s.spirit), splStart: num(s.replica_spirit),
    bp: num(s.bloodnium_point), bpStart: num(s.replica_bloodnium_point), bankCap: bankCapacityForLevel(s.safe_level != null ? s.safe_level : 1),
    fsc, floors, owners, made: Object.values(owners).reduce((a, b) => a + b, 0), upcoming: arr(s.hvntrinfo),
    pos: [ s.pause_x, s.pause_y, s.pause_z ].map(v => Math.round(num(v))).join(', ')
  };
}
// Text summary of a map entry's non-legendary rewards (treasure enemies, large boxes, boss drop).
// e = an hvntrinfo entry; html=true gives HTML names via rwdNameHtml, else plain names. Placeholder
// reward slots that the floor never placed (flmUnplaced) are skipped. Returns '' if nothing applies.
// a map entry's other rewards as the floor has them (unplaced placeholder boxes left out)
function runRewardText(e, html) {
  const unp = flmUnplaced(e), rw = arr(e && e.rwds).filter((w, i) => w && !unp.has(i));
  const nm = w => w.rwdtype === 'TBRWD_MONEY' || !w.rwdid ? 'Kill Coins' : html ? rwdNameHtml(w.rwdid) : itemDisplayName(w.rwdid);
  const grp = (re, label) => { const L = rw.filter(w => re.test(w.gentype || '')).map(nm); return L.length ? `${label}: ${L.join(', ')}` : ''; };
  return [ grp(/TRZAKO$/, 'Treasure enemies'), grp(/TRBOX_L$/, 'Large boxes'), grp(/MBOSS/, 'Boss drop') ].filter(Boolean).join(' · ');
}
// Format a duration in seconds as '12m', '3h 05m' or 'Nd Nh' (days only from 2 days up, else hours).
const runDur = sec => { sec = Math.max(0, Math.floor(sec)); const dd = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return dd >= 2 ? `${dd}d ${h}h` : (dd ? `${dd * 24 + h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`); };
// short times (floor pace): 45s, 4m 12s
// runDurS: short duration for per-floor pace (45s, 4m 12s; falls back to runDur at 1h+). runN: locale-formatted number.
const runDurS = sec => { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), x = sec % 60; return m >= 60 ? runDur(sec) : m ? `${m}m ${String(x).padStart(2, '0')}s` : `${x}s`; };
const runN = v => Number(v || 0).toLocaleString();
// Flatten the run data into [section, field, value] rows. Used by the CSV export and, filtered to a few
// sections, by the 'Run details' table. Numbers stay numbers so the page formats them and the CSV is plain.
// Quirk: the game saves HP 999999 to mean full HP.
function runRows(d) {
  // [section, field, value] for the page and the CSV
  const R = [];
  const add = (sec, k, v) => R.push([ sec, k, v ]);
  // numbers stay numbers (formatted on the page, plain in the CSV)
  add('Fighter', 'Name', d.name); add('Fighter', 'Class', d.cls); add('Fighter', 'HP (as saved)', d.hp === 999999 ? 'Full (the game saves 999,999 to mean full HP)' : d.hp);
  add('Where', 'Floor', d.where); add('Where', 'State', d.crashed ? `Closed without pausing (${d.pause})` : `Paused (${d.pause})`);
  add('Where', 'Deepest floor this run', d.deepest); add('Where', 'Floors visited', d.floors.length);
  add('Where', 'Position', d.pos);
  add('Earned', 'Kill Coins carried', d.money); add('Earned', 'Bloodnium carried', d.blood);
  add('Earned', 'Bloodnium from floors and kills', d.bloodFloors); add('Earned', 'Bloodnium from mushrooms', d.bloodMsr);
  add('Earned', 'Enemies killed', d.enemies); add('Earned', 'EXP gained', d.exp);
  add('Time', 'Play time in the run', runDur(d.elapsed)); add('Time', d.beganExact ? 'Run began (first floor entered)' : 'Run began (about)', d.began ? dtFmt(d.began) : ''); add('Time', 'Run last started or resumed', d.started ? dtFmt(d.started) : '');
  add('Time', 'Current floor entered', d.floorStart ? dtFmt(d.floorStart) : '');
  add('Account', 'Bank Kill Coins now', d.bank); add('Account', 'Bank Kill Coins at run start', d.bankStart);
  add('Account', 'Bank limit', d.bankCap); add('Account', 'Bank + Kill Coins carried', d.bank + d.money);
  add('Account', 'SPLithium now', d.spl); add('Account', 'SPLithium at run start', d.splStart);
  add('Account', 'Bloodnium now', d.bp); add('Account', 'Bloodnium at run start', d.bpStart);
  add('Health', 'Force-closes this run', d.fsc);
  add('Health', 'Items the run left behind', d.made);
  for (const [ k, n ] of Object.entries(d.owners)) add('Health', 'Left behind: ' + k, n);
  return R;
}
// ---- Current Run extras: Death Bag, current floor, pace, Haters ----------------------------------------
// Chest type -> label for chests still on the floor (featured/SPXL both mean the extra-large featured chest).
const RUN_CHEST = { TBTP_SMALL: 'Small chest', TBTP_MEDIUM: 'Medium chest', TBTP_LARGE: 'Large chest', TBTP_EXLARGE: 'Extra-large chest (featured)', TBTP_SPXL: 'Extra-large chest (featured)' };
// Equipment sites for armor in a fighter's loadout, with display labels.
const RUN_SITES = [ [ 'EQSITE_HEAD', 'Head' ], [ 'EQSITE_BODY', 'Body' ], [ 'EQSITE_LEGS', 'Legs' ] ];
// Look up a part / item / mushroom / beast instance by its eid and return a display name ('' if not found).
// Used to name the contents of chests, enemies, bosses and Jackal rewards, which reference instances by eid.
function runInstName(root, uid, eid) {
  // a part / item / mushroom / beast instance by eid, as a display name
  for (const [ sec, key ] of [ [ 'part', 'pts' ], [ 'item', 'items' ], [ 'mushroom', 'msrs' ], [ 'beast', 'bsts' ] ]) {
    const v = root[sec] && root[sec][key], L = Array.isArray(v) ? v : v && typeof v === 'object' ? arr(v[uid]) : [];
    const x = L.find(e => e && e.eid === eid);
    if (!x) continue;
    if (sec === 'part') { const r = PT_INDEX[x.ptid]; return r ? `${r.name} +${displayFromRaw(r, x.lvl)}` : x.ptid; }
    if (sec === 'item') return itemDisplayName(x.itemid || x.itemId);
    if (sec === 'mushroom') return msrDisplayName(x.msrid, x.cooked);
    return bstDisplayName(x.bstid, x.cooked);
  }
  return '';
}
// Describe the active fighter's Death Bag (what is lost/kept on death) from the friendlier SAVE copy.
// Returns { slots (6 hand slots + head/body/legs), spare gear, tallied mushrooms/beasts/blueprints/items,
// count, cap, slotsNote } or null with no active fighter. count/cap use fighterItemCount/deathBagLimit;
// the cap includes the VIP Express Pass bonus (VIP_INCREASE_DEATHBAG), and slotsNote explains when the
// bag holds more than the cap because the pass has expired.
// Quirks: armslots is {} keyed by slot index 0-5 (0-2 right hand, 3-5 left); mushroom/beast cooked state
// 0=raw 1=grilled drives the display name.
function runBag() {
  const c = arr(SAVE && SAVE.soul && SAVE.soul.chrs).find(x => x && x.state === 'USE');
  if (!c) return null;
  const pts = arr(c.pspts), byEid = {};
  for (const p of pts) byEid[p.eptid] = p;
  // normalise a part instance into display fields: name, +level, durability %, ammo text
  const gear = p => {
    const r = PT_INDEX[p.ptid];
    if (!r) return { name: p.ptid, lvl: '', dur: '', ammo: '' };
    const pct = durabilityPct(p, r);
    return { name: r.name, lvl: '+' + displayFromRaw(r, p.lvl), dur: pct != null ? pct + '%' : '', ammo: String(ammoText(p, r) || '').replace(/^\s*·\s*/, '') };
  };
  // eptids currently held in hand (eqpts) - used for the 'in hand' badge
  const held = new Set(arr(c.eqpts).map(e => e.eptid));
  const slots = [];
  const as = c.armslots || {};
  for (let i = 0; i < 6; i++) {
    const eid = as[i] || as[String(i)], p = eid && byEid[eid];
    slots.push(Object.assign({ slot: (i < 3 ? 'Right hand ' : 'Left hand ') + (i % 3 + 1), inHand: !!(p && held.has(eid)) }, p ? gear(p) : { name: '' }));
  }
  for (const [ site, label ] of RUN_SITES) {
    const e = arr(c.eqpts).find(x => x.site === site), p = e && byEid[e.eptid];
    slots.push(Object.assign({ slot: label, inHand: false }, p ? gear(p) : { name: '' }));
  }
  const used = new Set(Object.values(as).concat(arr(c.eqpts).map(e => e.eptid)));
  const spare = pts.filter(p => !used.has(p.eptid)).map(gear);
  const tally = list => { const m = new Map(); for (const n of list) m.set(n, (m.get(n) || 0) + 1); return [ ...m ].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
  const items = arr(c.psitems).map(it => itemDisplayName(it.itemId));
  return {
    slots, spare,
    mushrooms: tally(arr(c.psmsrs).map(m => msrDisplayName(m.msrid, m.cooked))),
    beasts: tally(arr(c.psbsts).map(b => bstDisplayName(b.bstid, b.cooked))),
    blueprints: tally(items.filter(n => /^Blueprint/.test(n))),
    items: tally(items.filter(n => !/^Blueprint/.test(n))),
    count: fighterItemCount(c), cap: deathBagLimit(c), slotsNote: (() => { const cap = deathBagLimit(c), n = fighterItemCount(c), bonus = constIntOf('VIP_INCREASE_DEATHBAG', 10); return n > cap && !vipBagBonus() && n <= cap + bonus ? `fits the ${cap + bonus} slots the Express Pass gives; the pass has run out` : ''; })()
  };
}
// List what is still on the current floor, from RAW_SAV_ROOT.floor: unopened chests, treasure enemies,
// bosses (state 0 = beaten), zombies from other players, loose items, and Jackals with their rewards.
// Returns null when the save has no floor. Rewards reference instances by eid, resolved via runInstName.
// Jackal rwd is a JSON string ({money, spirit, pts, items, msrs}) and can be {} or [] shaped.
function runFloorNow() {
  const root = RAW_SAV_ROOT, fl = root && root.floor;
  if (!fl) return null;
  const uid = String(RAW_SAV_MAIN_UID || (root.user && root.user.uid) || '');
  const out = { chests: [], enemies: [], boss: [], zombies: [], loose: [], jackals: [] };
  // a reward is either Kill Coins (id is the amount) or an instance eid
  const reward = (type, id) => type === 'TBRWD_MONEY' ? `${runN(id)} Kill Coins` : runInstName(root, uid, id) || 'item';
  for (const t of arr(fl.trbox)) if (t) out.chests.push({ kind: RUN_CHEST[t.type] || t.type, what: reward(t.rwdtype, t.contentid) });
  for (const z of arr(fl.zako && fl.zako.zks)) {
    if (!z) continue;
    const bits = [];
    if (Number(z.money)) bits.push(`${runN(z.money)} Kill Coins`);
    if (z.eitemid) bits.push(runInstName(root, uid, z.eitemid));
    out.enemies.push({ kind: z.type === 'ZAKO_TREASURE' ? 'Treasure enemy' : z.type, lvl: z.lvl, what: bits.filter(Boolean).join(' + ') || '—' });
  }
  // treasure-enemy chest rewards are index-aligned with the zako list
  const zt = arr(fl.zako && fl.zako.trbox);
  zt.forEach((b, i) => { if (b && b.contentid && out.enemies[i]) out.enemies[i].what = [ out.enemies[i].what === '—' ? '' : out.enemies[i].what, reward(b.rwdtype, b.contentid) ].filter(Boolean).join(' + '); });
  for (const m of arr(fl.mboss && fl.mboss.mbss)) {
    if (!m) continue;
    const kind = /^STAGE_BOSS/.test(m.type) ? 'Don (main boss)' : /^MBOSS/.test(m.type) ? 'Mid-boss' : m.type;
    out.boss.push({ kind, lvl: m.lvl, beaten: Number(m.state) === 0, what: m.eitemid ? runInstName(root, uid, m.eitemid) : '' });
  }
  // zombies on this floor are matched by zid between flrzmbs[uid] and the global zmbs lists
  const here = new Set(arr(root.zombie && root.zombie.flrzmbs && root.zombie.flrzmbs[uid]).map(z => z && z.zid));
  for (const L of Object.values((root.zombie && root.zombie.zmbs) || {})) for (const z of arr(L)) if (z && here.has(z.zid)) out.zombies.push({ player: z.name || '', fighter: z.cname || '', cls: [ z.type, z.limit_break ? 'LB ' + z.limit_break : '' ].filter(Boolean).join(' '), lvl: z.lvl });
  for (const it of arr(fl.item)) if (it && it.eid) out.loose.push(runInstName(root, uid, it.eid) || 'item');
  for (const j of arr(fl.jkls)) {
    if (!j) continue;
    let r = {};
    try { r = JSON.parse(j.rwd || '{}') || {}; } catch (e) {}
    const bits = [];
    if (Number(r.money)) bits.push(`${runN(r.money)} Kill Coins`);
    if (Number(r.spirit)) bits.push(`${runN(r.spirit)} SPLithium`);
    for (const p of arr(r.pts)) if (p && p.eptid) bits.push(runInstName(root, uid, p.eptid));
    for (const i of arr(r.items)) if (i) bits.push(i.itemId ? itemDisplayName(i.itemId) : runInstName(root, uid, i.eitemid));
    for (const m of arr(r.msrs)) if (m && m.emsrid) bits.push(runInstName(root, uid, m.emsrid));
    out.jackals.push({ name: String(j.type || '').replace(/^JACKAL_/, 'Jackal '), what: bits.filter(Boolean).join(', ') || 'nothing', killed: Number(j.killed) > 0 });
  }
  return out;
}
// Pace statistics from consecutive floor entry times: time on a floor = next floor's build time minus
// this floor's. Gaps over 1 hour (BREAK) count as breaks and are excluded from averages.
// Returns counts, typical (median), average, floors/hour, normal vs boss medians, 3 fastest/slowest, breaks.
function runPace(d) {
  // time on a floor = from when it was built to when the next floor was built (consecutive floors only)
  const f = d.floors, steps = [];
  for (let i = 0; i + 1 < f.length; i++) {
    if (!f[i].entered || !f[i + 1].entered) continue;
    const hf = hvnFloor(f[i].id);
    steps.push({ label: hf ? hf.no + 'F' + (f[i].boss ? ' (boss)' : '') : f[i].label, boss: f[i].boss, sec: f[i + 1].entered - f[i].entered });
  }
  const BREAK = 3600, act = steps.filter(x => x.sec > 0 && x.sec <= BREAK), breaks = steps.filter(x => x.sec > BREAK);
  const med = L => { if (!L.length) return 0; const v = L.map(x => x.sec).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const total = act.reduce((a, x) => a + x.sec, 0);
  const by = act.slice().sort((a, b) => a.sec - b.sec);
  return {
    cleared: steps.length, typical: med(act), avg: act.length ? total / act.length : 0, perHour: total ? act.length * 3600 / total : 0,
    boss: med(act.filter(x => x.boss)), normal: med(act.filter(x => !x.boss)),
    fastest: by.slice(0, 3), slowest: by.slice(-3).reverse(), breaks: breaks.length, breakTime: breaks.reduce((a, x) => a + x.sec, 0)
  };
}
// Haters: the enemy fighters the game archives in one batch when it builds a floor (dchrarcs, state ENEMY,
// created at the floor's build time). Only the batch from THIS run's visit counts: the archive keeps every
// visit to a floor id, from every run and every fighter.
// Summarise Hater counts for the run: total enemy fighters, floors that had any, average, the floor with
// the most, and how many timed floors had none.
function runHaters(d) {
  const withN = d.floors.filter(x => x.haters);
  const n = withN.reduce((a, x) => a + x.haters, 0);
  const top = withN.slice().sort((a, b) => b.haters - a.haters)[0];
  const tf = top && hvnFloor(top.id);
  const known = d.floors.filter(x => x.entered).length;
  return { n, floors: withN.length, avg: withN.length ? n / withN.length : 0, most: top ? { label: tf ? tf.no + 'F' : top.id, n: top.haters } : null, none: known - withN.length, known };
}
// Build the extra CSV lines (Death Bag, current floor, Jackals, pace, Haters) appended to the run export.
// Returns an array of already-quoted CSV lines (blank strings separate sections).
function runExtraCsv(d) {
  const q = csvCell, L = [];
  const bag = runBag();
  if (bag) {
    L.push('', [ 'Death Bag', 'Slot', 'Item', 'Level', 'Durability', 'Ammo / in hand' ].join(','));
    for (const x of bag.slots) L.push([ 'Death Bag', x.slot, x.name || '(empty)', x.lvl || '', x.dur || '', x.inHand ? 'in hand' : x.ammo || '' ].map(q).join(','));
    for (const x of bag.spare) L.push([ 'Death Bag', 'Spare gear', x.name, x.lvl, x.dur, x.ammo ].map(q).join(','));
    for (const [ grp, list ] of [ [ 'Mushroom', bag.mushrooms ], [ 'Beast', bag.beasts ], [ 'Blueprint', bag.blueprints ], [ 'Item', bag.items ] ]) for (const [ n, c ] of list) L.push([ 'Death Bag', grp, n, '', '', 'x' + c ].map(q).join(','));
    L.push([ 'Death Bag', 'Total', `${bag.count} of ${bag.cap} slots${bag.slotsNote ? ' (' + bag.slotsNote + ')' : ''}` ].map(q).join(','));
  }
  const fn = runFloorNow();
  if (fn) {
    L.push('', [ 'Current floor', 'What', 'Details', 'Contents' ].join(','));
    for (const x of fn.boss) L.push([ 'Current floor', x.kind, `Lv ${x.lvl}${x.beaten ? ' (beaten)' : ''}`, x.what ].map(q).join(','));
    for (const x of fn.chests) L.push([ 'Current floor', x.kind, 'unopened', x.what ].map(q).join(','));
    for (const x of fn.enemies) L.push([ 'Current floor', x.kind, `Lv ${x.lvl}`, x.what ].map(q).join(','));
    for (const x of fn.loose) L.push([ 'Current floor', 'On the ground', '', x ].map(q).join(','));
    for (const x of fn.zombies) L.push([ 'Current floor', 'Zombie', `${x.fighter} (${x.player})`, x.cls ].map(q).join(','));
    for (const x of fn.jackals) L.push([ 'Jackals', x.name, x.killed ? 'beaten' : 'roaming', x.what ].map(q).join(','));
  }
  const pc = runPace(d);
  L.push('', [ 'Pace', 'Field', 'Value' ].join(','));
  for (const [ k, v ] of [ [ 'Floors timed', pc.cleared ], [ 'Typical time per floor', runDurS(pc.typical) ], [ 'Average time per floor', runDurS(pc.avg) ], [ 'Floors per hour (playing)', Number(pc.perHour.toFixed(1)) ], [ 'Typical normal floor', runDurS(pc.normal) ], [ 'Typical boss floor', runDurS(pc.boss) ], [ 'Breaks over 1 hour', pc.breaks ], [ 'Time in breaks', runDur(pc.breakTime) ] ]) L.push([ 'Pace', k, v ].map(q).join(','));
  for (const x of pc.fastest) L.push([ 'Pace', 'Fastest floor', `${x.label}: ${runDurS(x.sec)}` ].map(q).join(','));
  for (const x of pc.slowest) L.push([ 'Pace', 'Slowest floor', `${x.label}: ${runDurS(x.sec)}` ].map(q).join(','));
  const h = runHaters(d);
  L.push('', [ 'Haters', 'Field', 'Value' ].join(','));
  L.push([ 'Haters', 'Enemy fighters on this run\'s floors', h.n ].map(q).join(','), [ 'Haters', 'Per floor (average)', Number(h.avg.toFixed(1)) ].map(q).join(','));
  if (h.most) L.push([ 'Haters', 'Most on one floor', `${h.most.label}: ${h.most.n}` ].map(q).join(','));
  return L;
}
// Jackal rewards on the Current Run tab are hidden until this is ticked (remembered in this browser)
// Whether Jackal rewards are visible on the Current Run tab; persisted in localStorage (wrapped in try/catch).
let RUN_JKL_SPOIL = false;
try { RUN_JKL_SPOIL = localStorage.getItem('lid.runJackalSpoilers') === '1'; } catch (err) {}
// Build the HTML for the Current Run extras: 1 Death Bag, 2 current floor (and Jackals, hidden unless
// spoilers are ticked), 3 pace, 4 Haters. Returns an HTML string; all dynamic text goes through escapeHtml.
function runExtraHtml(d) {
  const esc = escapeHtml;
  const pill = (t, cls) => ` <span class="runBadge ${cls}" style="font-size:10.5px; padding:1px 7px;">${t}</span>`;
  let h = '';
  // 1. Death Bag
  const bag = runBag();
  if (bag) {
    h += `<h3>Death Bag <span class="muted" style="font-weight:400; font-size:13px;">${bag.count} of ${bag.cap} slots used${bag.slotsNote ? ' · ' + esc(bag.slotsNote) : ''}</span></h3>`;
    h += `<table class="runTable"><thead><tr><th>Slot</th><th>Equipped</th><th style="text-align:right;">Level</th><th style="text-align:right;">Durability</th><th>Ammo</th></tr></thead><tbody>`;
    h += bag.slots.map(x => `<tr><td>${esc(x.slot)}${x.inHand ? pill('in hand', 'ok') : ''}</td><td>${x.name ? esc(x.name) : '<span class="muted">empty</span>'}</td><td class="n">${esc(x.lvl || '')}</td><td class="n">${esc(x.dur || '')}</td><td class="muted">${esc(x.ammo || '')}</td></tr>`).join('');
    h += '</tbody></table>';
    const groups = [ [ 'Spare weapons & armor', bag.spare.map(x => [ `${x.name} ${x.lvl}`, 1, x.dur ]) ], [ 'Mushrooms', bag.mushrooms ], [ 'Beasts', bag.beasts ], [ 'Blueprints', bag.blueprints ], [ 'Items', bag.items ] ].filter(g => g[1].length);
    if (groups.length) {
      h += `<div class="runTiles" style="grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); margin-top:10px;">`;
      for (const [ title, list ] of groups) {
        const n = list.reduce((a, x) => a + x[1], 0);
        h += `<div class="runTile" style="--tile:#5b6b7a;"><div class="k">${esc(title)} · ${n}</div><div style="margin-top:6px; font-size:13.5px; line-height:1.65;">${list.map(([ nm, c, extra ]) => `<div style="display:flex; justify-content:space-between; gap:10px;"><span>${esc(nm)}</span><span class="muted">${extra ? esc(extra) : c > 1 ? '×' + c : ''}</span></div>`).join('')}</div></div>`;
      }
      h += '</div>';
    }
  }
  // 2. Current floor
  const fn = runFloorNow();
  if (fn) {
    const floorNo = (d.where.match(/(\d+)F/) || [])[1];
    h += `<h3>On ${floorNo ? floorNo + 'F' : 'the current floor'} right now</h3>`;
    const rows = [];
    for (const x of fn.boss) rows.push([ x.kind, `Lv ${x.lvl}${x.beaten ? ' · beaten' : ''}`, x.what || '' ]);
    for (const x of fn.chests) rows.push([ x.kind, 'unopened', x.what ]);
    for (const x of fn.enemies) rows.push([ x.kind, `Lv ${x.lvl}`, x.what ]);
    if (fn.loose.length) { const m = new Map(); for (const n of fn.loose) m.set(n, (m.get(n) || 0) + 1); rows.push([ 'On the ground', `${fn.loose.length} item${fn.loose.length === 1 ? '' : 's'}`, [ ...m ].map(([ n, c ]) => c > 1 ? `${n} ×${c}` : n).join(', ') ]); }
    if (fn.zombies.length) rows.push([ 'Zombies', String(fn.zombies.length), fn.zombies.slice(0, 6).map(z => `${z.fighter || '?'} (${z.player || '?'})`).join(', ') + (fn.zombies.length > 6 ? `, and ${fn.zombies.length - 6} more` : '') ]);
    h += rows.length ? `<table class="runTable"><thead><tr><th>What</th><th>Details</th><th>Contents</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="muted">${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>` : '<div class="capNote" style="margin-top:0;">Nothing left on this floor.</div>';
    if (fn.jackals.length) {
      const left = fn.jackals.filter(j => !j.killed).length;
      h += `<h3 style="font-size:14px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">Jackals <span class="muted" style="font-weight:400; font-size:13px;">each keeps its reward until you beat it (also between runs)</span>
        <label style="margin-left:auto; font-weight:400; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:6px;"><input type="checkbox" id="run-jkl-spoil" ${RUN_JKL_SPOIL ? 'checked' : ''} style="width:auto;"> Show Jackal rewards (spoilers)</label></h3>`;
      h += RUN_JKL_SPOIL
        ? `<table class="runTable"><tbody>${fn.jackals.map(j => `<tr><td style="width:150px;">${esc(j.name)}</td><td>${esc(j.what)}</td><td class="n">${j.killed ? '<span class="muted">beaten</span>' : ''}</td></tr>`).join('')}</tbody></table>`
        : `<div class="capNote" style="margin-top:0;">${fn.jackals.length} Jackal${fn.jackals.length === 1 ? '' : 's'}${left < fn.jackals.length ? ` (${left} not beaten yet)` : ''} carrying a reward. Tick the box to see what each one drops.</div>`;
    }
  }
  // 3. Pace
  const pc = runPace(d);
  if (pc.cleared > 1) {
    h += `<h3>Pace</h3><div class="runTiles">
      <div class="runTile" style="--tile:#4f8fd6;"><div class="k">Typical floor</div><div class="v">${runDurS(pc.typical)}</div><div class="s">average ${runDurS(pc.avg)}</div></div>
      <div class="runTile" style="--tile:#4f8fd6;"><div class="k">Floors per hour</div><div class="v">${pc.perHour.toFixed(1)}</div><div class="s">while playing</div></div>
      <div class="runTile" style="--tile:#4f8fd6;"><div class="k">Normal floor</div><div class="v">${runDurS(pc.normal)}</div><div class="s">typical time</div></div>
      <div class="runTile" style="--tile:#d6392c;"><div class="k">Boss floor</div><div class="v">${runDurS(pc.boss)}</div><div class="s">typical time</div></div>
      <div class="runTile" style="--tile:#666;"><div class="k">Breaks over 1 hour</div><div class="v">${pc.breaks}</div><div class="s">${pc.breaks ? runDur(pc.breakTime) + ' in total, left out of the pace' : 'none'}</div></div>
    </div><table class="runTable"><thead><tr><th>Fastest floors</th><th style="text-align:right;">Time</th><th>Slowest floors</th><th style="text-align:right;">Time</th></tr></thead><tbody>${[ 0, 1, 2 ].map(i => { const a = pc.fastest[i], b = pc.slowest[i]; return a || b ? `<tr><td>${a ? esc(a.label) : ''}</td><td class="n up">${a ? runDurS(a.sec) : ''}</td><td>${b ? esc(b.label) : ''}</td><td class="n down">${b ? runDurS(b.sec) : ''}</td></tr>` : ''; }).join('')}</tbody></table>
    <div class="capNote">Time on a floor runs from when the game built it to when it built the next one, so menus and short pauses are included; stays over an hour count as breaks.</div>`;
  }
  // 4. Haters
  const ht = runHaters(d);
  if (ht.n) h += `<h3>Haters</h3><div class="runTiles"><div class="runTile" style="--tile:#8e6bd6;"><div class="k">Enemy fighters this run</div><div class="v">${runN(ht.n)}</div><div class="s">on ${runN(ht.floors)} floors · about ${ht.avg.toFixed(1)} per floor${ht.none > 0 ? ` · ${runN(ht.none)} floors had none` : ''}</div></div>${ht.most ? `<div class="runTile" style="--tile:#8e6bd6;"><div class="k">Most on one floor</div><div class="v">${runN(ht.most.n)}</div><div class="s">${esc(ht.most.label)}</div></div>` : ''}</div>
    <div class="capNote" style="margin-top:0;">Other players' fighters the game placed on each floor when it built it for this run. Boss floors usually have none.</div>`;
  return h;
}
// Build the whole Current Run CSV (UTF-8 with BOM, CRLF line endings so Excel opens it cleanly).
// Map rewards are only exported when the Location tab's spoiler checkbox (LOC_SPOIL) is ticked.
function runCsv(d) {
  // RFC 4180 quoting: wrap in quotes and double embedded quotes when the value has , " or newline
  const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [ [ 'Section', 'Field', 'Value' ].join(',') ];
  for (const r of runRows(d)) lines.push(r.map(q).join(','));
  // reward names only with "Show rewards (spoilers)" ticked, like the tab
  if (d.upcoming.length && !LOC_SPOIL) lines.push('', [ 'Map rewards', `${d.upcoming.length} boss floors with rewards on the map (hidden: tick "Show rewards (spoilers)" on the Location tab to export them)` ].map(q).join(','));
  else if (d.upcoming.length) {
    lines.push('', [ 'Map rewards', 'Floor', 'Legendary Chest', 'Rare', 'Other rewards' ].join(','));
    for (const e of d.upcoming) { const hf = hvnFloor(e.flrid); lines.push([ 'Map rewards', hf ? hf.no + 'F' : e.flrid, e.rwdid ? itemDisplayName(e.rwdid) : '', Number(e.is_rare) ? 'yes' : '', runRewardText(e) ].map(q).join(',')); }
  }
  lines.push('', [ 'Floors visited', '#', 'Floor', 'Boss floor', 'Map used', 'Entered this run', 'Haters', 'First ever cleared' ].join(','));
  for (const x of d.floors) lines.push([ 'Floors visited', x.n, x.label, x.boss ? 'yes' : '', x.ref, x.entered ? dtFmt(x.entered) : '', x.haters, x.cleared ? dtFmt(x.cleared) : '' ].map(q).join(','));
  lines.push(...runExtraCsv(d));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
// Section shell for the Current Run tab; renderRun fills #run-body.
function blockRun() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Read only</div><h2>Current Run</h2></div></div>
    <div class="block-body"><div class="toolbar" style="margin-bottom:10px;"><button class="action" id="run-csv">Export to CSV</button><span class="capNote" style="margin:0;">Everything on this tab, the map rewards and every floor visited, as a spreadsheet file.</span></div><div id="run-body" class="run"></div></div>
  </section>`;
}
// Render the Current Run tab into #run-body (read-only). Shows a notice when the save isn't in a run.
// Also wires the Jackal spoiler checkbox, which persists its choice and re-renders.
function renderRun() {
  const host = document.getElementById('run-body');
  if (!host) return;
  const d = runData();
  if (!d) { host.innerHTML = '<div class="capNote">This save isn\'t in a run.</div>'; return; }
  const tile = (k, v, sub, color) => `<div class="runTile" style="--tile:${color};"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  const delta = (now, then) => { const x = now - then; return x ? `<span class="${x > 0 ? 'up' : 'down'}">${x > 0 ? '+' : ''}${runN(x)}</span>` : '<span class="muted">no change</span>'; };
  let h = `<div class="runHead"><span class="runName">${escapeHtml(d.name || 'Fighter')}</span><span class="runWhere">${escapeHtml(d.where)}</span>
    <span class="runBadge ${d.crashed ? 'bad' : 'ok'}">${d.crashed ? 'Closed without pausing' : 'Paused'}</span>${d.cls ? `<span class="runWhere" style="font-size:13px;">${escapeHtml(d.cls)}</span>` : ''}</div>`;
  h += `<div class="runTiles">
    ${tile('Floor', escapeHtml(d.where.match(/(\d+)F/) ? d.where.match(/(\d+)F/)[1] + 'F' : '—'), `deepest ${escapeHtml(d.deepest || '—')} · ${runN(d.floors.length)} floors visited`, '#d6392c')}
    ${tile('Kill Coins carried', runN(d.money), `Bank ${runN(d.bank)} of ${runN(d.bankCap)}`, '#e0b341')}
    ${tile('Bloodnium carried', runN(d.blood), `${runN(d.bloodFloors)} floors/kills · ${runN(d.bloodMsr)} mushrooms`, '#c0392b')}
    ${tile('Enemies killed', runN(d.enemies), '', '#8e6bd6')}
    ${tile('Play time in run', runDur(d.elapsed), d.began ? 'began ' + escapeHtml(dtFmt(d.began)) : d.started ? 'resumed ' + escapeHtml(dtFmt(d.started)) : '', '#4f8fd6')}
    ${tile('EXP gained', runN(d.exp), `now ${runN(d.expNow)}`, '#4fb37a')}
    ${tile('Force-closes', runN(d.fsc), d.fsc >= 3 ? '<span class="down">Bloodnium penalty</span>' : 'no penalty', d.fsc >= 3 ? '#d6392c' : '#666')}
  </div>`;
  h += `<h3>Account since the run started</h3><table class="runTable"><thead><tr><th></th><th style="text-align:right;">At run start</th><th style="text-align:right;">Now</th><th style="text-align:right;">Change</th></tr></thead><tbody>
    <tr><td>Bank Kill Coins</td><td class="n">${runN(d.bankStart)}</td><td class="n">${runN(d.bank)}</td><td class="n">${delta(d.bank, d.bankStart)}</td></tr>
    <tr><td>SPLithium</td><td class="n">${runN(d.splStart)}</td><td class="n">${runN(d.spl)}</td><td class="n">${delta(d.spl, d.splStart)}</td></tr>
    <tr><td>Bloodnium</td><td class="n">${runN(d.bpStart)}</td><td class="n">${runN(d.bp)}</td><td class="n">${delta(d.bp, d.bpStart)}</td></tr>
    <tr><td>Bank + Kill Coins carried</td><td class="n muted">—</td><td class="n">${runN(d.bank + d.money)}</td><td></td></tr>
  </tbody></table>`;
  h += `<h3>Run details</h3><table class="runTable"><tbody>${runRows(d).filter(r => [ 'Where', 'Time', 'Health', 'Fighter' ].includes(r[0])).map(r => `<tr><td>${escapeHtml(r[1])}</td><td class="n">${escapeHtml(typeof r[2] === 'number' ? runN(r[2]) : String(r[2]))}</td></tr>`).join('')}</tbody></table>`;
  h += runExtraHtml(d);
  if (d.upcoming.length) {
    h += `<h3>Map rewards</h3>`;
    if (!LOC_SPOIL) h += `<div class="capNote" style="margin-top:0;">${d.upcoming.length} boss floor${d.upcoming.length === 1 ? '' : 's'} with rewards on the map. Tick "Show rewards (spoilers)" on the Location tab to list them here.</div>`;
    else h += `<table class="runTable"><thead><tr><th>Floor</th><th>Legendary Chest</th><th>Other rewards</th></tr></thead><tbody>${d.upcoming.map(e => { const hf = hvnFloor(e.flrid); return `<tr><td>${escapeHtml(hf ? hf.no + 'F' : e.flrid)}${Number(e.is_rare) ? legendTag() : ''}</td><td>${e.rwdid ? rwdNameHtml(e.rwdid) : '—'}</td><td class="muted">${runRewardText(e, true)}</td></tr>`; }).join('')}</tbody></table>`;
  }
  h += `<details class="subDetails" style="margin-top:16px;"><summary>▸ Floors visited (${d.floors.length})</summary><div class="subDetailsBody"><table class="runTable"><thead><tr><th>#</th><th>Floor</th><th>Map used</th><th>Entered this run</th><th style="text-align:right;">Haters</th><th>First ever cleared</th></tr></thead><tbody>${d.floors.slice().reverse().map(x => `<tr><td class="muted">${x.n}</td><td>${escapeHtml(x.label)}${x.boss ? ' <span class="runBadge ok" style="font-size:10.5px; padding:1px 7px;">boss</span>' : ''}</td><td class="muted">${escapeHtml(x.ref)}</td><td>${x.entered ? escapeHtml(dtFmt(x.entered)) : '<span class="muted">—</span>'}</td><td class="n">${x.haters || '<span class="muted">0</span>'}</td><td class="muted">${x.cleared ? escapeHtml(dtFmt(x.cleared)) : '—'}</td></tr>`).join('')}</tbody></table></div></details>`;
  h += `<div class="capNote" style="margin-top:12px;">Read from the save as loaded. "Run began" is when the game built the run's first floor; "last started or resumed" is when it last picked the run up. "First ever cleared" is the game's record of the first time each floor was cleared, in any run. Changes made on the Location tab (moving or ending the run) apply on download and aren't shown here.</div>`;
  host.innerHTML = h;
  const js = document.getElementById('run-jkl-spoil');
  if (js) js.addEventListener('change', () => { RUN_JKL_SPOIL = js.checked; try { localStorage.setItem('lid.runJackalSpoilers', js.checked ? '1' : '0'); } catch (err) {} renderRun(); });
}
// Tab wiring: render when the tab is active and hook the CSV export button (file name includes fighter and timestamp).
function wireRun() {
  if (activeTab === 'run') renderRun();
  const b = document.getElementById('run-csv');
  if (b) b.addEventListener('click', () => {
    const d = runData();
    if (!d) { toast('This save isn\'t in a run', true); return; }
    const p = n => String(n).padStart(2, '0'), t = new Date();
    const nm = `current_run_${String(d.name || 'fighter').replace(/[^\w-]+/g, '_')}_${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}_${p(t.getHours())}${p(t.getMinutes())}.csv`;
    triggerDownload(runCsv(d), nm, 'text/csv;charset=utf-8');
    toast('Exported ' + nm);
  });
}
// Stats tab wiring (renderStats is defined elsewhere).
function wireStats() { if (activeTab === 'stats') renderStats(); }

