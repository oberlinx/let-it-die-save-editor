// ==== Lost Bags and Death Boxes ====
// ---------------------------------------------------------------------------
// LOST BAGS (soul.mysterybag) and DEATH BOXES (soul.deathbox)
// Lost Bags (earned from Tokyo Death Metro attacks/defenses) are pre-rolled
// like stews: soul.mysterybag holds, per rarity, a list of content ids
// (MYSTERYBAG_GEN_*) that master_mysterybag_content_gen[_odds] maps to a
// master_reward. Death boxes are stored with their contents already filled in
// ({rarity, type, num, val0.., created, opentime}); the pool for each rarity
// is master_deathbox_content_gen -> master_reward.
// SAVE.soul.mysterybag / SAVE.soul.deathbox are the objects the save is
// rebuilt from, so edits here ship with Download .sav.
// ---------------------------------------------------------------------------

// Lost Bag rarities in display order.
const BAG_RARITIES = [ 'RAINBOW', 'PLATINUM', 'GOLD', 'SILVER', 'COPPER' ];
// Rarity colors for chips and headings.
const BAG_COLORS = { RAINBOW: '#e6b422', PLATINUM: '#b07cf0', GOLD: '#d9a520', SILVER: '#b8c0c8', COPPER: '#c47a44', BLUE: '#4ea3ef' };
// Rarities available for Death Boxes.
const BOX_RARITIES = [ 'GOLD', 'SILVER', 'COPPER', 'BLUE' ];
// Per-save original snapshots (for Undo) and last log message for bags/boxes.
let BAG_STATE = { root: null, original: null, lastMsg: '' };
let BOX_STATE = { root: null, original: null, lastMsg: '' };
// UI state: expanded pool lists, selected "fill" entry per rarity; selection for adding a box.
const BAG_FORM = { open: {}, fill: {} };
const BOX_FORM = { addRarity: 'GOLD', addContent: '' };

// "GOLD" -> "Gold".
function bagTitle(r) { return r.charAt(0) + r.slice(1).toLowerCase(); }
// Small colored rarity badge HTML.
function bagChip(r) { return `<span class="badge" style="border-color:${BAG_COLORS[r] || 'var(--panel-border-bright)'}; color:${BAG_COLORS[r] || 'var(--text)'};">${bagTitle(r)}</span>`; }

// reward -> readable name (shared by both tabs)
// Blueprint items (ITMP_*) are shown as "Blueprint: <part name>".
function rewardLabel(type, num, v0) {
  const n = num > 1 ? ` ×${Number(num).toLocaleString()}` : '';
  if (type === 'MONEY') return `${Number(num).toLocaleString()} Kill Coins`;
  if (type === 'SPIRIT') return `${Number(num).toLocaleString()} SPLithium`;
  let nm = null;
  if (type === 'SKILL') nm = SKL_INDEX[v0] && `Decal: ${decalNameP(v0)}`;
  else if (type === 'MUSHROOM') nm = MSR_INDEX[v0] && `Mushroom: ${MSR_INDEX[v0].name}`;
  else if (type === 'BEAST') nm = BST_INDEX[v0] && `Beast: ${BST_INDEX[v0].name}`;
  else if (ITEM_INDEX[v0]) {
    const bp = String(v0).startsWith('ITMP_') && PT_INDEX[String(v0).replace(/^ITMP_/, 'PT_')];
    nm = bp ? `Blueprint: ${bp.name}` : ITEM_INDEX[v0].name;
  } else if (PT_INDEX[v0]) nm = PT_INDEX[v0].name;
  return (nm || `${type} ${v0 || ''}`.trim()) + (type === 'MONEY' || type === 'SPIRIT' ? '' : n);
}
// Looks up a master_reward row by id from the quest metadata; null if unknown.
function rwdRow(rwdid) {
  const r = questMeta().rwd[rwdid];
  return r || null;
}
// Display name for a reward id (MEDAL money rewards are shown as Death Metal).
function rewardName(rwdid) {
  const r = rwdRow(rwdid);
  if (!r) return rwdid || '?';
  if (r.type === 'MONEY' && /MEDAL/.test(rwdid)) return 'Death Metal';
  return rewardLabel(r.type, r.num, r.val0);
}

