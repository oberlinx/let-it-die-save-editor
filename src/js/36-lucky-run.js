// ==== "I'm feeling lucky" (Location tab): plan the whole run and hide unknown blueprints in it ====
//
// What it does: one press arms a hidden random seed. At download time applyLucky() writes a reward plan for EVERY boss
// floor of the run ahead of the fighter (floors the game already planned are kept as they are), then puts a few
// blueprints the player does not have into large boxes / treasure enemies of some of those floors. The editor never
// shows which floors, how many, or which blueprints (review, Changes drawer, history and the Raw / JSON compare views
// all stay generic).
//
// Rules (agreed with the user, see claude/lucky-button-spec.md in the project):
//  - The button is only drawn when a press could place something: a fighter paused in a Heaven run, no End the run /
//    Rewind pending, boss floors ahead, at least one unknown blueprint that can drop there and is not already in a
//    planned reward, and room left under the ceiling.
//  - Ceilings: NEO 3, regular Heaven 5, lowered by how much of the run's blueprint pool is still unknown (tiers below).
//    Unknown blueprints already in planned rewards (earlier press, or rolled by the game) count against the ceiling.
//  - Placement: large boxes and treasure enemies only (the Legendary Chest table has no blueprints), at most one
//    blueprint per floor, never the current floor, never a slot the game does not build (flmUnplaced).
//  - One hidden seed per press, kept in memory only. Every build of the download root derives the same plan from it
//    (Math.random is swapped for a seeded generator while applyLucky runs), so review, drawer and file always agree.
//    Pressing again just takes a new seed.

// LUCKY: root = the save the seed belongs to, seed = 0 when nothing is pending.
let LUCKY = { root: null, seed: 0 };
// True when the last applyLucky() call actually changed the download (read by the review / masking helpers).
let LUCKY_LAST = false;
// luckySync(): forget the seed when a different save is loaded.
function luckySync() { if (LUCKY.root !== RAW_SAV_ROOT) LUCKY = { root: RAW_SAV_ROOT, seed: 0 }; }
// luckyPending(): a press is waiting to be applied at download time.
function luckyPending() { return LUCKY.root === RAW_SAV_ROOT && !!LUCKY.seed; }

// Tier table: share of the run's blueprint pool still unknown (>= 50%, >= 25%, >= 10%, below) -> ceiling per route type.
const LUCKY_TIERS = [ 0.5, 0.25, 0.1 ];
const LUCKY_CEIL = { main: [ 5, 3, 2, 1 ], neo: [ 3, 2, 2, 1 ] };
// Weights for placing k = 1, 2, 3 ... blueprints (cut to what is possible); a press is a "short draw" (just 1) 12% of the time.
const LUCKY_COUNT_W = { main: [ 30, 30, 22, 12, 6 ], neo: [ 45, 35, 20 ] };
const LUCKY_SHORT_DRAW = 0.12;
// The rarest quarter of the unknown pool gets this weight bonus (rare ones are otherwise almost never offered).
const LUCKY_RARE_BOOST = 1.5;

// luckyRng(seed): small seeded generator (mulberry32) returning floats in [0, 1).
function luckyRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// luckyNewSeed(): a fresh non-zero 32-bit seed from the browser's secure random source.
function luckyNewSeed() {
  let v = 0;
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); v = a[0]; } catch (err) { v = Math.floor(Math.random() * 4294967295); }
  return v || 1;
}

