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
// Upper bound for queue length the editor will generate.
const STEW_MAX_LEN = 5000;
// Per-save bookkeeping: original queue (for Undo), whether the save had one, last log message.
let STEW_STATE = { root: null, original: null, hadQueue: false, lastMsg: '' };
// Persistent UI form state for the Stews tab (selected rarity, length, RNG seed, listing options, highlights).
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
function setStewQueue(q) { stewQueue(); STEW_WORK.q = q; }
// Download-pipeline step: write the edited queue into root (creating soul/skl/gacha/normal if needed).
// Does nothing when the queue was not touched for this save or still equals the loaded one. Returns root.
function applyStews(root) {
  if (STEW_WORK.root !== RAW_SAV_ROOT || !root) return root;
  const q = STEW_WORK.q, loaded = rawStewQueue(root);
  if (JSON.stringify(q) === JSON.stringify(loaded)) return root;
  if (q === null) { if (loaded) delete root.soul.skl.gacha.normal.sklids; return root; }
  const soul = root.soul = root.soul || {};
  soul.skl = soul.skl || {};
  soul.skl.gacha = soul.skl.gacha || {};
  soul.skl.gacha.normal = soul.skl.gacha.normal || {};
  soul.skl.gacha.normal.sklids = q.slice();
  return root;
}

// Snapshots the original queue the first time a given save is seen (so "Undo all stew changes" works).
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
// Every decal id the player already has (so duplicates can be flagged).
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
  // Only YOUR fighters' decals count. The other groups in eqskl (negative ids) are other players' fighters stored in the save;
  // they are not in your inventory, so they must not make a decal look owned. Your own group (the main uid) comes from the live state below.
  const hadEntry = new Set(arr(skl.psskl).map(e => e && e.sklid));
  for (const e of arr(SAVE && SAVE.soul && SAVE.soul.psskls)) {
    if (!e || !e.id) continue;
    if (e.cnt == null || e.cnt > 0 || (STEW_FORM.zeroOwned && hadEntry.has(e.id))) got.add(e.id);
  }
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) for (const e of arr(c.eqskls)) {
    const id = e.sklid || e.id;
    if (id) got.add(id);
  }
  return got;
}

// Returns a random function: Math.random if no valid seed, else a seeded deterministic mulberry32 PRNG.
function stewRng(seed) {
  if (seed === '' || seed == null || isNaN(Number(seed))) return Math.random;
  let a = (Number(seed) >>> 0) || 1;
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
    let lo = 0, hi = cum.length; // bisect_right
    while (lo < hi) { const mid = (lo + hi) >> 1; if (x < cum[mid]) hi = mid; else lo = mid + 1; }
    out.push(ids[Math.min(lo, ids.length - 1)]);
  }
  return out;
}

// Picks one entry from the Map(sklid -> odds) by weight and removes it so it cannot be picked twice.
function stewWeightedTake(fresh, rng) {
  const items = [...fresh.entries()];
  const tot = items.reduce((a, [, o]) => a + o, 0);
  const r = rng() * tot;
  let acc = 0;
  for (const [s, o] of items) { acc += o; if (r <= acc) { fresh.delete(s); return s; } }
  const s = items[items.length - 1][0];
  fresh.delete(s);
  return s;
}

// Dedupe: walks the queue from the END (the imminent pull first) and replaces target-rarity pulls
// that repeat an owned decal, or one already granted earlier in this queue, with a not-yet-owned
// decal drawn by odds. Returns {newq, swapped:[[old,new]], ranOut, startedEmpty}; does not mutate queue.
function stewDedupe(queue, owned, rows, target, rng) {
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
function stewRarities() {
  const set = new Set();
  for (const r of arr(AP && AP.stewOdds)) { const x = stewRarity(r.sklid); if (x != null) set.add(x); }
  const q = stewQueue();
  if (q) for (const s of q) { const x = stewRarity(s); if (x != null) set.add(x); }
  const list = [...set].sort((a, b) => b - a);
  return list.length ? list : [5, 4, 3, 2, 1];
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
  // build top warnings
  if (!RAW_SAV_ROOT) w += '<div class="warnNote">Stew editing needs a .sav (or the full .json dump). Load one to use this tab.</div>';
  else if (!rows.length) w += `<div class="warnNote">No stew odds for ${STEW_GACHA_ID} in this masters.db. Dedupe, stack and reroll are off. Move to front and clear still work.</div>`;
  if (changed) w += '<div class="warnNote" style="border-color:var(--good); color:var(--good-bright);">Stew queue changed. Download the .sav to keep it.</div>';
  if (warn) warn.innerHTML = w;
  document.querySelectorAll('[data-stew]').forEach(b => {
    const m = b.dataset.stew;
    b.disabled = !RAW_SAV_ROOT || (['dedupe', 'stack', 'regen'].includes(m) && !rows.length) || (['dedupe', 'front'].includes(m) && !(q && q.length)) || (m === 'revert' && !changed);
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
    const order = q.slice().reverse(); // imminent first
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
    html += listed.map(({ s, i }) => { const k = rk(s); const on = hl.has(k); return `<div class="listRow${on ? ' stewHl' : ''}" ${on ? `style="--rc:${stewRarColor(k)}"` : ''}><span style="width:44px; color:var(--text-faint);">${i + 1}.</span><div class="name">${escapeHtml(stewName(s))}</div><span class="badge stewRarBadge" style="--rc:${stewRarColor(k)}">r${k}</span>${isNew[i] ? '<span class="badge current" style="width:44px; text-align:center;">NEW</span>' : `<span class="badge" style="width:44px; text-align:center; opacity:0.5;">${owned.has(s) ? 'own' : 'dupe'}</span>`}<div class="id">${s}</div></div>`; }).join('') || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No pulls of the highlighted rarities in this range.</div>';
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
// Builds the CSV text (UTF-8 BOM + CRLF so spreadsheets open it correctly).
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
  length = Math.min(length, STEW_MAX_LEN);
  if (mode === 'revert') {
    if (STEW_STATE.hadQueue) setStewQueue(STEW_STATE.original.slice());
    else setStewQueue(null);
    lines.push('Stew queue restored to how it was when you loaded the save.');
  } else if (mode === 'front') {
    const pick = cur.filter(s => stewRarity(s) === rarity);
    const rest = cur.filter(s => stewRarity(s) !== rarity);
    setStewQueue(rest.concat(pick)); // game pulls from the END
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
  } else if (mode === 'clear') {
    setStewQueue([]);
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
  if (activeTab === 'stews') renderStewReport();
}

