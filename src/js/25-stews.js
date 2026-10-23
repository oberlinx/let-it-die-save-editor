// ==== Stews: queue editing helpers ====
// ---------------------------------------------------------------------------
// STEWS (Mushroom Stew / decal gacha queue)
// Port of stew_luck_rarity.py. The offline build pre-rolls a batch of stew
// results into soul.skl.gacha.normal.sklids and pops them off the END of the
// list one pull at a time, so editing odds does nothing until that queue runs
// out. This tab rewrites the queue so a change lands on the very next pull.
// Edits go into RAW_SAV_ROOT and ship with the normal "Download .sav" button.
// ---------------------------------------------------------------------------

// Gacha id of the offline Mushroom Stew pool in masters.db.
const STEW_GACHA_ID = 'SKLGACH_NORMAL_OFFLINE';
// Upper bound for queue length the editor will generate. It is only a sanity cap that keeps the page
// and the save a sensible size; the game does not need such a long queue.
const STEW_MAX_LEN = 5000;
// Per-save bookkeeping: original queue (for Undo), whether the save had one, last log message.
// Keyed by root so loading a different save starts clean instead of undoing into the wrong file.
let STEW_STATE = { root: null, original: null, hadQueue: false, lastMsg: '' };
// Persistent UI form state for the Stews tab (selected rarity, length, RNG seed, listing options, highlights).
// Kept outside the DOM because the tab is re-rendered often and the choices would otherwise reset.
const STEW_FORM = { rarity: null, count: '', seed: '', ahead: 10, showAll: false, showOdds: false, hl: [], hlOnly: false, zeroOwned: true };

// The stew queue as stored in a save root (soul.skl.gacha.normal.sklids), or null if absent. Read-only.
function rawStewQueue(root) {
  const g = root && root.soul && root.soul.skl && root.soul.skl.gacha && root.soul.skl.gacha.normal;
  return g && Array.isArray(g.sklids) ? g.sklids : null;
}
// Working copy of the queue for the loaded save. Edits go here, never into RAW_SAV_ROOT (which must stay
// exactly as loaded); applyStews() writes the queue into the download at build time.
let STEW_WORK = { root: null, q: null };
// Returns the editable stew queue array (a copy of the save's queue, taken on first use) or null if absent.
// The game consumes it from the END, so the last element is the next pull.
function stewQueue() {
  if (STEW_WORK.root !== RAW_SAV_ROOT) { const r = rawStewQueue(RAW_SAV_ROOT); STEW_WORK = { root: RAW_SAV_ROOT, q: r ? r.slice() : null }; }
  return STEW_WORK.q;
}
// Replaces the editable queue (null = no queue, as in a save that never had one).
// Calls stewQueue() first so the working copy is tied to the current save before it is overwritten.
function setStewQueue(q) { stewQueue(); STEW_WORK.q = q; }
// Download-pipeline step: write the edited queue into root (creating soul/skl/gacha/normal if needed).
// Does nothing when the queue was not touched for this save or still equals the loaded one. Returns root.
function applyStews(root) {
  if (STEW_WORK.root !== RAW_SAV_ROOT || !root) return root;
  const q = STEW_WORK.q, loaded = rawStewQueue(root);
  // unchanged queue: leave the root alone so the downloaded file stays as close to the original as possible
  if (JSON.stringify(q) === JSON.stringify(loaded)) return root;
  // null means the save had no queue (or Undo restored that): remove ours so the game builds a fresh one
  if (q === null) { if (loaded) delete root.soul.skl.gacha.normal.sklids; return root; }
  const soul = root.soul = root.soul || {};
  soul.skl = soul.skl || {};
  soul.skl.gacha = soul.skl.gacha || {};
  soul.skl.gacha.normal = soul.skl.gacha.normal || {};
  soul.skl.gacha.normal.sklids = q.slice(); // copy, so later edits to the working queue can't change the built root
  return root;
}

// Snapshots the original queue the first time a given save is seen (so "Undo all stew changes" works).
// A copy is stored because the working queue gets edited in place by later actions.
function stewSyncState() {
  if (STEW_STATE.root !== RAW_SAV_ROOT) {
    const q = stewQueue();
    STEW_STATE = { root: RAW_SAV_ROOT, original: q ? q.slice() : null, hadQueue: !!q, lastMsg: '' };
  }
}

// Rarity of a decal id from SKL_INDEX as a number (or raw value if non-numeric); null if unknown.
function stewRarity(id) {
  const r = SKL_INDEX[id];
  if (!r || r.rarity == null || r.rarity === '') return null;
  const n = Number(r.rarity);
  return isNaN(n) ? r.rarity : n;
}
// Display name of a decal id, falling back to the id itself.
function stewName(id) {
  const r = SKL_INDEX[id];
  return r && r.name ? r.name : id;
}

// Returns a Set of decal ids the player already owns (used to flag NEW / own / dupe).
// Excludes the queue itself and other players' fighters stored in the save; uses the live SAVE state
// for decals (psskls, per-character eqskls) so unsaved edits count.
// Same rule as the script: any string value starting "SKL_" under soul,
// except the queue itself and other players' fighters. psskl/eqskl come from the editor's live state so
// edits made on the Decals / Fighters tabs are reflected.
function stewOwnedDecals() {
  const got = new Set();
  // generic recursive scan collecting any string value that starts with "SKL_"
  const walk = o => {
    if (Array.isArray(o)) { for (const v of o) if (v && typeof v === 'object') walk(v); }
    else if (o && typeof o === 'object') {
      for (const k in o) {
        const v = o[k];
        if (typeof v === 'string') { if (v.startsWith('SKL_')) got.add(v); }
        else walk(v);
      }
    }
  };
  const soul = (RAW_SAV_ROOT && RAW_SAV_ROOT.soul) || {};
  for (const k in soul) if (k !== 'skl') walk(soul[k]);
  const skl = soul.skl || {};
  for (const k in skl) if (k !== 'psskl' && k !== 'eqskl' && k !== 'gacha') walk(skl[k]);
  // Only YOUR fighters' decals count (the live state is used so unsaved edits count). The other groups in eqskl (negative ids) are other players' fighters stored in the save;
  // they are not in your inventory, so they must not make a decal look owned. Your own group (the main uid) comes from the live state below.
  const hadEntry = new Set(arr(skl.psskl).map(e => e && e.sklid));
  for (const e of arr(SAVE && SAVE.soul && SAVE.soul.psskls)) {
    if (!e || !e.id) continue;
    // zero-count entries are kept as owned only if the original save had an entry for them (sold/used decals),
    // matching the Python script; a decal added in the editor with 0 copies is not owned
    if (e.cnt == null || e.cnt > 0 || (STEW_FORM.zeroOwned && hadEntry.has(e.id))) got.add(e.id);
  }
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) for (const e of arr(c.eqskls)) {
    const id = e.sklid || e.id;
    if (id) got.add(id);
  }
  return got;
}