// ---- drop tables ----
// master_floor_drop_gen rows indexed by floor|area|type (rebuilt when masters.db is reloaded).
let LUCKY_IDX = { src: null, map: null, bp: new Map() };
function luckyIdx() {
  const src = AP && AP.hvnBossDrops;
  if (LUCKY_IDX.src !== src) {
    const map = new Map();
    for (const r of arr(src)) { const k = r.flrid + '|' + r.areaid + '|' + r.type; (map.get(k) || map.set(k, []).get(k)).push(r); }
    LUCKY_IDX = { src, map, bp: new Map() };
  }
  return LUCKY_IDX;
}
// luckyRows(flr, area, ref, type): the rows the game draws a reward from for that arena. Same rule as blkDraw: the
// arena's own rows plus the floor's general ('-') rows when the arena has its own table, else the general rows only.
function luckyRows(flr, area, ref, type) {
  const all = luckyIdx().map.get(flr + '|' + area + '|' + type) || [];
  const own = ref && ref !== '-' ? all.filter(r => r.refareaid === ref) : [];
  return own.length ? all.filter(r => r.refareaid === ref || r.refareaid === '-') : all.filter(r => r.refareaid === '-');
}
// luckyBpMap(flr, area, ref, type, isPs): Map(base id ITMP_x -> {id, w}) of the real, obtainable blueprints a draw from
// those rows can give; w = the chance of that blueprint in one draw (row weight, then a uniform pick inside the group).
function luckyBpMap(flr, area, ref, type, isPs) {
  const idx = luckyIdx(), key = flr + '|' + area + '|' + ref + '|' + type + '|' + (isPs || RB_FORM.includePs ? 1 : 0);
  if (idx.bp.has(key)) return idx.bp.get(key);
  const rows = luckyRows(flr, area, ref, type), out = new Map();
  const groups = rows.map(r => ({ w: Number(r.freq) || 0, items: flmGroup(r.grp) })).filter(g => g.items.length);
  const total = groups.reduce((n, g) => n + g.w, 0);
  if (total) for (const g of groups) for (const it of g.items) {
    const id = it.itemId || it.itemid;
    if (!id || /U$/.test(id) || !rwdIsBlueprint(id) || !isRealBlueprint(id) || rewardUnfit('bp', id, isPs)) continue;
    const base = String(id), cur = out.get(base);
    out.set(base, { id, w: (cur ? cur.w : 0) + g.w / (total * g.items.length) });
  }
  idx.bp.set(key, out);
  return out;
}
// luckyGen(kind): the reward type whose slots can hold a blueprint on that arena kind.
function luckyGen(kind) { return kind === 'pit' ? 'PTGENTP_TRZAKO' : 'PTGENTP_TRBOX_L'; }
// luckyArenaRows(f): the arenas the game (or an active Boss floor lock) could give a boss floor that has no plan yet.
function luckyArenaRows(f) {
  const rows = arr(AP && AP.hvnBossAreas).filter(r => r.flrid === f.id);
  if (!rows.length || !BOSS_LOCK.mode || BOSS_LOCK.root !== RAW_SAV_ROOT) return rows;
  const mode = BLK_MODES[BOSS_LOCK.mode];
  if (!mode) return rows;
  const kindOf = r => blkKind(r.refareaid);
  const W = BOSS_LOCK.which && BOSS_LOCK.which.split(':');
  if (W && blkWhichOptions(BOSS_LOCK.mode).some(o => o.v === BOSS_LOCK.which)) {
    const ex = rows.filter(r => { const k = kindOf(r); return k.kind === W[0] && k.n === W[1]; });
    if (ex.length) return ex;
    const tw = rows.filter(r => { const k = kindOf(r); return k.kind !== W[0] && (k.kind === 'boss' || k.kind === 'mboss') && k.n === W[1]; });
    if (tw.length) return tw;
  }
  let want = rows.filter(r => mode.kinds.includes(kindOf(r).kind));
  if (!want.length && mode.fallback) want = rows.filter(r => mode.fallback.includes(kindOf(r).kind));
  return want.length ? want : rows;
}

// ---- what the player already has ----
// luckyScan(node, skipKey, out): adds every ITMP_ blueprint id string found in node (U variants folded into the base id).
function luckyScan(node, skipKey, out, depth) {
  if (typeof node === 'string') { if (node.charCodeAt(0) === 73 && node.startsWith('ITMP_')) out.add(node.replace(/U$/, '')); return; }
  if (!node || typeof node !== 'object' || depth > 40) return;
  if (Array.isArray(node)) { for (const v of node) luckyScan(v, skipKey, out, depth + 1); return; }
  for (const k in node) { if (k !== skipKey) luckyScan(node[k], skipKey, out, depth + 1); }
}
// luckyHave(scanRoot, research): {owned: Set of blueprint base ids found anywhere outside the planned rewards, known: Set of part ids with any research entry}.
function luckyHave(scanRoot, research) {
  const owned = new Set();
  luckyScan(scanRoot, 'hvntrinfo', owned, 0);
  return { owned, known: new Set(arr(research).map(r => r && r.ptid).filter(Boolean)) };
}
// luckyUnknown(base, have): the blueprint is neither owned nor researched in any way.
function luckyUnknown(base, have) { return !have.owned.has(base) && !have.known.has('PT_' + base.slice(5)); }