// ---------------- Lost Bags ----------------
// Returns SAVE.soul.mysterybag (an object keyed by rarity -> arrays of {rarity, cntgen}) or null.
function bagData() {
  const s = SAVE && SAVE.soul;
  if (!s || !s.mysterybag || typeof s.mysterybag !== 'object' || Array.isArray(s.mysterybag)) return null;
  return s.mysterybag;
}
// Snapshots the bag data when a new save is loaded (for Undo).
function bagSync() {
  if (BAG_STATE.root !== RAW_SAV_ROOT) {
    const b = bagData();
    BAG_STATE = { root: RAW_SAV_ROOT, original: b ? JSON.parse(JSON.stringify(b)) : null, lastMsg: '' };
  }
}
// every content id we know about -> {id, rarity, freq, rwdid}
function bagGenIndex() {
  const idx = {};
  for (const r of arr(AP && AP.bagGen)) idx[r.id] = r;
  for (const r of arr(AP && AP.bagGenOdds)) idx[r.id] = Object.assign({}, idx[r.id] || {}, r);
  return idx;
}
// the pool the game rolls from: the offline odds table, else the base table
// The pool the game rolls from for a rarity: offline odds rows if present, else base rows (freq > 0),
// annotated with probability p and a readable name.
function bagPool(rarity) {
  const odds = arr(AP && AP.bagGenOdds).filter(r => r.rarity === rarity && r.freq > 0);
  const rows = odds.length ? odds : arr(AP && AP.bagGen).filter(r => r.rarity === rarity && r.freq > 0);
  const tot = rows.reduce((a, r) => a + r.freq, 0) || 1;
  return rows.map(r => ({ id: r.id, rwdid: r.rwdid, freq: r.freq, p: r.freq / tot, name: rewardName(r.rwdid) }));
}
// Weighted pick of n pool entries by freq; returns an array of content ids.
function bagRoll(pool, n, rng) {
  const tot = pool.reduce((a, r) => a + r.freq, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    let x = rng() * tot, pick = pool[pool.length - 1];
    for (const r of pool) { x -= r.freq; if (x < 0) { pick = r; break; } }
    out.push(pick.id);
  }
  return out;
}