// Returns a random function: Math.random if no valid seed, else a seeded deterministic mulberry32 PRNG.
// A seed makes a roll repeatable, so the same seed and settings give the same queue (handy for comparing).
function stewRng(seed) {
  if (seed === '' || seed == null || isNaN(Number(seed))) return Math.random;
  let a = (Number(seed) >>> 0) || 1; // seed 0 becomes 1 so it still gives a valid sequence
  return function() { // mulberry32
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Counts queue entries per rarity ('?' for unknown rarity).
function stewHistogram(list) {
  const c = {};
  for (const s of list) { const r = stewRarity(s); const k = r == null ? '?' : r; c[k] = (c[k] || 0) + 1; }
  return c;
}
// Compact one-line histogram such as "r5:3 r4:10" for the action log.
function stewHistText(list) {
  const c = stewHistogram(list);
  return Object.keys(c).sort().map(k => `r${k}:${c[k]}`).join(' ') || '(empty)';
}

// Builds a new queue of "length" pulls by weighted sampling from the odds table rows ({sklid, odds}),
// optionally restricted to one rarity. Binary-searches the cumulative odds. Throws if no rows match.
function stewMakeQueue(rows, length, onlyRarity, rng) {
  if (onlyRarity != null) rows = rows.filter(r => stewRarity(r.sklid) === onlyRarity);
  if (!rows.length) throw new Error(`No rarity-${onlyRarity} decals in the stew odds table`);
  const ids = [], cum = [];
  let tot = 0;
  for (const r of rows) { tot += r.odds; ids.push(r.sklid); cum.push(tot); }
  const out = [];
  for (let n = 0; n < length; n++) {
    const x = rng() * tot;
    let lo = 0, hi = cum.length; // bisect_right: first bucket whose cumulative odds exceed x (odds are weights, not equal chances)
    while (lo < hi) { const mid = (lo + hi) >> 1; if (x < cum[mid]) hi = mid; else lo = mid + 1; }
    out.push(ids[Math.min(lo, ids.length - 1)]); // clamp guards a rounding edge at the very top of the range
  }
  return out;
}

// Picks one entry from the Map(sklid -> odds) by weight and removes it so it cannot be picked twice
// (a dedupe swap must not hand out the same new decal again).
function stewWeightedTake(fresh, rng) {
  const items = [...fresh.entries()];
  const tot = items.reduce((a, [, o]) => a + o, 0);
  const r = rng() * tot;
  let acc = 0;
  for (const [s, o] of items) { acc += o; if (r <= acc) { fresh.delete(s); return s; } }
  // floating-point fallback: if rounding left r just above the total, take the last entry
  const s = items[items.length - 1][0];
  fresh.delete(s);
  return s;
}

// Dedupe: walks the queue from the END (the imminent pull first) and replaces target-rarity pulls
// that repeat an owned decal, or one already granted earlier in this queue, with a not-yet-owned
// decal drawn by odds. Returns {newq, swapped:[[old,new]], ranOut, startedEmpty}; does not mutate queue.
function stewDedupe(queue, owned, rows, target, rng) {
  // only decals of the target rarity are swapped in, so the rarity mix of the queue does not change
  const pool = rows.filter(r => stewRarity(r.sklid) === target);
  if (!pool.length) throw new Error(`No rarity-${target} decals in the stew odds table`);
  const fresh = new Map(pool.filter(r => !owned.has(r.sklid)).map(r => [r.sklid, r.odds]));
  const startedEmpty = fresh.size === 0;
  const newq = queue.slice();
  const seen = new Set(owned);
  const swapped = [];
  let ranOut = 0;
  // iterate from the end because the game pops pulls from the end of the array
  for (let i = newq.length - 1; i >= 0; i--) { // imminent pull first
    const s = newq[i];
    if (stewRarity(s) !== target) continue;
    // first time this decal would be granted: keep it, and stop offering it as a swap-in (it is no longer new)
    if (!seen.has(s)) { seen.add(s); fresh.delete(s); continue; }
    if (fresh.size) {
      const pick = stewWeightedTake(fresh, rng);
      seen.add(pick);
      swapped.push([s, pick]);
      newq[i] = pick;
    } else ranOut++;
  }
  return { newq, swapped, ranOut, startedEmpty };
}

// Sorted (high to low) list of rarities present in the odds table or queue; defaults to 5..1.
// Read from the data rather than hard-coded so the dropdown matches whatever masters.db / the save contains.
function stewRarities() {
  const set = new Set();
  for (const r of arr(AP && AP.stewOdds)) { const x = stewRarity(r.sklid); if (x != null) set.add(x); }
  const q = stewQueue();
  if (q) for (const s of q) { const x = stewRarity(s); if (x != null) set.add(x); }
  const list = [...set].sort((a, b) => b - a);
  return list.length ? list : [5, 4, 3, 2, 1];
}

// ==== Stew Rebalance (pity) ====
// The game keeps no pity counter, so pity is built into the ORDER of the queue: every rule below is measured in pulls
// counted from the next pull. Rules run in this order, and each one tries to REORDER the pulls already queued before it
// swaps anything in (a swap-in is drawn from the game's odds, from the same pool the rule needs):
//   1. Good pull: a pull of rarity >= goodFrom at least every `good` pulls. 2. Top pull: rarity >= topFrom every `top` pulls.
//   3. No repeat: the same decal never twice within `gap` pulls.   4. NEW: a decal you do not own (first time in the queue)
//   at least every `fresh` pulls. Later rules only swap pulls of the same class (top / good / other), so they cannot undo earlier ones.
// A swapped-in NEW decal keeps the slot's rarity when it can, otherwise another rarity of the same class.
// 0 turns a rule off. The queue length never changes.
const STEW_REB_PRESETS = {
  gentle:   { goodFrom: 4, good: 15, topFrom: 5, top: 0,  fresh: 20, gap: 5 },
  standard: { goodFrom: 4, good: 10, topFrom: 5, top: 40, fresh: 10, gap: 10 },
  generous: { goodFrom: 4, good: 6,  topFrom: 5, top: 20, fresh: 5,  gap: 15 }
};
// Tab state: current settings and the seed shared by the preview and the Apply button, so what you see is what you get.
const STEW_REB = Object.assign({ preset: 'standard', seed: null, preferNew: true }, STEW_REB_PRESETS.standard);

// Clean copy of the settings: whole numbers in range, and the top rarity never below the good rarity.
function stewRebOpts(o) {
  o = o || STEW_REB;
  const n = (v, lo, hi) => Math.min(hi, Math.max(lo, parseInt(v, 10) || 0));
  const goodFrom = n(o.goodFrom, 1, 9);
  return { preferNew: o.preferNew !== false, goodFrom, topFrom: Math.max(goodFrom, n(o.topFrom, 1, 9)), good: n(o.good, 0, 200), top: n(o.top, 0, 500), fresh: n(o.fresh, 0, 200), gap: n(o.gap, 0, 100) };
}

// Longest stretch of pulls (from the next pull on) without a good / top / NEW pull, repeats inside the gap window, NEW count.
// order = pull 1 first. Used for the before / after preview.
function stewRebMetrics(order, owned, o) {
  const rar = s => { const r = stewRarity(s); return typeof r === 'number' ? r : -1; };
  const wait = test => { let last = -1, worst = 0; order.forEach((s, i) => { if (test(s, i)) { worst = Math.max(worst, i - last); last = i; } }); return worst; };
  const seen = new Set(); let fresh = 0;
  const isNew = order.map(s => { const v = !owned.has(s) && !seen.has(s); seen.add(s); if (v) fresh++; return v; });
  let repeats = 0;
  if (o.gap > 0) order.forEach((s, i) => { for (let k = Math.max(0, i - o.gap + 1); k < i; k++) if (order[k] === s) { repeats++; break; } });
  return { goodCount: order.filter(s => rar(s) >= o.goodFrom).length, topCount: order.filter(s => rar(s) >= o.topFrom).length, good: wait(s => rar(s) >= o.goodFrom), top: wait(s => rar(s) >= o.topFrom), fresh: wait((s, i) => isNew[i]), newCount: fresh, repeats };
}

// Rebalances `queue` (array as stored: next pull LAST) and returns {newq, moved, swapped, unmet, before, after}.
// Does not change `queue`. moved / swapped / unmet are counts per rule (good, top, gap, fresh).
function stewRebalance(queue, owned, rows, opt, rng) {
  const o = stewRebOpts(opt);
  // nothing to find when you already own every decal in the pool: the NEW rule is skipped instead of failing everywhere
  const noNew = !rows.some(r => !owned.has(r.sklid));
  if (noNew) o.fresh = 0;
  const order = queue.slice().reverse(); // pull 1 first
  const n = order.length;
  const before = stewRebMetrics(order, owned, o);
  const rar = s => { const r = stewRarity(s); return typeof r === 'number' ? r : -1; };
  const cls = s => rar(s) >= o.topFrom ? 2 : rar(s) >= o.goodFrom ? 1 : 0;
  const moved = { good: 0, top: 0, gap: 0, fresh: 0 }, swapped = { good: 0, top: 0, gap: 0, fresh: 0 }, unmet = { good: 0, top: 0, gap: 0, fresh: 0 };
  // weighted pick from odds rows that pass ok(); null if none
  const pick = (list, ok) => {
    const c = list.filter(r => ok(r.sklid));
    if (!c.length) return null;
    let tot = 0; for (const r of c) tot += r.odds;
    let x = rng() * tot;
    for (const r of c) { x -= r.odds; if (x < 0) return r.sklid; }
    return c[c.length - 1].sklid;
  };
  const present = new Set(order);
  // draw a swap-in from `pool`; with 'Prefer decals I do not own' on, an unowned decal that is not in the queue yet wins, then any unowned one
  const draw = (pool, i, extra) => {
    const base = id => (!extra || extra(id)) && !near(id, i, -1);
    let p = null;
    if (o.preferNew) p = pick(pool, id => base(id) && !owned.has(id) && !present.has(id)) || pick(pool, id => base(id) && !owned.has(id));
    return p || pick(pool, base);
  };
  const swap = (i, j) => { const t = order[i]; order[i] = order[j]; order[j] = t; };
  // is `id` at any pull within gap-1 of pos (other than pos itself and skip)?
  const near = (id, pos, skip) => {
    if (o.gap <= 0) return false;
    for (let k = Math.max(0, pos - o.gap + 1); k <= Math.min(n - 1, pos + o.gap - 1); k++) if (k !== pos && k !== skip && order[k] === id) return true;
    return false;
  };

  // 1 + 2: good and top pulls, forward pass. At pull i the item must be at least class `need` once the wait runs out.
  if (o.good > 0 || o.top > 0) {
    let lastGood = -1, lastTop = -1;
    for (let i = 0; i < n; i++) {
      const needTop = o.top > 0 && i - lastTop >= o.top;
      const needGood = o.good > 0 && i - lastGood >= o.good;
      const need = needTop ? 2 : needGood ? 1 : 0;
      if (need && cls(order[i]) < need) {
        const kind = need === 2 ? 'top' : 'good';
        let j = -1;
        // prefer a later item of exactly the needed class, so top pulls are not used up on a plain good-pull need
        for (let k = i + 1; k < n && j < 0; k++) if (cls(order[k]) === need) j = k;
        if (j < 0 && need === 1) for (let k = i + 1; k < n && j < 0; k++) if (cls(order[k]) > need) j = k;
        if (j >= 0) { swap(i, j); moved[kind]++; }
        else {
          const minR = need === 2 ? o.topFrom : o.goodFrom;
          const pool = rows.filter(r => rar(r.sklid) >= minR);
          const p = draw(pool, i) || pick(pool, () => true);
          if (p) { order[i] = p; present.add(p); swapped[kind]++; } else unmet[kind]++;
        }
      }
      if (cls(order[i]) >= 1) lastGood = i;
      if (cls(order[i]) >= 2) lastTop = i;
    }
  }

  // 3: no repeat within gap pulls. Only looks backwards, so the later copy is the one that moves.
  if (o.gap > 0) {
    for (let i = 1; i < n; i++) {
      let rep = false;
      for (let k = Math.max(0, i - o.gap + 1); k < i; k++) if (order[k] === order[i]) { rep = true; break; }
      if (!rep) continue;
      let j = -1;
      for (let k = i + 1; k < Math.min(n, i + 300); k++) {
        if (cls(order[k]) !== cls(order[i]) || order[k] === order[i]) continue;
        if (!near(order[k], i, k) && !near(order[i], k, i)) { j = k; break; }
      }
      if (j >= 0) { swap(i, j); moved.gap++; continue; }
      const pool = rows.filter(r => rar(r.sklid) === rar(order[i]));
      const p = draw(pool, i, id => id !== order[i]);
      if (p) { order[i] = p; present.add(p); swapped.gap++; } else unmet.gap++;
    }
  }

  // 4: NEW decals. Keeps each slot's class, and rarity when it has to swap one in.
  if (o.fresh > 0) {
    const seen = new Set(); let lastNew = -1;
    for (let i = 0; i < n; i++) {
      const isNewAt = id => !owned.has(id) && !seen.has(id);
      if (isNewAt(order[i])) { seen.add(order[i]); lastNew = i; continue; }
      if (i - lastNew >= o.fresh) {
        let j = -1;
        for (let k = i + 1; k < n; k++) {
          if (cls(order[k]) !== cls(order[i]) || !isNewAt(order[k])) continue;
          if (!near(order[k], i, k) && !near(order[i], k, i)) { j = k; break; }
        }
        if (j >= 0) { swap(i, j); moved.fresh++; }
        else {
          // same rarity first, then any rarity in the same class (so good / top spacing stays intact)
          const same = rows.filter(r => rar(r.sklid) === rar(order[i])), sameCls = rows.filter(r => cls(r.sklid) === cls(order[i]));
          // prefer a decal that is not in the queue at all, then any you do not own
          const p = pick(same, id => isNewAt(id) && !present.has(id) && !near(id, i, -1)) || pick(same, id => isNewAt(id) && !near(id, i, -1))
            || pick(sameCls, id => isNewAt(id) && !present.has(id) && !near(id, i, -1)) || pick(sameCls, id => isNewAt(id) && !near(id, i, -1));
          if (p) { order[i] = p; present.add(p); swapped.fresh++; } else unmet.fresh++;
        }
        lastNew = i; // a window with nothing to give is counted once, not on every pull
      }
      seen.add(order[i]);
    }
  }
  return { newq: order.slice().reverse(), moved, swapped, unmet, before, after: stewRebMetrics(order, owned, o), opt: o, noNew };
}

// Runs a rebalance on the current queue using the shared seed. When the save has no queue, one of the usual length is
// rolled from the game's odds first. Used by both the preview and the Apply button so they always agree.
function stewRebRun() {
  const rows = arr(AP && AP.stewOdds), cur = stewQueue();
  if (STEW_REB.seed == null) STEW_REB.seed = Math.floor(Math.random() * 4294967295);
  const rng = stewRng(STEW_FORM.seed !== '' ? STEW_FORM.seed : STEW_REB.seed);
  let base = cur && cur.length ? cur : null;
  if (!base) { const len = Math.min(parseInt(STEW_FORM.count, 10) > 0 ? parseInt(STEW_FORM.count, 10) : 200, STEW_MAX_LEN); base = stewMakeQueue(rows, len, null, rng); }
  const res = stewRebalance(base, stewOwnedDecals(), rows, STEW_REB, rng);
  res.base = base; res.built = !(cur && cur.length);
  return res;
}

// Fills the preview box under the Rebalance sliders: before / after for every rule, and what it would have to swap in.
function renderStewRebPreview() {
  const host = document.getElementById('stew-reb-preview');
  if (!host) return;
  const rows = arr(AP && AP.stewOdds);
  if (!RAW_SAV_ROOT || !rows.length) { host.innerHTML = ''; return; }
  const o = stewRebOpts();
  // the 'prefer decals I don't own' tick box and the NEW slider mean nothing when there is nothing left to own, so they are hidden then
  const pref = document.getElementById('stew-reb-prefer');
  const canNew = (() => { const owned = stewOwnedDecals(); return rows.some(x => !owned.has(x.sklid)); })();
  if (pref) pref.style.display = canNew ? 'flex' : 'none';
  const freshField = document.getElementById('stew-reb-fresh');
  if (freshField) freshField.style.display = canNew ? '' : 'none';
  let r;
  try { r = stewRebRun(); } catch (e) { host.innerHTML = `<div class="warnNote">${escapeHtml(e.message)}</div>`; return; }
  const off = '<span style="color:var(--text-faint);">off</span>';
  const line = (label, on, b, a, unit) => `<tr><td>${label}</td><td>${on ? `${b} ${unit}` : off}</td><td>${on ? `${a} ${unit}` : off}</td></tr>`;
  const sw = k => r.swapped[k] ? ` · swaps in ${r.swapped[k]}` : '';
  let h = r.built ? '<div class="stewStat" style="margin-bottom:8px;">This save has no queue yet, so Rebalance rolls a fresh one from the game\'s odds first, then balances it.</div>' : '';
  h += `<table class="stewTable"><thead><tr><th>Lower waits are better</th><th>Now</th><th>After</th></tr></thead><tbody>
    <tr><td>Rarity ${o.goodFrom}+ in the queue</td><td>${r.before.goodCount}</td><td>${r.after.goodCount}</td></tr>
    <tr><td>Rarity ${o.topFrom}+ in the queue</td><td>${r.before.topCount}</td><td>${r.after.topCount}</td></tr>
    ${line(`Longest wait for rarity ${o.goodFrom}+`, o.good > 0, r.before.good, r.after.good, 'pulls')}
    ${line(`Longest wait for rarity ${o.topFrom}+`, o.top > 0, r.before.top, r.after.top, 'pulls')}
    ${r.noNew && o.fresh > 0 ? '<tr><td>Longest wait for a NEW decal</td><td colspan="2" style="color:var(--text-faint);">nothing to find: you already own every decal in the pool</td></tr>' : line('Longest wait for a NEW decal', o.fresh > 0, r.before.fresh, r.after.fresh, 'pulls')}
    ${line(`Repeats within ${o.gap} pulls`, o.gap > 0, r.before.repeats, r.after.repeats, 'repeats')}
    ${r.noNew ? '' : `<tr><td>NEW decals queued</td><td>${r.before.newCount}</td><td>${r.after.newCount}</td></tr>`}</tbody></table>`;
  const mv = r.moved.good + r.moved.top + r.moved.gap + r.moved.fresh, sv = r.swapped.good + r.swapped.top + r.swapped.gap + r.swapped.fresh;
  const um = r.unmet.good + r.unmet.top + r.unmet.gap + r.unmet.fresh;
  h += `<div class="capNote" style="margin-top:8px;">${mv} pull(s) moved to a new place${sv ? `, ${sv} swapped in from the game's odds (good ${r.swapped.good}, top ${r.swapped.top}, repeats ${r.swapped.gap}, NEW ${r.swapped.fresh})` : ', nothing swapped in'}.${um ? ` Could not satisfy ${um} window(s): nothing left to draw (for example you own every decal of a rarity you asked for).` : ''}${STEW_FORM.seed !== '' ? '' : ' Click Rebalance for exactly this result; changing a setting rolls a fresh one.'}</div>`;
  host.innerHTML = h;
}

// Rebalance sliders and presets: fills the inputs from STEW_REB and keeps it up to date as you drag.
function wireStewRebalance() {
  const root = document.getElementById('stew-reb');
  if (!root) return;
  const sync = () => {
    root.querySelectorAll('[data-reb]').forEach(el => { el.value = STEW_REB[el.dataset.reb]; const l = root.querySelector(`[data-reb-val="${el.dataset.reb}"]`); if (l) l.textContent = el.type === 'range' ? (Number(el.value) === 0 ? 'off' : el.value) : ''; });
    root.querySelectorAll('[data-reb-chk]').forEach(el => { el.checked = STEW_REB[el.dataset.rebChk] !== false; });
    root.querySelectorAll('[data-reb-preset]').forEach(b => b.classList.toggle('on', b.dataset.rebPreset === STEW_REB.preset));
  };
  root.querySelectorAll('[data-reb]').forEach(el => el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
    STEW_REB[el.dataset.reb] = Number(el.value); STEW_REB.preset = ''; STEW_REB.seed = null; sync(); renderStewRebPreview();
  }));
  root.querySelectorAll('[data-reb-chk]').forEach(el => el.addEventListener('change', () => { STEW_REB[el.dataset.rebChk] = el.checked; STEW_REB.seed = null; renderStewRebPreview(); }));
  root.querySelectorAll('[data-reb-preset]').forEach(b => b.addEventListener('click', () => {
    Object.assign(STEW_REB, STEW_REB_PRESETS[b.dataset.rebPreset], { preset: b.dataset.rebPreset, seed: null }); sync(); renderStewRebPreview();
  }));
  sync();
  renderStewRebPreview();
}