// ---- the pool and the ceiling ----
// luckyAnalyze({ahead, entryOf, have, isPs, route, planned}): what could be placed and how many.
//   ahead   boss floors still to come (master_floor records), entryOf(f) its planned hvntrinfo entry or null
//   planned array of hvntrinfo entries (the whole plan) to count unknown blueprints already in
// Returns {total, unknownAll, pool (Map base -> {id, w}), already, ceiling, room}.
function luckyAnalyze(o) {
  const total = new Map();
  for (const f of o.ahead) {
    const e = o.entryOf(f);
    const refs = e ? [ e.refareaid ] : luckyArenaRows(f).map(r => r.refareaid);
    for (const ref of refs) {
      const type = luckyGen(blkKind(ref).kind);
      for (const [ base, v ] of luckyBpMap(f.id, f.areaid, type === 'PTGENTP_TRZAKO' ? '-' : ref, type, o.isPs)) {
        const cur = total.get(base);
        total.set(base, { id: v.id, w: (cur ? cur.w : 0) + v.w });
      }
    }
  }
  const unknownAll = new Map([ ...total ].filter(([ base ]) => luckyUnknown(base, o.have)));
  const inPlan = new Set();
  luckyScan(luckyPlacedRewards(o.planned), '', inPlan, 0);
  const alreadySet = new Set([ ...inPlan ].filter(b => unknownAll.has(b) || (isRealBlueprint(b) && luckyUnknown(b, o.have))));
  const pool = new Map([ ...unknownAll ].filter(([ base ]) => !alreadySet.has(base)));
  const share = total.size ? unknownAll.size / total.size : 0;
  const t = LUCKY_CEIL[o.route] || LUCKY_CEIL.main;
  const ceiling = share >= LUCKY_TIERS[0] ? t[0] : share >= LUCKY_TIERS[1] ? t[1] : share >= LUCKY_TIERS[2] ? t[2] : t[3];
  return { total, unknownAll, pool, already: alreadySet.size, ceiling, room: ceiling - alreadySet.size };
}
// luckyPlacedRewards(entries): the rewards of planned floors that the game actually builds (the featured Legendary Chest reward and
// every reward in a slot that becomes a chest or a drop); the unplaced slots flmUnplaced() lists never appear in game.
function luckyPlacedRewards(entries) {
  const out = [];
  for (const e of arr(entries)) {
    if (!e) continue;
    if (e.rwdid) out.push(e.rwdid);
    const unp = flmUnplaced(e);
    arr(e.rwds).forEach((w, i) => { if (w && w.rwdid && !unp.has(i)) out.push(w.rwdid); });
  }
  return out;
}
// luckyRoute(floorId): 'neo' for the four NEO routes, 'main' for regular Heaven.
function luckyRoute(id) { return hvnRoute(id).key === 'main' ? 'main' : 'neo'; }

// luckyAvailable(): should the button be drawn now? Uses the editor's current state (SAVE plus pending floor move / lock),
// not a built download. Returns {ok} plus the analysis when ok.
function luckyAvailable() {
  const r = RAW_SAV_ROOT, s = r && r.soul;
  if (!SAVE || !s || !s.pause || s.stgid !== 'S_HVN') return { ok: false };
  if ((RUN_END.root === r && RUN_END.on) || (REWIND.root === r && REWIND.on)) return { ok: false };
  if (!arr(AP && AP.hvnBossAreas).length || !arr(AP && AP.hvnBossDrops).length) return { ok: false };
  const from = blkFrom(), cur = hvnFloor(from);
  if (!cur) return { ok: false };
  const ahead = flmRouteBoss(from).filter(f => f.no > cur.no);
  if (!ahead.length) return { ok: false };
  const have = luckyHave(SAVE, SAVE.user_research);
  const entries = new Map(blkExisting(from));
  if (BOSS_LOCK.root === r && BOSS_LOCK.mode) { const p = blkPlanFresh(); if (p) for (const it of p.items) if (it.entry) entries.set(it.floor.id, it.entry); }
  const a = luckyAnalyze({ ahead, entryOf: f => entries.get(f.id) || null, have, isPs: isPsSave(), route: luckyRoute(from), planned: [ ...entries.values() ] });
  return Object.assign(a, { ok: a.pool.size > 0 && a.room > 0 });
}