// Static HTML for the Lost Bags tab. Note: the game takes the FIRST entry of each list (unlike stews, which pop the end).
function blockBags() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Mystery bags · Tokyo Death Metro</div><h2>Lost Bags</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">What each Lost Bag rarity will give is rolled in advance and stored in your save, a short list per rarity. The contents are picked when you <b>earn</b> a bag, so these lists decide future bags only; bags already in your Reward Box keep what they have (change those on the Rewards tab). The game takes the top entry of the list and doesn't refill it, so #1 is your next bag of that rarity (confirmed in game).</div>
      <div id="bag-body"></div>
    </div>
  </section>`;
}

// Renders per-rarity lists with per-slot dropdowns, Fill-all and Fair-reroll buttons, Undo, and the pool odds.
// Edits mutate SAVE.soul.mysterybag directly and then re-render.
function renderBags() {
  const host = document.getElementById('bag-body');
  if (!host || !SAVE) return;
  bagSync();
  const b = bagData();
  if (!b) { host.innerHTML = '<div class="warnNote">This save has no Lost Bag data (soul.mysterybag).</div>'; return; }
  const gen = bagGenIndex();
  const changed = JSON.stringify(b) !== JSON.stringify(BAG_STATE.original);
  let h = '';
  if (changed) h += `<div class="warnNote" style="display:flex; gap:10px; align-items:center; border-color:var(--good); color:var(--good-bright);"><div style="flex:1;">Lost Bags changed. Download the .sav to keep it.</div><button class="subtle" id="bag-undo">Undo all Lost Bag changes</button></div>`;
  if (BAG_STATE.lastMsg) h += `<pre class="stewLog">${escapeHtml(BAG_STATE.lastMsg)}</pre>`;
  const rars = BAG_RARITIES.filter(r => r in b).concat(Object.keys(b).filter(r => !BAG_RARITIES.includes(r)));
  for (const r of rars) {
    const list = arr(b[r]);
    const pool = bagPool(r);
    const order = list.map((e, i) => ({ e, i })); // the game takes the FIRST entry (confirmed in game)
    const fillSel = BAG_FORM.fill[r] || (pool[0] && pool[0].id) || '';
    h += `<div class="subDetails" style="padding:10px; margin-bottom:12px;">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
        <b style="color:${BAG_COLORS[r] || 'var(--text)'}; font-size:14px;">${bagTitle(r)} Lost Bag</b>
        <span class="id">${list.length} pre-rolled</span>
        <span style="flex:1;"></span>
        <select data-bag-fillsel="${r}" style="max-width:320px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:5px 6px; font-family:var(--mono); font-size:11.5px;">
          ${pool.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${p.id}" ${p.id === fillSel ? 'selected' : ''}>${escapeHtml(p.name)} (${(100 * p.p).toFixed(1)}%)</option>`).join('')}
        </select>
        <button class="subtle" data-bag-fill="${r}" ${pool.length ? '' : 'disabled'}>Fill all with this</button>
        <button class="subtle" data-bag-reroll="${r}" ${pool.length ? '' : 'disabled'}>Fair reroll</button>
      </div>
      <div class="listBlock" style="max-height:none;">`;
    h += order.map((x, k) => {
      const g = gen[x.e.cntgen];
      const nm = g ? rewardName(g.rwdid) : x.e.cntgen;
      const p = pool.find(pp => pp.id === x.e.cntgen);
      return `<div class="listRow"><span style="width:34px; color:var(--text-faint);">${k + 1}.</span>
        <div class="name">${escapeHtml(nm)}${p ? '' : ' <span class="badge" title="Not in the current offline pool">not in pool</span>'}</div>
        <select data-bag-slot="${r}:${x.i}" style="max-width:260px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:3px 6px; font-family:var(--mono); font-size:11px;">
          ${p ? '' : `<option value="${escapeHtml(x.e.cntgen)}" selected>${escapeHtml(nm)}</option>`}
          ${pool.slice().sort((a, b) => a.name.localeCompare(b.name)).map(pp => `<option value="${pp.id}" ${pp.id === x.e.cntgen ? 'selected' : ''}>${escapeHtml(pp.name)}</option>`).join('')}
        </select>
        <div class="id" style="width:190px; text-align:right;">${escapeHtml(x.e.cntgen)}</div></div>`;
    }).join('') || '<div style="padding:8px; color:var(--text-faint); font-size:12px;">Empty. The game rolls a new list when needed.</div>';
    h += '</div>';
    const open = !!BAG_FORM.open[r];
    h += `<details class="subDetails" data-bag-odds="${r}" style="margin:8px 0 0;" ${open ? 'open' : ''}><summary>▸ ${bagTitle(r)} pool (${pool.length} possible rewards)</summary><div class="subDetailsBody"><table class="stewTable"><tbody>`;
    h += pool.slice().sort((a, b) => a.p - b.p).map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${(100 * p.p).toFixed(2)}%</td><td class="dtRel">${p.id}</td></tr>`).join('');
    h += '</tbody></table></div></details></div>';
  }
  host.innerHTML = h;

  const redo = msg => { BAG_STATE.lastMsg = msg || ''; renderBags(); if (msg) toast(msg.split('\n')[0]); };
  const undo = document.getElementById('bag-undo');
  if (undo) undo.addEventListener('click', () => {
    const o = JSON.parse(JSON.stringify(BAG_STATE.original));
    for (const k of Object.keys(b)) delete b[k];
    Object.assign(b, o);
    redo('Lost Bags restored to how they were when you loaded the save.');
  });
  host.querySelectorAll('[data-bag-fillsel]').forEach(s => s.addEventListener('change', () => { BAG_FORM.fill[s.dataset.bagFillsel] = s.value; }));
  host.querySelectorAll('[data-bag-fill]').forEach(btn => btn.addEventListener('click', () => {
    const r = btn.dataset.bagFill;
    const sel = host.querySelector(`[data-bag-fillsel="${r}"]`);
    const id = sel && sel.value;
    if (!id) return;
    const n = arr(b[r]).length || 10;
    b[r] = Array.from({ length: n }, () => ({ rarity: r, cntgen: id }));
    redo(`Filled all ${n} ${bagTitle(r)} Lost Bags with ${rewardName(gen[id] && gen[id].rwdid)}.`);
  }));
  host.querySelectorAll('[data-bag-reroll]').forEach(btn => btn.addEventListener('click', () => {
    const r = btn.dataset.bagReroll;
    const n = arr(b[r]).length || 10;
    b[r] = bagRoll(bagPool(r), n, Math.random).map(id => ({ rarity: r, cntgen: id }));
    redo(`Rerolled ${n} ${bagTitle(r)} Lost Bags from the game's odds.`);
  }));
  host.querySelectorAll('[data-bag-slot]').forEach(s => s.addEventListener('change', () => {
    const [r, i] = s.dataset.bagSlot.split(':');
    const e = b[r][Number(i)];
    e.cntgen = s.value;
    redo(`${bagTitle(r)} slot set to ${rewardName(gen[s.value] && gen[s.value].rwdid)}.`);
  }));
  host.querySelectorAll('[data-bag-odds]').forEach(d => d.addEventListener('toggle', () => { BAG_FORM.open[d.dataset.bagOdds] = d.open; }));
}