// Static HTML for the Stews tab: explanation, option fields and action buttons (data-stew="...").
function blockStews() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Mushroom Stew</div><h2>Stew Decal Queue</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Stew results are pre-rolled and stored in your save as a queue. Changing the odds does nothing until the queue runs out, so this tab edits the queue directly and the change lands on your very next stew. Close the game before you download the new save, because the game writes the save on exit and would overwrite your edit. Keep a copy of your original .sav.</div>
      <div id="stew-warn"></div>
      <div class="grid" style="margin-bottom:12px;">
        <div class="field"><label>Rarity</label><select id="stew-rarity" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono); font-size:13px;"></select></div>
        <div class="field"><label>Queue length (blank = keep current)</label><input type="number" id="stew-count" min="1" max="${STEW_MAX_LEN}" placeholder="current / 200"></div>
        <div class="field"><label>Seed (optional, repeatable rolls)</label><input type="number" id="stew-seed" placeholder="random"></div>
        <div class="field"><label>Upcoming pulls to list</label><input type="number" id="stew-ahead" min="1" max="${STEW_MAX_LEN}"><label style="display:flex; align-items:center; gap:6px; margin-top:6px; text-transform:none; letter-spacing:0; font-size:11.5px; cursor:pointer;"><input type="checkbox" id="stew-showall" style="accent-color:var(--accent);"> Show whole queue</label></div>
      </div>
      <label class="stewHlOnly" style="margin:0 0 12px; font-size:11.5px;" title="Your save keeps an entry for decals you've sold or used up, with 0 copies. The Python script counted those as owned."><input type="checkbox" id="stew-zero-owned"> Count decals you've had but now have 0 copies of as owned (same as the Python script)</label>
      <div class="stewActions">
        <div class="stewAct"><button class="action" data-stew="dedupe">Dedupe rarity</button><span>Swaps queued pulls of the chosen rarity that would repeat a decal you already own (or one granted earlier in this same queue) for ones that are new to you.</span></div>
        <div class="stewAct"><button class="action" data-stew="front">Move rarity to front</button><span>Reorders the queue so every pull of the chosen rarity comes first. Keeps every decal you were going to get and only changes when you get it.</span></div>
        <div class="stewAct"><button class="action" data-stew="stack">Stack rarity</button><span>Fills the whole queue with the chosen rarity, weighted by the game's odds.</span></div>
        <div class="stewAct"><button class="action" data-stew="regen">Fair reroll</button><span>Rerolls the queue from the game's normal odds, as if you had never touched it.</span></div>
        <div class="stewAct"><button class="action" data-stew="clear">Clear queue</button><span>Empties the queue. The game builds a new one from the current odds on your next stew.</span></div>
        <div class="stewAct"><button class="subtle" data-stew="revert">Undo all stew changes</button><span>Puts the queue back to the way it was when you loaded the save.</span></div>
      </div>
      <div class="stewReb" id="stew-reb" style="margin:14px 0 4px; padding:12px; border:1px solid var(--panel-border);">
        <h3 class="stewH" style="margin-top:0;">Rebalance (pity)</h3>
        <div class="capNote" style="margin-top:0;">The game keeps no pity counter, so this builds it into the order of your queue. It first reorders the pulls you already have so good pulls and NEW decals come at least as often as you set, and only swaps one in from the game's odds when there is nothing left to move. Every number counts pulls from your next stew. 0 turns that rule off. The queue length stays the same.</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin:8px 0 12px;"><button class="subtle" data-reb-preset="gentle">Gentle</button><button class="subtle" data-reb-preset="standard">Standard</button><button class="subtle" data-reb-preset="generous">Generous</button></div>
        <div class="grid" style="margin-bottom:10px;">
          <div class="field"><label>Good pull is rarity</label><select data-reb="goodFrom" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono); font-size:13px;"><option value="2">2 or higher</option><option value="3">3 or higher</option><option value="4">4 or higher</option><option value="5">5</option></select></div>
          <div class="field"><label>Good pull at least every <b data-reb-val="good"></b> pulls</label><input type="range" data-reb="good" min="0" max="60" style="accent-color:var(--accent); width:100%;"></div>
          <div class="field"><label>Top pull is rarity</label><select data-reb="topFrom" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono); font-size:13px;"><option value="3">3 or higher</option><option value="4">4 or higher</option><option value="5">5</option></select></div>
          <div class="field"><label>Top pull at least every <b data-reb-val="top"></b> pulls</label><input type="range" data-reb="top" min="0" max="100" style="accent-color:var(--accent); width:100%;"></div>
          <div class="field" id="stew-reb-fresh"><label>A NEW decal at least every <b data-reb-val="fresh"></b> pulls</label><input type="range" data-reb="fresh" min="0" max="60" style="accent-color:var(--accent); width:100%;"></div>
          <div class="field"><label>Same decal not twice within <b data-reb-val="gap"></b> pulls</label><input type="range" data-reb="gap" min="0" max="40" style="accent-color:var(--accent); width:100%;"></div>
        </div>
        <label id="stew-reb-prefer" style="display:flex; align-items:center; gap:6px; margin:0 0 10px; font-size:12px; cursor:pointer;" title="Applies when a rule has to swap a pull in from the game's odds"><input type="checkbox" data-reb-chk="preferNew" style="accent-color:var(--accent);"> Prefer decals I don't own when a pull has to be swapped in</label>
        <div id="stew-reb-preview"></div>
        <div class="stewAct" style="margin-top:10px;"><button class="action" data-stew="rebalance">Rebalance queue</button><span>Applies exactly what the preview shows. Undo all stew changes puts the queue back.</span></div>
      </div>
      <div id="stew-msg"></div>
      <div id="stew-report"></div>
    </div>
  </section>`;
}

// Rarity colors used for highlight chips and badges.
const STEW_RAR_COLORS = { '5': '#e6b422', '4': '#b07cf0', '3': '#4ea3ef', '2': '#5cc46e', '1': '#a0a0a0' };
// Color for a rarity key, red fallback.
function stewRarColor(k) { return STEW_RAR_COLORS[String(k)] || '#d6392c'; }

// Re-renders the whole Stews report: warnings, button enable states, log, stats, rarity table, the list
// of upcoming pulls (queue reversed so pull 1 is the end of the array), and the game-odds table. Also
// attaches the highlight/CSV listeners to the freshly created DOM.
function renderStewReport() {
  const host = document.getElementById('stew-report');
  if (!host || !SAVE) return;
  stewSyncState();
  const warn = document.getElementById('stew-warn');
  const rows = arr(AP && AP.stewOdds);
  const q = stewQueue();
  const changed = JSON.stringify(q || null) !== JSON.stringify(STEW_STATE.original);
  let w = '';
  // build top warnings (actions that need odds from masters.db are disabled below when there are none)
  if (!RAW_SAV_ROOT) w += '<div class="warnNote">Stew editing needs a .sav (or the full .json dump). Load one to use this tab.</div>';
  else if (!rows.length) w += `<div class="warnNote">No stew odds for ${STEW_GACHA_ID} in this masters.db. Dedupe, stack and reroll are off. Move to front and clear still work.</div>`;
  if (changed) w += '<div class="warnNote" style="border-color:var(--good); color:var(--good-bright);">Stew queue changed. Download the .sav to keep it.</div>';
  if (warn) warn.innerHTML = w;
  document.querySelectorAll('[data-stew]').forEach(b => {
    const m = b.dataset.stew;
    b.disabled = !RAW_SAV_ROOT || (['dedupe', 'stack', 'regen', 'rebalance'].includes(m) && !rows.length) || (['dedupe', 'front'].includes(m) && !(q && q.length)) || (m === 'revert' && !changed);
  });
  const msg = document.getElementById('stew-msg');
  if (msg) msg.innerHTML = STEW_STATE.lastMsg ? `<pre class="stewLog">${escapeHtml(STEW_STATE.lastMsg)}</pre>` : '';
  if (!RAW_SAV_ROOT) { host.innerHTML = ''; return; }

  // owned decals drive NEW / own / dupe labels
  const owned = stewOwnedDecals();
  let html = '';
  if (!q || !q.length) {
    html += `<div class="stewStat"><b>No stew queue in this save.</b> The game builds one on your next stew, from the odds below.</div>`;
  } else {
    const order = q.slice().reverse(); // imminent first: the game pops from the END, so the last element is pull 1
    const hist = stewHistogram(q);
    const keys = Object.keys(hist).sort((a, b) => (b === '?') - (a === '?') || Number(b) - Number(a));
    const firstSeen = new Set(), isNew = order.map(s => { const n = !owned.has(s) && !firstSeen.has(s); firstSeen.add(s); return n; });
    const newCount = isNew.filter(Boolean).length;
    const firstNew = isNew.indexOf(true);
    const counts = {};
    for (const s of order) counts[s] = (counts[s] || 0) + 1;
    const reps = Object.values(counts).filter(n => n > 1);
    html += `<div class="stewStats">
      <div class="stewStat"><div class="k">Queued pulls</div><div class="v">${q.length}</div></div>
      <div class="stewStat"><div class="k">New decals queued</div><div class="v">${newCount}</div><div class="s">${firstNew >= 0 ? `first new: ${escapeHtml(stewName(order[firstNew]))}, pull ${firstNew + 1}` : 'none'}</div></div>
      <div class="stewStat"><div class="k">Repeats</div><div class="v">${reps.length}</div><div class="s">${reps.length ? `decals queued more than once, worst ${Math.max(...reps)}x` : 'no decal queued twice'}</div></div>
    </div>`;
    html += '<table class="stewTable"><thead><tr><th>Rarity</th><th>Queued</th><th>Share</th><th>Next one</th></tr></thead><tbody>';
    for (const k of keys) {
      const nxt = order.findIndex(s => String(stewRarity(s) == null ? '?' : stewRarity(s)) === k);
      html += `<tr><td>r${k}</td><td>${hist[k]}</td><td><div class="stewBar"><span style="width:${(100 * hist[k] / q.length).toFixed(1)}%"></span></div></td><td>${nxt === 0 ? 'this pull' : `in ${nxt + 1} pulls`}</td></tr>`;
    }
    html += '</tbody></table>';
    const ahead = STEW_FORM.showAll ? order.length : Math.min(Math.max(parseInt(STEW_FORM.ahead, 10) || 10, 1), STEW_MAX_LEN);
    const hl = new Set(STEW_FORM.hl.map(String));
    const rk = s => String(stewRarity(s) == null ? '?' : stewRarity(s));
    const qRar = Object.keys(hist).sort((a, b) => (a === '?') - (b === '?') || Number(b) - Number(a));
    html += `<div class="stewHlBar"><span class="lbl">Highlight:</span>${qRar.map(k => `<button class="stewHlChip ${hl.has(k) ? 'on' : ''}" data-stew-hl="${k}" style="--rc:${stewRarColor(k)}">r${k} <span>${hist[k]}</span></button>`).join('')}
      <button class="subtle" data-stew-hl-clear ${hl.size ? '' : 'disabled'}>Clear</button>
      <label class="stewHlOnly"><input type="checkbox" id="stew-hl-only" ${STEW_FORM.hlOnly ? 'checked' : ''} ${hl.size ? '' : 'disabled'}> Only show highlighted</label></div>`;
    const listed = order.slice(0, ahead).map((s, i) => ({ s, i })).filter(x => !(STEW_FORM.hlOnly && hl.size) || hl.has(rk(x.s)));
    const title = STEW_FORM.showAll || ahead >= order.length ? `Whole queue (${order.length} pulls, next pull first)` : `Next ${ahead} of ${order.length} pulls`;
    html += `<h3 class="stewH" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">${title}${STEW_FORM.hlOnly && hl.size ? ` · ${listed.length} highlighted` : ''}<button class="subtle" id="stew-csv" style="margin-left:auto;" title="Every pull in the queue (next pull first) and the game's odds for every decal, as a spreadsheet file">Export to CSV</button></h3><div class="listBlock" style="max-height:${STEW_FORM.showAll ? 600 : 420}px;">`;
    html += listed.map(({ s, i }) => { const k = rk(s); const on = hl.has(k); return `<div class="listRow${on ? ' stewHl' : ''}" ${on ? `style="--rc:${stewRarColor(k)}"` : ''}><span style="width:44px; color:var(--text-faint);">${i + 1}.</span><div class="name">${decalIcon(s, 22).replace('class="dicon"', 'class="dicon lead"')}${escapeHtml(stewName(s))}</div><span class="badge stewRarBadge" style="--rc:${stewRarColor(k)}">r${k}</span>${isNew[i] ? '<span class="badge current" style="width:44px; text-align:center;">NEW</span>' : `<span class="badge" style="width:44px; text-align:center; opacity:0.5;">${owned.has(s) ? 'own' : 'dupe'}</span>`}<div class="id">${s}</div></div>`; }).join('') || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No pulls of the highlighted rarities in this range.</div>';
    html += '</div>';
  }
  if (rows.length) {
    const total = rows.reduce((a, r) => a + r.odds, 0) || 1;
    const perR = {};
    for (const r of rows) { const k = stewRarity(r.sklid) == null ? '?' : stewRarity(r.sklid); perR[k] = (perR[k] || 0) + r.odds; }
    const rk = Object.keys(perR).sort((a, b) => Number(b) - Number(a));
    const open = STEW_FORM.showOdds || !q || !q.length;
    html += `<details class="subDetails" id="stew-odds" style="margin-top:14px;" ${open ? 'open' : ''}><summary>▸ Game odds (${rows.length} decals in the pool, ${escapeHtml(AP.stewOddsId || STEW_GACHA_ID)})</summary><div class="subDetailsBody">`;
    html += '<table class="stewTable"><thead><tr><th>Rarity</th><th>Chance</th><th>On average</th></tr></thead><tbody>';
    for (const k of rk) { const p = perR[k] / total; html += `<tr><td>r${k}</td><td>${(100 * p).toFixed(2)}%</td><td>1 in ${(1 / p).toFixed(1)} pulls</td></tr>`; }
    html += '</tbody></table><h3 class="stewH">Rarest decals</h3><table class="stewTable"><tbody>';
    for (const r of rows.slice().sort((a, b) => a.odds - b.odds).slice(0, 12)) {
      html += `<tr><td>${escapeHtml(stewName(r.sklid))}</td><td>r${stewRarity(r.sklid) == null ? '?' : stewRarity(r.sklid)}</td><td>${(100 * r.odds / total).toFixed(3)}%</td><td>1 in ${Math.round(total / r.odds)}</td><td>${owned.has(r.sklid) ? 'own' : 'NEW'}</td></tr>`;
    }
    html += '</tbody></table></div></details>';
  }
  host.innerHTML = html;
  renderStewRebPreview(); // owned decals / queue may have changed
  // the report was just rebuilt, so every listener below is attached fresh to the new elements
  host.querySelectorAll('[data-stew-hl]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.stewHl;
    const set = new Set(STEW_FORM.hl.map(String));
    if (set.has(k)) set.delete(k); else set.add(k);
    STEW_FORM.hl = [...set];
    renderStewReport();
  }));
  const hlClear = host.querySelector('[data-stew-hl-clear]');
  if (hlClear) hlClear.addEventListener('click', () => { STEW_FORM.hl = []; renderStewReport(); });
  const hlOnly = document.getElementById('stew-hl-only');
  if (hlOnly) hlOnly.addEventListener('change', () => { STEW_FORM.hlOnly = hlOnly.checked; renderStewReport(); });
  const det = document.getElementById('stew-odds');
  if (det) det.addEventListener('toggle', () => { STEW_FORM.showOdds = det.open; });
  const csv = document.getElementById('stew-csv');
  if (csv) csv.addEventListener('click', () => {
    const t = new Date(), p = n => String(n).padStart(2, '0');
    const nm = `stew_queue_${String((SAVE.user && SAVE.user.nm) || 'save').replace(/[^\w-]+/g, '_')}_${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}_${p(t.getHours())}${p(t.getMinutes())}.csv`;
    triggerDownload(stewCsv(), nm, 'text/csv;charset=utf-8');
    toast('Exported ' + nm);
  });
}