// ---- the download step ----
// luckyPick(list, rnd): weighted pick of {w} items; null when empty.
function luckyPick(list) {
  const total = list.reduce((n, x) => n + x.w, 0);
  if (!list.length || !(total > 0)) return null;
  let x = Math.random() * total;
  for (const it of list) if ((x -= it.w) < 0) return it;
  return list[list.length - 1];
}
// applyLucky(root): download-pipeline step (after the floor move and the Boss floor lock). Writes the whole run's reward
// plan and hides the blueprints. Does nothing (and leaves LUCKY_LAST false) when a press can no longer place anything.
function applyLucky(root) {
  LUCKY_LAST = false;
  if (!luckyPending() || !root || !root.soul) return root;
  const r = RAW_SAV_ROOT, s = root.soul;
  if ((RUN_END.root === r && RUN_END.on) || (REWIND.root === r && REWIND.on)) return root;
  if (!s.pause || s.stgid !== 'S_HVN') return root;
  const cur = hvnFloor(s.flrid);
  if (!cur) return root;
  const ahead = flmRouteBoss(cur.id).filter(f => f.no > cur.no);
  if (!ahead.length) return root;
  const realRandom = Math.random;
  Math.random = luckyRng(LUCKY.seed);
  try {
    const list = JSON.parse(JSON.stringify(arr(s.hvntrinfo)));
    const byId = () => new Map(list.filter(e => e && e.flrid).map(e => [ e.flrid, e ]));
    // 1. write the whole run: plan every missing boss floor, and give the empty reward lists of lock-written floors their boxes
    let map = byId();
    for (const f of ahead) {
      const e = map.get(f.id);
      if (!e) {
        const row = blkPick(luckyArenaRows(f));
        const ne = row && blkEntry(f, row.refareaid, Math.random() < HVN_RARE_CHANCE, 'roll');
        if (ne) list.push(ne);
      } else if (!arr(e.rwds).length) {
        const tmp = blkEntry(f, e.refareaid, Number(e.is_rare) === 1, 'roll');
        if (tmp) e.rwds = tmp.rwds;
      }
    }
    list.sort((a, b) => ((hvnFloor(a && a.flrid) || { no: 1e9 }).no) - ((hvnFloor(b && b.flrid) || { no: 1e9 }).no));
    map = byId();
    // 2. what can be placed
    const have = luckyHave(root, s.partresearch && s.partresearch.user);
    const a = luckyAnalyze({ ahead, entryOf: f => map.get(f.id) || null, have, isPs: savePlatform(root) === 'PS', route: luckyRoute(cur.id), planned: list });
    if (!(a.pool.size > 0 && a.room > 0)) return root;
    // slots per floor: placed large boxes / treasure enemies whose table holds a blueprint still in the pool
    const floors = [];
    for (const f of ahead) {
      const e = map.get(f.id);
      if (!e) continue;
      const unp = flmUnplaced(e), slots = [];
      arr(e.rwds).forEach((w, i) => {
        if (!w || unp.has(i) || (w.gentype !== 'PTGENTP_TRBOX_L' && w.gentype !== 'PTGENTP_TRZAKO')) return;
        const c = luckyBpMap(f.id, f.areaid, w.gentype === 'PTGENTP_TRZAKO' ? '-' : e.refareaid, w.gentype, savePlatform(root) === 'PS');
        if ([ ...c.keys() ].some(b => a.pool.has(b))) slots.push({ i, gen: w.gentype, c });
      });
      if (slots.length) floors.push({ f, e, slots });
    }
    if (!floors.length) return root;
    // 3. how many (the seeded draw), never above the ceiling room, the pool or the floors that can take one
    const maxK = Math.min(a.room, a.pool.size, floors.length);
    const cw = (LUCKY_COUNT_W[luckyRoute(cur.id)] || LUCKY_COUNT_W.main).slice(0, maxK);
    let k = 1;
    if (!(Math.random() < LUCKY_SHORT_DRAW)) {
      const picked = luckyPick(cw.map((w, n) => ({ w, n: n + 1 })));
      k = picked ? picked.n : 1;
    }
    // 4. which floors, then which slot and blueprint on each
    for (let n = floors.length - 1; n > 0; n--) { const j = Math.floor(Math.random() * (n + 1)); [ floors[n], floors[j] ] = [ floors[j], floors[n] ]; }
    const ws = [ ...a.pool.values() ].map(v => v.w).sort((x, y) => x - y);
    const rareCut = ws.length >= 4 ? ws[Math.floor(0.25 * (ws.length - 1))] : -1;
    const used = new Set();
    let placed = 0;
    for (const fl of floors) {
      if (placed >= k) break;
      const slotOrder = fl.slots.slice();
      for (let n = slotOrder.length - 1; n > 0; n--) { const j = Math.floor(Math.random() * (n + 1)); [ slotOrder[n], slotOrder[j] ] = [ slotOrder[j], slotOrder[n] ]; }
      for (const sl of slotOrder) {
        const opts = [ ...sl.c ].filter(([ b ]) => a.pool.has(b) && !used.has(b)).map(([ b, v ]) => ({ b, id: v.id, w: v.w * (a.pool.get(b).w <= rareCut ? LUCKY_RARE_BOOST : 1) }));
        const pick = luckyPick(opts);
        if (!pick) continue;
        fl.e.rwds[sl.i].rwdid = pick.id;
        used.add(pick.b);
        placed++;
        break;
      }
    }
    if (!placed) return root;
    s.hvntrinfo = list;
    LUCKY_LAST = true;
  } finally { Math.random = realRandom; }
  return root;
}
// luckyMaskCopy(root): for the Raw data and JSON compare views of "your edits": hide every reward of the planned floors ahead so
// the hidden blueprints cannot be read there. Works on the deep copy those views keep; returns the same object.
function luckyMaskCopy(root) {
  if (!LUCKY_LAST || !luckyPending() || !root || !root.soul || !Array.isArray(root.soul.hvntrinfo)) return root;
  for (const e of root.soul.hvntrinfo) {
    if (!e || e.flrid === root.soul.flrid) continue;
    if (e.rwdid) e.rwdid = '(hidden)';
    for (const w of arr(e.rwds)) if (w && w.rwdid) w.rwdid = '(hidden)';
  }
  return root;
}