// ---------------- Death Boxes ----------------
// Returns SAVE.soul.deathbox (array) or null.
function boxData() {
  const s = SAVE && SAVE.soul;
  if (!s) return null;
  if (!Array.isArray(s.deathbox)) return null;
  return s.deathbox;
}
// Snapshots death boxes when a new save is loaded (for Undo).
function boxSync() {
  if (BOX_STATE.root !== RAW_SAV_ROOT) {
    const b = boxData();
    BOX_STATE = { root: RAW_SAV_ROOT, original: b ? JSON.parse(JSON.stringify(b)) : null, lastMsg: '' };
  }
}
// Reward pool for a death box rarity from master_deathbox_content_gen, joined to master_reward rows.
function boxPool(rarity) {
  const rows = arr(AP && AP.boxGen).filter(r => r.rarity === rarity && r.freq > 0);
  const tot = rows.reduce((a, r) => a + r.freq, 0) || 1;
  return rows.map(r => ({ id: r.id, rwdid: r.rwdid, freq: r.freq, p: r.freq / tot, rw: rwdRow(r.rwdid), name: rewardName(r.rwdid) })).filter(x => x.rw);
}
// How the game itself writes a death box's reward (boxes it created, seen in
// real saves): an ITEM reward is stored with the ITEM'S OWN TYPE (a blueprint
// is type "ITTP_RMAP", not "ITEM") and num 0; a decal is "SKILL" with num 0.
// Writing master_reward's "ITEM" / num 1 instead makes the game hand over the
// item but show no icon for it (user report). boxGameType() gives the game's
// type for a reward.
function boxGameType(type, val0) {
  if (type === 'ITEM') { const it = ITEM_INDEX[val0]; return (it && it.itemtype) || 'ITEM'; }
  return type;
}
// Writes a reward into a box in the game's own storage format (type, num 0, val0..val3).
function boxApplyReward(box, rw) {
  box.type = boxGameType(rw.type, rw.val0);
  box.num = 0;
  box.val0 = rw.val0 || '';
  box.val1 = rw.val1 || '';
  box.val2 = rw.val2 || '';
  box.val3 = '';
}
// Readable contents of a box (ITTP_* types are treated as ITEM).
function boxContentName(box) {
  const t = /^ITTP_/.test(box.type || '') ? 'ITEM' : box.type;
  return rewardLabel(t, box.num || 1, box.val0);
}
// Finds the pool entry matching a box's current contents, or null.
function boxMatchPool(box) {
  return boxPool(box.rarity).find(p => boxGameType(p.rw.type, p.rw.val0) === box.type && (p.rw.val0 || '') === (box.val0 || '')) || boxPool(box.rarity).find(p => p.rw.type === box.type && (p.rw.val0 || '') === (box.val0 || '')) || null;
}
// boxes written by earlier editor versions in master_reward's format
// Detects boxes in master_reward format (written by older editor versions) that the game shows without an icon.
function boxBadFormat(box) {
  if (!box || !box.val0) return false;
  if (box.type === 'ITEM') return true;
  return (box.type === 'SKILL' || /^ITTP_/.test(box.type || '')) && Number(box.num) !== 0;
}
// Converts bad-format boxes to the game's format; returns how many were changed.
function fixBoxFormats(list) {
  let n = 0;
  for (const b of arr(list)) if (boxBadFormat(b)) { b.type = boxGameType(b.type, b.val0); b.num = 0; n++; }
  return n;
}