// ==== Stew CSV export ====
// The stew queue as CSV: every pull, next pull first, as it stands now (edits included), then the game's odds
// for every decal in the pool. New / own / dupe match the list on the tab.
// Quotes a CSV cell when it contains a quote, comma or newline (doubling quotes).
const csvCell = v => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
// Builds the CSV text (UTF-8 BOM + CRLF so spreadsheets open it correctly: the BOM makes Excel read UTF-8 names properly).
function stewCsv() {
  const q = stewQueue() || [], order = q.slice().reverse(), owned = stewOwnedDecals();
  const rows = arr(AP && AP.stewOdds), total = rows.reduce((a, r) => a + r.odds, 0) || 0;
  const odds = {};
  for (const r of rows) odds[r.sklid] = (odds[r.sklid] || 0) + r.odds;
  const pct = id => total && odds[id] ? Number((100 * odds[id] / total).toFixed(4)) : '';
  const rar = id => stewRarity(id) == null ? '?' : stewRarity(id);
  const changed = JSON.stringify(q) !== JSON.stringify(STEW_STATE.original || []);
  const L = [ [ 'Stew queue', changed ? 'edited in the editor, not downloaded yet' : 'as in the save', `${order.length} pulls` ].map(csvCell).join(','), '' ];
  L.push([ 'Pull', 'Decal', 'Rarity', 'Status', 'Chance per pull (%)', 'Decal ID' ].join(','));
  const seen = new Set();
  order.forEach((id, i) => {
    const st = owned.has(id) ? 'own' : seen.has(id) ? 'dupe' : 'NEW';
    seen.add(id);
    L.push([ i + 1, String(stewName(id)).trim(), rar(id), st, pct(id), id ].map(csvCell).join(','));
  });
  if (rows.length) {
    L.push('', [ 'Game odds', 'Decal', 'Rarity', 'Chance per pull (%)', 'On average (1 in N pulls)', 'Owned', 'Decal ID' ].join(','));
    for (const id of Object.keys(odds).sort((a, b) => odds[a] - odds[b])) L.push([ 'Game odds', String(stewName(id)).trim(), rar(id), pct(id), Math.round(total / odds[id]), owned.has(id) ? 'yes' : '', id ].map(csvCell).join(','));
  }
  return '\ufeff' + L.join('\r\n') + '\r\n';
}