// ---- the button ----
// renderLucky(): draws the panel in #loc-lucky, or nothing when a press could not place anything (a pending press is then dropped).
function renderLucky() {
  const host = document.getElementById('loc-lucky');
  if (!host || !SAVE || !RAW_SAV_ROOT) return;
  luckySync();
  let a = { ok: false };
  try { a = luckyAvailable(); } catch (err) { a = { ok: false }; }
  if (!a.ok) {
    host.innerHTML = '';
    if (luckyPending()) { LUCKY.seed = 0; toast('Lucky run dropped: there is nothing left to hide in this run'); }
    return;
  }
  host.innerHTML = `<h3 style="margin:18px 0 6px;">I'm feeling lucky</h3>
    <div class="capNote" style="margin:0 0 10px;">Plans the rest of this run's boss floors and hides some blueprints you don't have among their rewards. You won't be told how many or where. Press again to roll it again. Applied when you download. If you load the downloaded save here with <b>Show rewards (spoilers)</b> ticked, the Location tab can show them.</div>
    <div class="toolbar"><button class="action" id="lucky-go">I'm feeling lucky</button></div>`;
  document.getElementById('lucky-go').addEventListener('click', () => {
    luckySync();
    LUCKY.seed = luckyNewSeed();
    toast('Lucky run planned, download to apply');
    renderAll();
  });
}