// Static HTML for the Death Boxes tab.
function blockBoxes() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Rewards</div><h2>Death Boxes</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Death boxes already hold their reward and unlock at a set time. You can open a box now, or change what's inside to anything from that rarity's pool. Adding new boxes hasn't been tested in game; try it on a copy of your save.</div>
      <div id="box-body"></div>
    </div>
  </section>`;
}

// Renders the box list (rarity/content selectors, reroll, open-now, remove) and an add-box row.
// Boxes are objects {bid, rarity, type, created, opentime, num, val0..val3}; "opening" just moves opentime into the past.
function renderBoxes() {
  const host = document.getElementById('box-body');
  if (!host || !SAVE) return;
  boxSync();
  if (!Array.isArray(SAVE.soul.deathbox)) SAVE.soul.deathbox = [];
  const boxes = boxData();
  const now = Math.floor(Date.now() / 1000);
  const changed = JSON.stringify(boxes) !== JSON.stringify(BOX_STATE.original || []);
  let h = '';
  if (changed) h += `<div class="warnNote" style="display:flex; gap:10px; align-items:center; border-color:var(--good); color:var(--good-bright);"><div style="flex:1;">Death boxes changed. Download the .sav to keep it.</div><button class="subtle" id="box-undo">Undo all death box changes</button></div>`;
  if (BOX_STATE.lastMsg) h += `<pre class="stewLog">${escapeHtml(BOX_STATE.lastMsg)}</pre>`;
  const locked = boxes.filter(x => x.opentime > now).length;
  h += `<div class="toolbar"><span style="font-size:12px;">${boxes.length} death box${boxes.length === 1 ? '' : 'es'}, ${locked} still locked</span><span style="flex:1;"></span><button class="action" id="box-open-all" ${locked ? '' : 'disabled'}>Open all now</button></div>`;
  h += '<div class="listBlock" style="max-height:none;">';
  h += boxes.map((x, i) => {
    const pool = boxPool(x.rarity);
    const cur = boxMatchPool(x);
    const ready = !(x.opentime > now);
    return `<div class="listRow" style="flex-direction:column; align-items:stretch; padding:10px; gap:6px;">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        ${bagChip(x.rarity)} <div class="name"><b>${escapeHtml(boxContentName(x))}</b></div>
        ${ready ? '<span class="badge current">READY</span>' : `<span class="badge">opens ${escapeHtml(dtRel(x.opentime, now))}</span>`}
      </div>
      <div style="font-size:11px; color:var(--text-dim);">Received ${escapeHtml(dtFmt(x.created))} · opens ${escapeHtml(dtFmt(x.opentime))}</div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <select data-box-rar="${i}" style="background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:4px 6px; font-family:var(--mono); font-size:11.5px;">
          ${BOX_RARITIES.map(r => `<option value="${r}" ${r === x.rarity ? 'selected' : ''}>${bagTitle(r)}</option>`).join('')}${BOX_RARITIES.includes(x.rarity) ? '' : `<option selected>${escapeHtml(x.rarity)}</option>`}
        </select>
        <select data-box-content="${i}" style="max-width:340px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:4px 6px; font-family:var(--mono); font-size:11.5px;">
          ${cur ? '' : `<option selected>${escapeHtml(boxContentName(x))} (current)</option>`}
          ${pool.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${p.id}" ${cur && cur.id === p.id ? 'selected' : ''}>${escapeHtml(p.name)} (${(100 * p.p).toFixed(1)}%)</option>`).join('')}
        </select>
        <button class="subtle" data-box-reroll="${i}">Reroll</button>
        <button class="action" data-box-open="${i}" ${ready ? 'disabled' : ''}>Open now</button>
        <button class="subtle" data-box-del="${i}">Remove</button>
      </div>
    </div>`;
  }).join('') || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No death boxes in this save.</div>';
  h += '</div>';
  const addPool = boxPool(BOX_FORM.addRarity);
  if (!addPool.find(p => p.id === BOX_FORM.addContent)) BOX_FORM.addContent = addPool[0] ? addPool[0].id : '';
  h += `<div class="toolbar" style="margin-top:12px;"><span style="font-size:11.5px; color:var(--text-dim);">Add a box:</span>
    <select id="box-add-rar" style="background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:5px 6px; font-family:var(--mono); font-size:11.5px;">${BOX_RARITIES.map(r => `<option value="${r}" ${r === BOX_FORM.addRarity ? 'selected' : ''}>${bagTitle(r)}</option>`).join('')}</select>
    <select id="box-add-content" style="max-width:340px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:5px 6px; font-family:var(--mono); font-size:11.5px;">${addPool.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => `<option value="${p.id}" ${p.id === BOX_FORM.addContent ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select>
    <button class="subtle" id="box-add">Add (ready to open)</button></div>`;
  host.innerHTML = h;

  const redo = msg => { BOX_STATE.lastMsg = msg || ''; renderBoxes(); if (msg) toast(msg.split('\n')[0]); };
  const undo = document.getElementById('box-undo');
  if (undo) undo.addEventListener('click', () => {
    boxes.length = 0;
    for (const x of JSON.parse(JSON.stringify(BOX_STATE.original || []))) boxes.push(x);
    redo('Death boxes restored to how they were when you loaded the save.');
  });
  // lowers opentime to just past (never before created)
  const openNow = x => { const t = Math.floor(Date.now() / 1000) - 60; x.opentime = Math.max(Math.min(t, x.opentime), x.created || 0); };
  document.getElementById('box-open-all').addEventListener('click', () => {
    let n = 0;
    for (const x of boxes) if (x.opentime > Math.floor(Date.now() / 1000)) { openNow(x); n++; }
    redo(`Opened ${n} death box${n === 1 ? '' : 'es'}. Collect them in game.`);
  });
  host.querySelectorAll('[data-box-open]').forEach(b => b.addEventListener('click', () => {
    const x = boxes[Number(b.dataset.boxOpen)];
    openNow(x);
    redo(`${bagTitle(x.rarity)} death box can be opened now.`);
  }));
  host.querySelectorAll('[data-box-content]').forEach(s => s.addEventListener('change', () => {
    const x = boxes[Number(s.dataset.boxContent)];
    const p = boxPool(x.rarity).find(pp => pp.id === s.value);
    if (!p) return;
    boxApplyReward(x, p.rw);
    redo(`Death box now holds ${boxContentName(x)}.`);
  }));
  host.querySelectorAll('[data-box-rar]').forEach(s => s.addEventListener('change', () => {
    const x = boxes[Number(s.dataset.boxRar)];
    x.rarity = s.value;
    const pool = boxPool(x.rarity);
    if (!boxMatchPool(x) && pool.length) boxApplyReward(x, bagRoll(pool, 1, Math.random).map(id => pool.find(p => p.id === id))[0].rw);
    redo(`Death box changed to ${bagTitle(x.rarity)}: ${boxContentName(x)}.`);
  }));
  host.querySelectorAll('[data-box-reroll]').forEach(b => b.addEventListener('click', () => {
    const x = boxes[Number(b.dataset.boxReroll)];
    const pool = boxPool(x.rarity);
    if (!pool.length) return;
    const id = bagRoll(pool, 1, Math.random)[0];
    boxApplyReward(x, pool.find(p => p.id === id).rw);
    redo(`Rerolled: ${boxContentName(x)}.`);
  }));
  host.querySelectorAll('[data-box-del]').forEach(b => b.addEventListener('click', () => {
    const [x] = boxes.splice(Number(b.dataset.boxDel), 1);
    redo(`Removed the ${bagTitle(x.rarity)} death box (${boxContentName(x)}).`);
  }));
  document.getElementById('box-add-rar').addEventListener('change', e => { BOX_FORM.addRarity = e.target.value; renderBoxes(); });
  document.getElementById('box-add-content').addEventListener('change', e => { BOX_FORM.addContent = e.target.value; });
  document.getElementById('box-add').addEventListener('click', () => {
    const p = boxPool(BOX_FORM.addRarity).find(pp => pp.id === BOX_FORM.addContent);
    if (!p) return;
    const t = Math.floor(Date.now() / 1000) - 60;
    const x = { bid: '', rarity: BOX_FORM.addRarity, type: '', created: t, opentime: t, num: 0, val0: '', val1: '', val2: '', val3: '' };
    boxApplyReward(x, p.rw);
    boxes.push(x);
    redo(`Added a ${bagTitle(x.rarity)} death box with ${boxContentName(x)}.`);
  });
}

// Tab wiring: render only when that tab is active.
function wireBags() { if (activeTab === 'bags') renderBags(); }
function wireBoxes() { if (activeTab === 'boxes') renderBoxes(); }