// Executes one Stews tab action: 'revert' | 'front' | 'dedupe' | 'clear' | 'regen' | 'stack'.
// Changes the editable queue via setStewQueue, writes a human-readable log to STEW_STATE.lastMsg,
// re-renders and toasts. Throws (caught by the click handler) on e.g. missing odds.
function runStewAction(mode) {
  stewSyncState();
  const rows = arr(AP && AP.stewOdds);
  const cur = stewQueue();
  const rarity = STEW_FORM.rarity;
  const rng = stewRng(STEW_FORM.seed);
  const lines = [];
  let length = parseInt(STEW_FORM.count, 10);
  if (!(length > 0)) length = cur && cur.length ? cur.length : 200;
  length = Math.min(length, STEW_MAX_LEN); // blank length keeps the current size (200 if there is no queue)
  if (mode === 'revert') {
    if (STEW_STATE.hadQueue) setStewQueue(STEW_STATE.original.slice());
    else setStewQueue(null);
    lines.push('Stew queue restored to how it was when you loaded the save.');
  } else if (mode === 'front') {
    const pick = cur.filter(s => stewRarity(s) === rarity);
    const rest = cur.filter(s => stewRarity(s) !== rarity);
    setStewQueue(rest.concat(pick)); // game pulls from the END, so the wanted pulls go last to be pulled first
    if (!pick.length) lines.push(`No rarity-${rarity} pulls in the queue. Nothing moved.`);
    else {
      lines.push(`Moved ${pick.length} rarity-${rarity} pull(s) to the front of the queue (${cur.length} total).`);
      for (const s of pick.slice().reverse().slice(0, 12)) lines.push(`   ${stewName(s)}  (${s})`);
      if (pick.length > 12) lines.push(`   ... and ${pick.length - 12} more`);
    }
  } else if (mode === 'dedupe') {
    const res = stewDedupe(cur, stewOwnedDecals(), rows, rarity, rng);
    setStewQueue(res.newq);
    if (!res.swapped.length && res.startedEmpty) lines.push(`You already own every rarity-${rarity} decal in the pool. Nothing to swap in.`);
    else if (!res.swapped.length) lines.push(`No rarity-${rarity} pull in the queue would repeat one you already have. Nothing changed.`);
    else {
      lines.push(`Deduped ${res.swapped.length} rarity-${rarity} pull(s) that would have repeated a decal you already have. Swapped in ones that are new to you:`);
      for (const [o, n] of res.swapped.slice(0, 20)) lines.push(`   ${stewName(o)}  ->  ${stewName(n)}`);
      if (res.swapped.length > 20) lines.push(`   ... and ${res.swapped.length - 20} more`);
      if (res.ranOut) lines.push(`Ran out of rarity-${rarity} decals you don't own partway through. Left ${res.ranOut} repeat pull(s) unchanged.`);
    }
  } else if (mode === 'rebalance') {
    const res = stewRebRun(), o = res.opt;
    setStewQueue(res.newq);
    const mv = res.moved.good + res.moved.top + res.moved.gap + res.moved.fresh, sv = res.swapped.good + res.swapped.top + res.swapped.gap + res.swapped.fresh;
    lines.push(`Rebalanced ${res.newq.length} pulls${res.built ? ' (rolled a fresh queue first)' : ''}: ${mv} moved, ${sv} swapped in.`);
    lines.push(`  rules : rarity ${o.goodFrom}+ every ${o.good || 'off'}, rarity ${o.topFrom}+ every ${o.top || 'off'}, NEW every ${o.fresh || 'off'}, no repeat within ${o.gap || 'off'}`);
    lines.push(`  longest wait for rarity ${o.goodFrom}+: ${res.before.good} -> ${res.after.good} pulls`);
    if (o.top) lines.push(`  longest wait for rarity ${o.topFrom}+: ${res.before.top} -> ${res.after.top} pulls`);
    if (res.noNew && STEW_REB.fresh) lines.push('  NEW rule skipped: you already own every decal in the pool.');
    if (o.fresh) lines.push(`  longest wait for a NEW decal: ${res.before.fresh} -> ${res.after.fresh} pulls`);
    lines.push(`  before: ${stewHistText(res.base)}`);
    lines.push(`  after : ${stewHistText(res.newq)}`);
    const um = res.unmet.good + res.unmet.top + res.unmet.gap + res.unmet.fresh;
    if (um) lines.push(`  ${um} window(s) could not be satisfied: nothing left to draw.`);
    STEW_REB.seed = null; // next preview rolls fresh
  } else if (mode === 'clear') {
    setStewQueue([]); // empty array, not null: an empty queue is what makes the game rebuild from the current odds
    lines.push('Cleared the queue. The game rebuilds it from the current odds on your next stew.');
  } else { // regen / stack
    const newq = stewMakeQueue(rows, length, mode === 'stack' ? rarity : null, rng);
    setStewQueue(newq);
    lines.push(mode === 'stack' ? `Stacked ${length} rarity-${rarity} pulls.` : `Rerolled ${length} pulls from the game's normal odds.`);
    lines.push(`  before: ${stewHistText(cur || [])}`);
    lines.push(`  after : ${stewHistText(newq)}`);
  }
  STEW_STATE.lastMsg = lines.join('\n');
  renderStewReport();
  toast(lines[0]);
}

