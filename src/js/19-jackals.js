// ==== Jackals tab ====
// ---------------------------------------------------------------------------
// Jackals: the loot (edits survive only until the next floor is generated; tested 2026-10-08) each Jackal will drop.
// Save: root.floor.jkls = [{type: JACKAL_X.., rwd: JSON text, killed}]. rwd =
//   {"money":n,"spirit":0,"tbtp":"","pts":{} | [{"eptid"}],"msrs":{},"items":{} | [{"eitemid","itemId","gettime":0}]}
// The loot instance lives in root.item.items (owner = the Jackal type) or root.part.pts[uid] (owner too).
// The loot is kept until that Jackal is defeated or a new floor is generated (the game then re-rolls all Jackals).
// What a Jackal can drop and how likely (per 1000) comes from master_jackal: Kill Coins (money_min..max),
// its weapon (armr), a piece of its armor (head/body/legs), the weapon's blueprint, an armor blueprint,
// or its items drop_item_id_1 / _2.
// Edits are kept here and written at download: the old loot instance is removed and the new one added.
// ---------------------------------------------------------------------------
// Pending Jackal edits. root = the RAW_SAV_ROOT the edits belong to (reset when a different save loads),
// edits = { JACKAL_TYPE: loot }, msg = status text shown above the table.
// loot shapes: {kind:'money',money}, {kind:'part',ptid}, {kind:'item',itemid}.
let JKL = { root: null, edits: {}, msg: '' };
// Drop pending edits if a different save has been loaded since.
function jklSync() { if (JKL.root !== RAW_SAV_ROOT) JKL = { root: RAW_SAV_ROOT, edits: {}, msg: '' }; }
// Master record (master_jackal row) for a Jackal type, or null.
function jklRec(type) { return arr(AP && AP.jackals).find(j => j.type === type) || null; }
// Parse a Jackal's rwd JSON string; null if absent or invalid.
function jklParse(j) { try { return j && j.rwd ? JSON.parse(j.rwd) : null; } catch (e) { return null; } }
// All weapon/armor instances in root.part.pts, whether pts is an array or an object keyed by uid.
function jklPartsOf(root) {
  const p = root && root.part && root.part.pts;
  return Array.isArray(p) ? p : p && typeof p === 'object' ? [].concat(...Object.values(p).filter(Array.isArray)) : [];
}
// The loot a Jackal carries now, read from the save: first item, else first part (resolved by eid to
// its ptid), else money; {kind:'none'} if empty.
// the loot a Jackal carries now (from the save)
function jklCurrent(j) {
  const r = jklParse(j);
  if (!r) return { kind: 'none' };
  const items = arr(r.items), pts = arr(r.pts);
  if (items.length) return { kind: 'item', itemid: items[0].itemId };
  if (pts.length) { const inst = jklPartsOf(RAW_SAV_ROOT).find(p => p.eid === pts[0].eptid); return { kind: 'part', ptid: inst ? inst.ptid : '?' }; }
  if (Number(r.money) > 0) return { kind: 'money', money: Number(r.money) };
  return { kind: 'none' };
}
// Blueprint item id for a part id (PT_X -> ITMP_X), or null when no such item exists.
function jklBpOf(ptid) { const id = 'ITMP_' + String(ptid || '').replace(/^PT_/, ''); return ITEM_INDEX[id] ? id : null; }
// everything this Jackal type can drop, with the game's weight (per 1000)
// Build the list of drop options for a Jackal type from master_jackal rates (weights are per 1000).
// Each option: { key, w, label, loot() -> loot object }; armor rates are split evenly across the armor pieces.
// Unrevealed blueprint variants (ITMP_*U) are added with w 0: selectable but a reroll never picks them.
function jklOptions(type) {
  const r = jklRec(type);
  if (!r) return [];
  const out = [];
  const armor = [ r.head, r.body, r.legs ].filter(Boolean);
  if (Number(r.drop_coin_rate)) out.push({ key: 'money', w: Number(r.drop_coin_rate), label: `Kill Coins (${Number(r.money_min).toLocaleString()}–${Number(r.money_max).toLocaleString()})`, loot: () => ({ kind: 'money', money: Math.round(Number(r.money_min) + Math.random() * (Number(r.money_max) - Number(r.money_min))) }) });
  if (Number(r.drop_part_weapon_rate) && r.armr) out.push({ key: 'pt:' + r.armr, w: Number(r.drop_part_weapon_rate), label: `Weapon: ${(PT_INDEX[r.armr] || {}).name || r.armr}`, loot: () => ({ kind: 'part', ptid: r.armr }) });
  if (Number(r.drop_part_armor_rate)) for (const a of armor) out.push({ key: 'pt:' + a, w: Number(r.drop_part_armor_rate) / armor.length, label: `Armor: ${(PT_INDEX[a] || {}).name || a}`, loot: () => ({ kind: 'part', ptid: a }) });
  const bw = jklBpOf(r.armr);
  if (Number(r.drop_rmap_weapon_rate) && bw) out.push({ key: 'it:' + bw, w: Number(r.drop_rmap_weapon_rate), label: itemDisplayName(bw), loot: () => ({ kind: 'item', itemid: bw }) });
  if (Number(r.drop_rmap_armor_rate)) { const bps = armor.map(jklBpOf).filter(Boolean); for (const b of bps) out.push({ key: 'it:' + b, w: Number(r.drop_rmap_armor_rate) / bps.length, label: itemDisplayName(b), loot: () => ({ kind: 'item', itemid: b }) }); }
  for (const [ id, rate ] of [ [ r.drop_item_id_1, r.drop_item_1_rate ], [ r.drop_item_id_2, r.drop_item_2_rate ] ]) if (id && Number(rate) && ITEM_INDEX[id]) out.push({ key: 'it:' + id, w: Number(rate), label: itemDisplayName(id), loot: () => ({ kind: 'item', itemid: id }) });
  // the game also hands out these blueprints unrevealed (seen in real saves); how often isn't in the
  // game data, so they're offered to pick but a reroll never chooses them (w 0)
  for (const o of out.slice()) {
    const m = /^it:(ITMP_.+)$/.exec(o.key);
    if (!m || /U$/.test(m[1]) || !ITEM_INDEX[m[1] + 'U']) continue;
    const u = m[1] + 'U';
    out.push({ key: 'it:' + u, w: 0, label: itemDisplayName(u), loot: () => ({ kind: 'item', itemid: u }) });
  }
  return out;
}
// Weighted random pick using the game's odds; returns a loot object or null if the type has no options.
function jklRoll(type) {
  const opts = jklOptions(type), tot = opts.reduce((n, o) => n + o.w, 0);
  if (!tot) return null;
  let x = Math.random() * tot;
  for (const o of opts) if ((x -= o.w) < 0) return o.loot();
  return opts[opts.length - 1].loot();
}
// Display text for a loot object ('nothing' when empty).
function jklLootLabel(l) {
  if (!l || l.kind === 'none') return 'nothing';
  if (l.kind === 'money') return `${Number(l.money).toLocaleString()} Kill Coins`;
  if (l.kind === 'part') return (PT_INDEX[l.ptid] || {}).name || l.ptid;
  return itemDisplayName(l.itemid);
}
// Stable key for a loot object, matching jklOptions keys (used to preselect the dropdown).
function jklLootKey(l) { return !l ? '' : l.kind === 'money' ? 'money' : l.kind === 'part' ? 'pt:' + l.ptid : l.kind === 'item' ? 'it:' + l.itemid : ''; }
// Write pending Jackal edits into a clone of the raw JSON at download time (called from the merge step).
// For each edited Jackal: remove the old loot instance(s) from root.item.items / root.part.pts, create a
// new instance owned by the Jackal type (new UUID eid), and rewrite floor.jkls[].rwd as JSON text.
// Parts get full durability and ammo at +0 (lvl 1 raw); part lists may be arrays or objects keyed by uid.
// Edits only hold until the game generates a new floor, which re-rolls every Jackal.
function applyJackals(root) {
  if (JKL.root !== RAW_SAV_ROOT || !Object.keys(JKL.edits).length || !root || !root.floor || !Array.isArray(root.floor.jkls)) return root;
  // timestamp for the new instances and the account uid used as the part owner key
  const now = Math.floor(Date.now() / 1e3), uid = Number(root.soul && root.soul.uid) || Number(RAW_SAV_MAIN_UID) || 0;
  const items = root.item && root.item.items;
  // part list for this uid, creating root.part.pts[uid] when pts is an object keyed by uid
  const partList = () => {
    const p = root.part && root.part.pts;
    if (Array.isArray(p)) return p;
    if (p && typeof p === 'object') { const k = String(uid); if (!Array.isArray(p[k])) p[k] = []; return p[k]; }
    return null;
  };
  for (const j of root.floor.jkls) {
    const loot = j && JKL.edits[j.type];
    if (!loot) continue;
    const old = jklParse(j) || {};
    // remove the old loot instance(s)
    const oldItems = new Set(arr(old.items).map(x => x.eitemid)), oldPts = new Set(arr(old.pts).map(x => x.eptid));
    if (Array.isArray(items)) for (let i = items.length - 1; i >= 0; i--) if (oldItems.has(items[i].eid)) items.splice(i, 1);
    const pl = partList();
    if (pl) for (let i = pl.length - 1; i >= 0; i--) if (oldPts.has(pl[i].eid)) pl.splice(i, 1);
    const rwd = { money: 0, spirit: 0, tbtp: '', pts: {}, msrs: {}, items: {} };
    if (loot.kind === 'money') rwd.money = Number(loot.money) || 0;
    else if (loot.kind === 'item' && Array.isArray(items)) {
      const eid = presentUuid();
      items.push({ eid, gettime: 0, itemid: loot.itemid, owner: j.type });
      rwd.items = [ { eitemid: eid, itemId: loot.itemid, gettime: 0 } ];
    } else if (loot.kind === 'part' && pl) {
      const rec = PT_INDEX[loot.ptid] || {}, eid = presentUuid();
      pl.push({ uid, eid, gettime: 0, owner: j.type, created: now, modified: now, ptid: loot.ptid, rest: Number(rec.capacity) || 0, spare: Number(rec.spare) || 0, grade: 0, dur: partMaxDur(rec, 1) || Number(rec.dur) || 0, lvl: 1 });
      rwd.pts = [ { eptid: eid } ];
    }
    j.rwd = JSON.stringify(rwd);
  }
  return root;
}
// Section shell for the Jackals tab; renderJackals fills #jkl-body.
function blockJackals() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Works on the current floor only</div><h2>Jackals</h2></div></div>
    <div class="block-body"><div id="jkl-body"></div></div>
  </section>`;
}
// Render the Jackals table (current loot, editable drop dropdown with odds, reroll/undo) into #jkl-body
// and wire its controls. Edits only change JKL.edits; nothing is written until download (applyJackals).
function renderJackals() {
  const host = document.getElementById('jkl-body');
  if (!host || !SAVE || !RAW_SAV_ROOT) return;
  jklSync();
  const list = arr(RAW_SAV_ROOT.floor && RAW_SAV_ROOT.floor.jkls);
  let h = `<div class="warnNote" style="margin:0 0 10px;"><b>Only holds on the floor you save on.</b> The game rolls new loot for every Jackal each time a new floor is generated (tested: saves taken after going up floors had every Jackal re-rolled, even with no kills). Kill the Jackal you edited on this same floor, before using the stairs or elevator. Keep your original save.</div>
    <div class="capNote" style="margin-top:0;">Each Jackal carries one reward. It stays until you defeat the Jackal or the game generates a new floor, which re-rolls them all. Pick what it drops from what that Jackal can carry, or reroll it with the game's own odds. Weapons and armor drop at +0 with full durability and ammo. Blueprints can also be set to drop unrevealed ("pick only": the game does hand them out unrevealed, but how often isn't in its data, so a reroll never picks them).</div>`;
  if (!list.length) { host.innerHTML = h + '<div class="capNote">This save has no Jackals yet.</div>'; return; }
  if (JKL.msg) h += `<pre class="stewLog">${escapeHtml(JKL.msg)}</pre>`;
  const sel = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:6px 8px; font-family:var(--mono); width:100%;';
  h += `<div class="toolbar"><button class="subtle" id="jkl-reroll-all">Reroll all</button>${Object.keys(JKL.edits).length ? '<button class="subtle" id="jkl-undo-all">Undo all</button>' : ''}<span class="count">${Object.keys(JKL.edits).length} changed</span></div>`;
  h += `<table class="stewTable"><thead><tr><th>Jackal</th><th>Carries now</th><th>Drops after download</th><th></th></tr></thead><tbody>`;
  for (const j of list) {
    const cur = jklCurrent(j), ed = JKL.edits[j.type], opts = jklOptions(j.type);
    const pick = ed ? jklLootKey(ed) : jklLootKey(cur);
    const name = String(j.type).replace(/^JACKAL_/, 'Jackal ');
    const tot = opts.reduce((n, o) => n + o.w, 0) || 1;
    h += `<tr><td>${escapeHtml(name)}${Number(j.killed) ? ' <span class="id">(defeated)</span>' : ''}</td><td>${escapeHtml(jklLootLabel(cur))}</td>
      <td>${opts.length ? `<select data-jkl="${j.type}" style="${sel}">${opts.map(o => `<option value="${o.key}" ${o.key === pick ? 'selected' : ''}>${escapeHtml(o.key === 'money' && ed && ed.kind === 'money' ? `${Number(ed.money).toLocaleString()} Kill Coins` : o.key === 'money' && !ed && cur.kind === 'money' ? `${Number(cur.money).toLocaleString()} Kill Coins` : o.label)} · ${o.w ? (o.w / tot * 100).toFixed(o.w / tot < 0.1 ? 1 : 0) + '%' : 'pick only'}</option>`).join('')}${!opts.some(o => o.key === pick) ? `<option value="" selected>${escapeHtml(jklLootLabel(ed || cur))}</option>` : ''}</select>` : '<span class="id">unknown Jackal</span>'}${ed ? ' <span class="id">changed</span>' : ''}</td>
      <td style="white-space:nowrap;"><button class="subtle" data-jkl-roll="${j.type}">Reroll</button>${ed ? ` <button class="subtle" data-jkl-undo="${j.type}">Undo</button>` : ''}</td></tr>`;
  }
  h += '</tbody></table>';
  host.innerHTML = h;
  // common handler: store a status message, re-render, and toast it
  const done = msg => { JKL.msg = msg || ''; renderJackals(); if (msg) toast(msg); };
  host.querySelectorAll('[data-jkl]').forEach(el => el.addEventListener('change', () => {
    const o = jklOptions(el.dataset.jkl).find(x => x.key === el.value);
    if (o) { JKL.edits[el.dataset.jkl] = o.loot(); done(''); }
  }));
  host.querySelectorAll('[data-jkl-roll]').forEach(el => el.addEventListener('click', () => { const l = jklRoll(el.dataset.jklRoll); if (l) JKL.edits[el.dataset.jklRoll] = l; done(''); }));
  host.querySelectorAll('[data-jkl-undo]').forEach(el => el.addEventListener('click', () => { delete JKL.edits[el.dataset.jklUndo]; done(''); }));
  const ra = document.getElementById('jkl-reroll-all');
  if (ra) ra.addEventListener('click', () => { for (const j of list) { const l = jklRoll(j.type); if (l) JKL.edits[j.type] = l; } done('Rerolled every Jackal with the game\'s odds'); });
  const ua = document.getElementById('jkl-undo-all');
  if (ua) ua.addEventListener('click', () => { JKL.edits = {}; done('Jackal loot back to what the save has'); });
}
// Jackals tab wiring: render when active.
function wireJackals() { if (activeTab === 'jackals') renderJackals(); }

// Quests tab wiring (renderQuests is defined elsewhere).
function wireQuests() {
  if (activeTab === 'quests') renderQuests();
}

// Cache for quest name lookups.
const NAME_INDEX_QUEST_CACHE = {};