// Wires the Stews tab: rarity dropdown, length/seed/ahead inputs, option checkboxes and action buttons.
function wireStews() {
  if (!document.getElementById('stew-report')) return;
  stewSyncState();
  const sel = document.getElementById('stew-rarity');
  const rs = stewRarities();
  // keep the earlier choice if it is still a valid rarity, otherwise fall back to the highest
  if (STEW_FORM.rarity == null || !rs.includes(STEW_FORM.rarity)) STEW_FORM.rarity = rs[0];
  sel.innerHTML = rs.map(r => `<option value="${r}" ${r === STEW_FORM.rarity ? 'selected' : ''}>Rarity ${r}</option>`).join('');
  sel.addEventListener('change', () => { STEW_FORM.rarity = Number(sel.value); });
  const cnt = document.getElementById('stew-count'), seed = document.getElementById('stew-seed'), ahead = document.getElementById('stew-ahead');
  cnt.value = STEW_FORM.count;
  seed.value = STEW_FORM.seed;
  ahead.value = STEW_FORM.ahead;
  cnt.addEventListener('change', () => {
    let v = parseInt(cnt.value, 10);
    if (cnt.value !== '' && !(v > 0)) v = 1;
    if (v > STEW_MAX_LEN) { v = STEW_MAX_LEN; toast(`Clamped to ${STEW_MAX_LEN}`); }
    STEW_FORM.count = cnt.value === '' ? '' : String(v);
    cnt.value = STEW_FORM.count;
  });
  // 4294967295 is the largest 32-bit value, which is all the seeded PRNG uses
  seed.addEventListener('change', () => { const n = parseInt(seed.value, 10); STEW_FORM.seed = seed.value === '' || !(n >= 0) ? '' : String(Math.min(n, 4294967295)); seed.value = STEW_FORM.seed; });
  ahead.addEventListener('change', () => { STEW_FORM.ahead = ahead.value; renderStewReport(); });
  const zeroOwned = document.getElementById('stew-zero-owned');
  zeroOwned.checked = STEW_FORM.zeroOwned;
  zeroOwned.addEventListener('change', () => { STEW_FORM.zeroOwned = zeroOwned.checked; renderStewReport(); });
  const showAll = document.getElementById('stew-showall');
  showAll.checked = STEW_FORM.showAll;
  ahead.disabled = STEW_FORM.showAll;
  showAll.addEventListener('change', () => { STEW_FORM.showAll = showAll.checked; ahead.disabled = showAll.checked; renderStewReport(); });
  document.querySelectorAll('[data-stew]').forEach(b => b.addEventListener('click', () => {
    try { runStewAction(b.dataset.stew); }
    catch (err) { toast('Stew edit failed: ' + err.message, true); }
  }));
  wireStewRebalance();
  if (activeTab === 'stews') renderStewReport();
}

