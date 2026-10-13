// ==== Storage Box tab ====
// HTML for the Storage Box tab: capacity, bulk blueprint buttons, deposit form, contents list.
// SAVE.cl.slots is an array of {slot, eptid, emsrid, ebstid, eitemid}; '-1' means empty. Each non-empty
// slot points at an instance in cl.pts / cl.msrs / cl.bsts / cl.items.
function blockStorageBox() {
  const cl = SAVE.cl;
  const cap = cl.slots.length;
  const occupied = cl.slots.filter(s => s.eptid && s.eptid !== '-1' || s.emsrid && s.emsrid !== '-1' || s.ebstid && s.ebstid !== '-1' || s.eitemid && s.eitemid !== '-1').length;
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Item Storage</div><h2>Storage Box</h2></div></div>\n    <div class="block-body">\n      <div class="grid" style="margin-bottom:6px;">\n        <div class="field"><label>Capacity (${STORAGE_BOX_MIN}-${storageBoxMax()}, steps of ${storageBoxStep()})</label><input type="number" id="sb-capacity" min="${STORAGE_BOX_MIN}" max="${storageBoxMax()}" step="${storageBoxStep()}" value="${cap}"></div>\n        <div class="field" style="display:flex; align-items:end;"><button class="subtle" id="sb-max">Max (${storageBoxMax()})</button></div>\n      </div>\n      <div class="capNote ${occupied >= cap ? 'over' : ''}">${occupied} / ${cap} slots occupied${occupied >= cap ? ' -- FULL, raise capacity to add more' : ''}. Changing capacity adds/removes empty slots at the end; it never deletes occupied ones.</div>\n\n      <div class="eyebrow" style="margin:12px 0 6px;">Bulk blueprints</div>\n      <div class="toolbar">\n        <button class="subtle" id="sb-add-legit-bp">+1 of every obtainable blueprint</button>\n        <button class="subtle" id="sb-add-ps-bp">+1 PlayStation-only blueprint</button>\n        <button class="subtle" id="sb-add-travis-bp">+1 Travis jacket, pants, sunglasses &amp; Beam Katana 1</button>\n        <button class="subtle" id="sb-add-tdm-bp">+1 every TDM blueprint</button>\n      </div>\n\n      <div class="eyebrow" style="margin:12px 0 6px;">Deposit item</div>\n      <div class="subTabs" id="sb-cat-tabs">\n        <div class="subTab active" data-sb-cat="bp">Blueprint</div>\n        <div class="subTab" data-sb-cat="pt">Weapon / Armor</div>\n        <div class="subTab" data-sb-cat="msr">Mushroom</div>\n        <div class="subTab" data-sb-cat="bst">Beast</div>\n        <div class="subTab" data-sb-cat="item">Material / Other Item</div>\n      </div>\n      <div id="sb-add-form"></div>\n\n      <div class="eyebrow" style="margin:16px 0 8px;">Contents <button class="subtle" id="sb-refresh-all" style="margin-left:8px;" title="Durability to 100% and ammo full on every weapon and armor in the Storage Box">Repair &amp; refill all</button> <button class="subtle" id="sb-clear-all" style="margin-left:4px;">Clear all</button></div>\n      <div class="toolbar" style="margin-bottom:6px;"><input type="text" id="sb-content-search" placeholder="Search contents: name, level, or weapon / armor / blueprint / mushroom / beast / material" value="${escapeHtml(SB_CONTENT_FILTER)}" style="flex:1; max-width:360px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);"><span class="count" id="sb-content-count"></span></div>\n      <div class="toolbar" style="margin-bottom:6px; gap:6px;"><div class="subTabs" style="margin:0;"><div class="subTab ${SB_VIEW === 'slots' ? 'active' : ''}" data-sb-view="slots" title="One row per storage slot, with a remove button">By slot</div><div class="subTab ${SB_VIEW === 'totals' ? 'active' : ''}" data-sb-view="totals" title="One row per different thing, with how many you hold">Totals</div></div><select id="sb-total-sort" title="Order of the Totals list" style="display:${SB_VIEW === 'totals' ? '' : 'none'}; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:5px 8px; font-family:var(--mono); font-size:11.5px;"><option value="count" ${SB_TOTAL_SORT === 'count' ? 'selected' : ''}>Most held first</option><option value="name" ${SB_TOTAL_SORT === 'name' ? 'selected' : ''}>By name</option><option value="kind" ${SB_TOTAL_SORT === 'kind' ? 'selected' : ''}>By kind</option></select><span id="sb-summary" style="font-size:11.5px; color:var(--text-dim);">${sbSummaryHtml()}</span></div>\n      <div class="listBlock" id="sb-list">\n        ${sbListHtml()}\n      </div>\n    </div>\n  </section>`;
}

// Display name for an item id. Blueprints (ITMP_*) show as 'Blueprint - <part name>' with
// '(unrevealed)' for the ...U variant; unknown ids are returned as-is.
function itemDisplayName(itemId) {
  const rec = ITEM_INDEX[itemId];
  if (!rec) return itemId;
  if (itemId.startsWith('ITMP_')) {
    const ptRec = PT_INDEX[itemId.replace(/^ITMP_/, 'PT_').replace(/U$/, '')];
    const base = ptRec ? ptRec.name : rec.name;
    return 'Blueprint - ' + base + (itemId.endsWith('U') ? ' (unrevealed)' : '');
  }
  return rec.name;
}

// Mushroom display name; cooked (state 1 = grilled) uses the cooked name when one exists. Unknown ids returned as-is.
function msrDisplayName(msrid, cooked) {
  const rec = MSR_INDEX[msrid];
  if (!rec) return msrid;
  return cooked && rec.cookedName ? rec.cookedName : rec.name;
}

// Beast display name; cooked (state 1 = grilled) uses the cooked name when one exists. Unknown ids returned as-is.
function bstDisplayName(bstid, cooked) {
  const rec = BST_INDEX[bstid];
  if (!rec) return bstid;
  return cooked && rec.cookedName ? rec.cookedName : rec.name;
}

// ==== Part durability, ammo and level caps ====
// Full durability grows with the upgrade level: floor(dur * dur_c^(lvl-1)) -- matches every
// full-durability part in the sample saves. Ammo: rest (loaded) up to capacity, spare up to spare.
// research entries (FINISHED levels and next-level markers) above the part's highest level
function researchOverCap() {
  return arr(SAVE && SAVE.user_research).filter(r => { const rec = PT_INDEX[r.ptid], cap = maxPartLevel(rec); return rec && cap && Number(r.lvl) > cap; });
}
// Remove over-cap research entries and renormalise markers; returns how many were removed.
function fixResearchOverCap() {
  const bad = new Set(researchOverCap());
  if (!bad.size) return 0;
  const n = bad.size;
  SAVE.user_research = arr(SAVE.user_research).filter(r => !bad.has(r));
  normalizeResearchMarkers(SAVE.user_research);
  return n;
}
// every weapon / armor in the save whose stored level is above what its part allows (reflvllmt)
// Find weapons/armor stored above their part's max level (Death Bags, Storage Box, Reward Box).
// Returns [{inst, ptid, lvl, cap, where, lvlKey}]; Reward Box parts keep ptid in val0 and level in val1.
function partsOverCap() {
  const out = [];
  const chk = (inst, where, lvlKey) => {
    const ptid = lvlKey === 'val1' ? inst.val0 : inst.ptid, rec = PT_INDEX[ptid];
    const lvl = Number(inst[lvlKey]) || 0, cap = maxPartLevel(rec);
    if (rec && cap && lvl > cap) out.push({ inst, ptid, lvl, cap, where, lvlKey });
  };
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) for (const p of arr(c.pspts)) chk(p, `${c.name || 'a fighter'}'s Death Bag`, 'lvl');
  for (const p of arr(SAVE && SAVE.cl && SAVE.cl.pts)) chk(p, 'Storage Box', 'lvl');
  for (const p of arr(SAVE && SAVE.presents)) if (isPartPresent(p)) chk(p, 'Reward Box', 'val1');
  return out;
}
// Clamp every over-cap part to its max level and trim durability to that level's maximum; returns the count.
function fixPartsOverCap() {
  const over = partsOverCap();
  for (const o of over) {
    const rec = PT_INDEX[o.ptid], md = partMaxDur(rec, o.cap);
    if (o.lvlKey === 'val1') { o.inst.val1 = String(o.cap); if (md && Number(o.inst.val2) > md) o.inst.val2 = String(md); }
    else { o.inst.lvl = o.cap; if (md && Number(o.inst.dur) > md) o.inst.dur = md; }
  }
  return over.length;
}
// Full durability at a level: floor(dur * dur_c^(lvl-1)); the epsilon guards float error.
// Matches full-durability parts in sample saves. Returns 0 for parts without durability.
function partMaxDur(rec, lvl) {
  if (!rec || !Number(rec.dur)) return 0;
  const c = Number(rec.dur_c) || 1, n = Math.max(0, (Number(lvl) || 1) - 1);
  return Math.floor(Number(rec.dur) * Math.pow(c, n) + 1e-7);
}
// True when a part is below full durability or ammo (loaded 'rest' up to capacity, 'spare' up to spare).
function partNeedsRefresh(inst, rec) {
  if (!inst || !rec) return false;
  const md = partMaxDur(rec, inst.lvl);
  return (md > 0 && Number(inst.dur) < md) || (Number(rec.capacity) > 0 && Number(inst.rest || 0) < Number(rec.capacity)) || (Number(rec.spare) > 0 && Number(inst.spare || 0) < Number(rec.spare));
}
// Bring a part to full durability and ammo in place; returns true if anything changed.
function refreshPart(inst) {
  const rec = inst && PT_INDEX[inst.ptid];
  if (!partNeedsRefresh(inst, rec)) return false;
  const md = partMaxDur(rec, inst.lvl);
  if (md > 0 && Number(inst.dur) < md) inst.dur = md;
  if (Number(rec.capacity) > 0 && Number(inst.rest || 0) < Number(rec.capacity)) inst.rest = Number(rec.capacity);
  if (Number(rec.spare) > 0 && Number(inst.spare || 0) < Number(rec.spare)) inst.spare = Number(rec.spare);
  return true;
}
// Ammo display fragment like ' · ammo 3/6 + 12/24 spare'; '' for parts without ammo.
function ammoText(inst, rec) {
  if (!rec || !(Number(rec.capacity) > 0)) return '';
  return ` · ammo ${Number(inst.rest || 0)}/${Number(rec.capacity)}${Number(rec.spare) > 0 ? ` + ${Number(inst.spare || 0)}/${Number(rec.spare)} spare` : ''}`;
}
// Durability as a percentage of max (or of the current value if it exceeds max); 1 decimal under 10%, null if no durability.
function durabilityPct(inst, rec) {
  if (!rec || !rec.dur) return null;
  const full = partMaxDur(rec, inst.lvl) || Number(rec.dur);
  const cur = inst.dur != null ? Number(inst.dur) : full;
  const effectiveMax = Math.max(full, cur);
  const pct = 100 * cur / effectiveMax;
  return pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
}

// One Storage Box content row (HTML) for slot s at index i; returns '' for empty slots. data-sb-kind feeds the search filter.
function storageSlotRow(s, i) {
  let label = null, sub = '', kind = '', ico = '';
  if (s.eptid && s.eptid !== '-1') {
    const inst = arr(SAVE.cl.pts).find(p => p.eptid === s.eptid);
    const rec = inst && PT_INDEX[inst.ptid];
    label = rec ? rec.name : inst ? inst.ptid : 'part (unresolved)';
    ico = inst ? partIcon(inst.ptid, 30) : '';
    const pct = rec ? durabilityPct(inst, rec) : null;
    sub = rec ? `+${displayFromRaw(rec, inst.lvl)} · durability ${pct != null ? pct + '%' : '?'}${ammoText(inst, rec)}` : '';
    kind = rec ? (rec.type === 'PTTP_ARM' ? 'weapon' : 'armor ' + partSlotLabel(rec)) : 'part';
  } else if (s.eitemid && s.eitemid !== '-1') {
    const inst = arr(SAVE.cl.items).find(p => p.eitemid === s.eitemid);
    label = inst ? itemDisplayName(inst.itemId) : 'item (unresolved)';
    ico = inst ? itemIcon(inst.itemId, 30) : '';
    kind = inst && String(inst.itemId).startsWith('ITMP_') ? 'blueprint' : 'material item';
  } else if (s.emsrid && s.emsrid !== '-1') {
    const inst = arr(SAVE.cl.msrs).find(m => m.emsrid === s.emsrid);
    label = inst ? msrDisplayName(inst.msrid, inst.cooked) : 'Mushroom';
    ico = inst ? msrIcon(inst.msrid, inst.cooked, 30) : '';
    kind = 'mushroom';
  } else if (s.ebstid && s.ebstid !== '-1') {
    const inst = arr(SAVE.cl.bsts).find(b => b.ebstid === s.ebstid);
    label = inst ? bstDisplayName(inst.bstid, inst.cooked) : 'Beast';
    ico = inst ? bstIcon(inst.bstid, inst.cooked, 30) : '';
    kind = 'beast';
  }
  if (!label) return '';
  return `<div class="listRow" data-sb-kind="${kind}"><div class="name">${ico}${escapeHtml(label)} ${sub}</div><div class="id">slot ${s.slot != null ? s.slot : i}</div><button class="subtle" data-sb-remove="${i}">✕</button></div>`;
}

// Which Contents view is showing: 'slots' (one row per slot, with remove buttons) or 'totals' (one row per different
// thing with how many are held, and - / + / remove all buttons), and how the totals are ordered. Kept across re-renders.
let SB_VIEW = 'slots', SB_TOTAL_SORT = 'count';
const SB_KIND_ORDER = [ 'weapon', 'armor', 'blueprint', 'material', 'mushroom', 'beast' ];
const SB_KIND_LABEL = { weapon: 'weapons', armor: 'armor', blueprint: 'blueprints', material: 'materials and items', mushroom: 'mushrooms', beast: 'beasts' };
// storageTotals(): everything in the Storage Box grouped into [{ key, kind, label, sub, ico, n, slots, src }]. Weapons and
// armor group by piece and level, mushrooms and beasts by raw or grilled, blueprints by revealed or unrevealed (they are
// different ids). slots are the slot indexes holding the group; src says what one more copy would be (null if unknown).
function storageTotals() {
  const cl = SAVE.cl, by = new Map();
  let at = -1;
  const add = (key, kind, label, sub, ico, src) => { const g = by.get(key); if (g) { g.n++; g.slots.push(at); } else by.set(key, { key, kind, label, sub, ico, n: 1, slots: [ at ], src: src || null }); };
  const pts = new Map(arr(cl.pts).map(p => [ p.eptid, p ])), items = new Map(arr(cl.items).map(p => [ p.eitemid, p ]));
  const msrs = new Map(arr(cl.msrs).map(p => [ p.emsrid, p ])), bsts = new Map(arr(cl.bsts).map(p => [ p.ebstid, p ]));
  for (const s of cl.slots) {
    at++;
    if (s.eptid && s.eptid !== '-1') {
      const inst = pts.get(s.eptid), rec = inst && PT_INDEX[inst.ptid];
      if (!inst) { add('pt?', 'weapon', 'part (unresolved)', '', () => ''); continue; }
      const armor = !!rec && rec.type !== 'PTTP_ARM';
      add(`pt|${inst.ptid}|${inst.lvl}`, armor ? 'armor' : 'weapon', rec ? rec.name : inst.ptid, [ rec ? `+${displayFromRaw(rec, inst.lvl)}` : '', armor ? partSlotLabel(rec) : '' ].filter(Boolean).join(' · '), () => partIcon(inst.ptid, 30), rec ? { t: 'pt', rec, lvl: inst.lvl } : null);
    } else if (s.eitemid && s.eitemid !== '-1') {
      const inst = items.get(s.eitemid);
      if (!inst) { add('item?', 'material', 'item (unresolved)', '', () => ''); continue; }
      add(`item|${inst.itemId}`, String(inst.itemId).startsWith('ITMP_') ? 'blueprint' : 'material', itemDisplayName(inst.itemId), '', () => itemIcon(inst.itemId, 30), { t: 'item', id: inst.itemId });
    } else if (s.emsrid && s.emsrid !== '-1') {
      const inst = msrs.get(s.emsrid);
      if (!inst) { add('msr?', 'mushroom', 'Mushroom', '', () => ''); continue; }
      add(`msr|${inst.msrid}|${Number(inst.cooked) ? 1 : 0}`, 'mushroom', msrDisplayName(inst.msrid, inst.cooked), Number(inst.cooked) && msrDisplayName(inst.msrid, 1) === msrDisplayName(inst.msrid, 0) ? 'grilled' : '', () => msrIcon(inst.msrid, inst.cooked, 30), { t: 'msr', id: inst.msrid, cooked: !!Number(inst.cooked) });
    } else if (s.ebstid && s.ebstid !== '-1') {
      const inst = bsts.get(s.ebstid);
      if (!inst) { add('bst?', 'beast', 'Beast', '', () => ''); continue; }
      add(`bst|${inst.bstid}|${Number(inst.cooked) ? 1 : 0}`, 'beast', bstDisplayName(inst.bstid, inst.cooked), Number(inst.cooked) && bstDisplayName(inst.bstid, 1) === bstDisplayName(inst.bstid, 0) ? 'grilled' : '', () => bstIcon(inst.bstid, inst.cooked, 30), { t: 'bst', id: inst.bstid, cooked: !!Number(inst.cooked) });
    }
  }
  return [ ...by.values() ];
}
// ---- editing from the Totals view ----
// sbEmptySlot(i): the cleared form of slot i (same as the By slot remove button writes).
const sbEmptySlot = i => ({ slot: i, eptid: '-1', emsrid: '-1', ebstid: '-1', eitemid: '-1' });
// sbTotalsAddOne(g): put one more of group g into the first free slot. Gear arrives at the group's level with full
// durability and ammo, like the deposit form. Returns false (with a toast) when the box is full.
function sbTotalsAddOne(g) {
  const cl = SAVE.cl, i = storageFreeSlotIndex(), src = g.src;
  if (!src) return false;
  if (i < 0) { toast('Storage box full -- raise capacity to add more', true); return false; }
  const eid = 'edit-' + Math.random().toString(16).slice(2) + Date.now().toString(16), now = Math.floor(Date.now() / 1e3), slot = sbEmptySlot(i);
  if (src.t === 'pt') {
    cl.pts.push({ eptid: eid, ptid: src.rec.id, gettime: now, rest: Number(src.rec.capacity) || 0, spare: Number(src.rec.spare) || 0, grade: 0, dur: partMaxDur(src.rec, src.lvl) || src.rec.dur, lvl: src.lvl });
    slot.eptid = eid;
  } else if (src.t === 'item') {
    cl.items.push({ eitemid: eid, itemId: src.id, gettime: now });
    slot.eitemid = eid;
  } else if (src.t === 'msr') {
    cl.msrs.push({ emsrid: eid, msrid: src.id, gettime: now, eefcid: '', tefcid: '', state: src.cooked ? 1 : 0, cooked: src.cooked });
    slot.emsrid = eid;
  } else {
    cl.bsts.push({ ebstid: eid, bstid: src.id, gettime: now, lvl: 1, state: src.cooked ? 1 : 0, cooked: src.cooked });
    slot.ebstid = eid;
  }
  cl.slots[i] = slot;
  return true;
}
// sbTotalsRemoveOne(g): clear one slot of group g. Copies of a material, mushroom or beast are identical; gear of the
// same level can differ in wear, so the most worn copy goes first.
function sbTotalsRemoveOne(g) {
  const cl = SAVE.cl;
  let pick = g.slots[g.slots.length - 1];
  if (g.src && g.src.t === 'pt') {
    const wear = i => { const inst = arr(cl.pts).find(p => p.eptid === cl.slots[i].eptid); const pct = inst ? durabilityPct(inst, g.src.rec) : null; return pct == null ? 100 : pct; };
    pick = g.slots.slice().sort((a, b) => wear(a) - wear(b) || b - a)[0];
  }
  cl.slots[pick] = sbEmptySlot(pick);
}
// sbSummaryHtml(): one line counting what is in the box by kind, e.g. "274 weapons · 86 armor · ...".
function sbSummaryHtml() {
  const n = {};
  for (const g of storageTotals()) n[g.kind] = (n[g.kind] || 0) + g.n;
  return SB_KIND_ORDER.filter(k => n[k]).map(k => `<b style="color:var(--text);">${n[k].toLocaleString()}</b> ${SB_KIND_LABEL[k]}`).join(' · ');
}
// sbListHtml(): the rows of #sb-list for the current view.
function sbListHtml() {
  const empty = '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No occupied slots.</div>';
  if (SB_VIEW !== 'totals') return SAVE.cl.slots.map((s, i) => storageSlotRow(s, i)).filter(Boolean).join('') || empty;
  const rows = storageTotals(), ko = k => SB_KIND_ORDER.indexOf(k), nm = (a, b) => a.label.localeCompare(b.label) || a.sub.localeCompare(b.sub, undefined, { numeric: true });
  rows.sort(SB_TOTAL_SORT === 'name' ? nm : SB_TOTAL_SORT === 'kind' ? (a, b) => ko(a.kind) - ko(b.kind) || nm(a, b) : (a, b) => b.n - a.n || nm(a, b));
  return rows.map(g => `<div class="listRow sbTot" data-sb-kind="${g.kind}" data-sb-n="${g.n}"><div class="name">${g.ico()}${escapeHtml(g.label)}${g.sub ? ` <span style="color:var(--text-dim); font-weight:400;">${escapeHtml(g.sub)}</span>` : ''}</div><div class="id">${g.kind}</div><button class="subtle" data-sb-t="minus" data-sb-key="${escapeHtml(g.key)}" title="Remove one${g.kind === 'weapon' || g.kind === 'armor' ? ' (the most worn copy first)' : ''}" style="min-width:30px;">−</button><span class="badge" style="min-width:52px; text-align:center;">×${g.n.toLocaleString()}</span><button class="subtle" data-sb-t="plus" data-sb-key="${escapeHtml(g.key)}" title="Add one more${g.kind === 'weapon' || g.kind === 'armor' ? ' at this level, with full durability and ammo' : ''}" style="min-width:30px;" ${g.src ? '' : 'disabled'}>+</button><button class="subtle" data-sb-t="all" data-sb-key="${escapeHtml(g.key)}" title="Remove all ${g.n.toLocaleString()} from the Storage Box">✕ all</button></div>`).join('') || empty;
}
// Currently selected deposit category in the Storage Box: bp, pt, msr, bst or item.
let sbCategory = 'bp';
// Storage contents search: filters the list in place (kept across re-renders)
let SB_CONTENT_FILTER = '';
// Hide non-matching rows in #sb-list and update the count label.
function applyStorageContentFilter() {
  const list = document.getElementById('sb-list');
  if (!list) return;
  const q = norm(SB_CONTENT_FILTER || '');
  const rows = [ ...list.querySelectorAll('.listRow') ];
  let shown = 0;
  for (const r of rows) {
    const hit = !q || norm(r.textContent + ' ' + (r.dataset.sbKind || '')).includes(q);
    r.style.display = hit ? '' : 'none';
    if (hit) shown++;
  }
  const c = document.getElementById('sb-content-count');
  if (!c) return;
  if (SB_VIEW === 'totals') {
    const held = rows.filter(r => r.style.display !== 'none').reduce((n, r) => n + (Number(r.dataset.sbN) || 0), 0);
    c.textContent = q ? `${shown} of ${rows.length} different things shown · ${held.toLocaleString()} held` : `${rows.length} different thing${rows.length === 1 ? '' : 's'} · ${held.toLocaleString()} held`;
  } else c.textContent = q ? `${shown} of ${rows.length} shown` : `${rows.length} item${rows.length === 1 ? '' : 's'}`;
}

// HTML for the deposit form of the selected category (level for parts, unrevealed for blueprints, cooked for mushrooms/beasts).
function sbAddFormHtml() {
  const qtyField = `<div class="field"><label>Quantity</label><input type="number" id="sb-qty" min="1" value="${escapeHtml(SB_FORM.qty)}"></div>`;
  if (sbCategory === 'pt') {
    return `<div class="grid">\n      <div class="searchwrap" style="grid-column:span 2;"><input type="text" id="sb-add-search" placeholder="Search weapon/armor name..."><div class="acdrop" id="sb-add-acdrop"></div></div>\n      <div class="field"><label>Level (in-game +N)</label><input type="number" id="sb-add-lvl" value="${escapeHtml(SB_FORM.lvl)}" min="0"></div>\n      ${qtyField}\n    </div>`;
  }
  if (sbCategory === 'bp') {
    return `<div class="grid">\n      <div class="searchwrap" style="grid-column:span 2;"><input type="text" id="sb-add-search" placeholder="Search blueprint (by the weapon/armor it unlocks)..."><div class="acdrop" id="sb-add-acdrop"></div></div>\n      <div class="field"><label><input type="checkbox" id="sb-add-unrevealed" style="width:auto; margin-right:6px;" ${SB_FORM.unrevealed ? 'checked' : ''}>Unrevealed (shows as "?" -- ITMP_*U)</label></div>\n      ${qtyField}\n    </div>`;
  }
  if (sbCategory === 'msr' || sbCategory === 'bst') {
    return `<div class="grid">\n      <div class="searchwrap" style="grid-column:span 2;"><input type="text" id="sb-add-search" placeholder="Search ${sbCategory === 'msr' ? 'mushroom' : 'beast'} name..."><div class="acdrop" id="sb-add-acdrop"></div></div>\n      <div class="field"><label><input type="checkbox" id="sb-add-cooked" style="width:auto; margin-right:6px;" ${SB_FORM.cooked ? 'checked' : ''}>Cooked</label></div>\n      ${qtyField}\n    </div>\n    `;
  }
  return `<div class="grid">\n    <div class="searchwrap" style="grid-column:span 3;"><input type="text" id="sb-add-search" placeholder="Search material or item name (e.g. Iron Scraps, Solo Shelter, Barbmeat)..."><div class="acdrop" id="sb-add-acdrop"></div></div>\n    ${qtyField}\n  </div>`;
}

// Wire the Storage Box tab: search, capacity, max, repair & refill all, clear all, remove, category tabs, bulk blueprint buttons.
function wireStorageBox() {
  const sbSearch = document.getElementById('sb-content-search');
  if (sbSearch) sbSearch.addEventListener('input', () => { SB_CONTENT_FILTER = sbSearch.value; applyStorageContentFilter(); });
  applyStorageContentFilter();
  // Contents view switch and totals order: only the list is redrawn
  const redrawList = () => {
    document.querySelectorAll('[data-sb-view]').forEach(el => el.classList.toggle('active', el.dataset.sbView === SB_VIEW));
    document.getElementById('sb-total-sort').style.display = SB_VIEW === 'totals' ? '' : 'none';
    document.getElementById('sb-list').innerHTML = sbListHtml();
    applyStorageContentFilter();
  };
  document.querySelectorAll('[data-sb-view]').forEach(el => el.addEventListener('click', () => { SB_VIEW = el.dataset.sbView; redrawList(); }));
  document.getElementById('sb-total-sort').addEventListener('change', e => { SB_TOTAL_SORT = e.target.value; redrawList(); });
  document.getElementById('sb-capacity').addEventListener('change', e => {
    let target = parseInt(e.target.value, 10) || STORAGE_BOX_MIN;
    target = Math.round(target / storageBoxStep()) * storageBoxStep();
    if (target < STORAGE_BOX_MIN) target = STORAGE_BOX_MIN;
    if (target > storageBoxMax()) {
      target = storageBoxMax();
      toast(`Clamped to max capacity (${storageBoxMax()})`);
    }
    resizeStorageBox(target);
  });
  document.getElementById('sb-max').addEventListener('click', () => {
    resizeStorageBox(storageBoxMax());
    toast('Storage box maxed');
  });
  document.getElementById('sb-refresh-all').addEventListener('click', () => {
    const inBox = new Set(SAVE.cl.slots.map(s => s.eptid).filter(e => e && e !== '-1'));
    let n = 0;
    for (const p of arr(SAVE.cl.pts)) if (inBox.has(p.eptid) && refreshPart(p)) n++;
    renderAll();
    toast(n ? `Repaired and refilled ${n} item${n === 1 ? '' : 's'} in the Storage Box` : 'Everything in the Storage Box is already at 100% with full ammo');
  });
  document.getElementById('sb-clear-all').addEventListener('click', () => {
    if (!confirm(`Delete all ${SAVE.cl.slots.filter(s => s.eptid && s.eptid !== '-1' || s.emsrid && s.emsrid !== '-1' || s.ebstid && s.ebstid !== '-1' || s.eitemid && s.eitemid !== '-1').length} items in Storage Box? This can't be undone.`)) return;
    SAVE.cl.slots = SAVE.cl.slots.map((s, i) => ({
      slot: i,
      eptid: '-1',
      emsrid: '-1',
      ebstid: '-1',
      eitemid: '-1'
    }));
    renderAll();
    toast('Storage box cleared');
  });
  // one listener on the list, so the remove buttons keep working after the list is redrawn by the view switch
  document.getElementById('sb-list').addEventListener('click', e => {
    // Totals view: - / + / remove all on a group
    const tb = e.target.closest('[data-sb-t]');
    if (tb) {
      const g = storageTotals().find(x => x.key === tb.dataset.sbKey);
      if (!g) return;
      const what = g.label + (g.sub ? ' ' + g.sub : '');
      if (tb.dataset.sbT === 'plus') { if (!sbTotalsAddOne(g)) return; }
      else if (tb.dataset.sbT === 'minus') sbTotalsRemoveOne(g);
      else {
        if (g.n > 1 && !confirm(`Remove all ${g.n.toLocaleString()} "${what}" from the Storage Box? Nothing is written until you download.`)) return;
        for (const i of g.slots) SAVE.cl.slots[i] = sbEmptySlot(i);
        toast(`Removed ${g.n.toLocaleString()} "${what}"`);
      }
      // redraw everything (slot count, change tracking) but stay where the user was in the list
      const top = document.getElementById('sb-list').scrollTop, y = window.scrollY;
      renderAll();
      const nl = document.getElementById('sb-list');
      if (nl) nl.scrollTop = top;
      window.scrollTo(0, y);
      return;
    }
    const btn = e.target.closest('[data-sb-remove]');
    if (!btn) return;
    const i = parseInt(btn.dataset.sbRemove, 10);
    SAVE.cl.slots[i] = {
      slot: i,
      eptid: '-1',
      emsrid: '-1',
      ebstid: '-1',
      eitemid: '-1'
    };
    renderAll();
  });
  document.querySelectorAll('[data-sb-cat]').forEach(el => {
    el.addEventListener('click', () => {
      sbCategory = el.dataset.sbCat;
      renderSbForm();
    });
  });
  // deposit a list of blueprint item ids; reports when the box fills up
  function bulkDeposit(ids, label) {
    if (!AP || !AP.pts || !AP.pts.length) {
      toast('Load masters.db first', true);
      return;
    }
    const added = depositBlueprintIds(ids);
    renderAll();
    if (added < ids.length) toast(`Storage full -- added ${added} of ${ids.length} ${label}; raise capacity for the rest`, true); else toast(`Added ${added} ${label}`);
  }
  document.getElementById('sb-add-legit-bp').addEventListener('click', () => {
    bulkDeposit(legitBlueprintItemIds(), 'obtainable blueprints');
  });
  document.getElementById('sb-add-ps-bp').addEventListener('click', () => {
    // same rule as Research's "Include PS-only": on a PC save these only work in PC games modded to have them
    if (!isPsSave() && psOnlyFirstTierBlueprintItemIds().length && !confirm('This is a PC save. PlayStation-only blueprints only work on PC games modded to have them. Add them anyway?')) return;
    bulkDeposit(psOnlyFirstTierBlueprintItemIds(), 'PS-only blueprints');
  });
  document.getElementById('sb-add-travis-bp').addEventListener('click', () => {
    bulkDeposit(travisBlueprintItemIds(), 'Travis / Beam Katana blueprints');
  });
  document.getElementById('sb-add-tdm-bp').addEventListener('click', () => {
    bulkDeposit(tdmBlueprintItemIds(), 'TDM blueprints');
  });
  renderSbForm();
}

// Grow (add empty slots at the end) or shrink (drop empty slots from the end, never an occupied one) the box, then re-render.
function resizeStorageBox(target) {
  const cl = SAVE.cl;
  if (target > cl.slots.length) {
    for (let i = cl.slots.length; i < target; i++) cl.slots.push({
      slot: i,
      eptid: '-1',
      emsrid: '-1',
      ebstid: '-1',
      eitemid: '-1'
    });
  } else if (target < cl.slots.length) {
    // never drop occupied slots: stop at the last slot that holds something (rounded up to the box's step)
    const used = s => s && [ s.eptid, s.emsrid, s.ebstid, s.eitemid ].some(v => v && v !== '-1');
    let last = -1;
    cl.slots.forEach((s, i) => { if (used(s)) last = i; });
    const step = storageBoxStep();
    const floor = Math.max(STORAGE_BOX_MIN, Math.ceil((last + 1) / step) * step);
    if (target < floor) {
      toast(`Can't shrink below ${floor}: slot ${last + 1} holds an item. Remove items from the end of the box first.`, true);
      target = floor;
    }
    if (target < cl.slots.length) cl.slots.length = target;
  }
  renderAll();
}

// Render the deposit form for the current category and hook up the autocomplete that deposits on pick.
function renderSbForm() {
  document.querySelectorAll('[data-sb-cat]').forEach(el => el.classList.toggle('active', el.dataset.sbCat === sbCategory));
  document.getElementById('sb-add-form').innerHTML = sbAddFormHtml() + qtyFirstNote(sbCategory === 'pt');
  bindFormState([ [ 'sb-qty', SB_FORM, 'qty' ], [ 'sb-add-lvl', SB_FORM, 'lvl' ], [ 'sb-add-unrevealed', SB_FORM, 'unrevealed' ], [ 'sb-add-cooked', SB_FORM, 'cooked' ] ]);
  const addSearch = document.getElementById('sb-add-search');
  const catType = sbCategory === 'pt' ? 'pt' : sbCategory === 'bp' ? 'bp' : sbCategory === 'msr' ? 'msr' : sbCategory === 'bst' ? 'bst' : 'item';
  wireAutocomplete(addSearch, document.getElementById('sb-add-acdrop'), catType, rec => {
    depositToStorage(rec);
  }, undefined, 'sb-add-lvl');
}

// Index of the first completely empty slot, or -1 when the box is full.
function storageFreeSlotIndex() {
  return SAVE.cl.slots.findIndex(s => (!s.eptid || s.eptid === '-1') && (!s.eitemid || s.eitemid === '-1') && (!s.emsrid || s.emsrid === '-1') && (!s.ebstid || s.ebstid === '-1'));
}

// ==== Bulk blueprint lists ====
// Obtainable blueprints: chain-root parts that are allowed for research, real blueprints, minus PS-only and Travis ones.
function legitBlueprintItemIds() {
  const bpIds = new Set((AP.items || []).filter(it => it.itemtype === 'ITTP_RMAP').map(it => it.itemId));
  const excluded = new Set([ ...psOnlyFirstTierBlueprintItemIds(), ...TRAVIS_BLUEPRINT_IDS ]);
  const out = [];
  for (const p of AP.pts || []) {
    if (!isResearchAllowed(p.id)) continue;
    if (!isChainRoot(p.id)) continue;
    const iid = 'ITMP_' + p.id.slice(3);
    if (bpIds.has(iid) && isRealBlueprint(iid) && !excluded.has(iid)) out.push(iid);
  }
  return out;
}

// First-tier PS-only blueprints (chain roots, excluding the _1001/_1002 variants).
function psOnlyFirstTierBlueprintItemIds() {
  const bpIds = new Set((AP.items || []).filter(it => it.itemtype === 'ITTP_RMAP').map(it => it.itemId));
  const out = [];
  for (const ptid of psOnlyBlueprintPtids()) {
    if (!isChainRoot(ptid)) continue;
    if (/_100[12]$/.test(ptid)) continue;
    const iid = 'ITMP_' + ptid.slice(3);
    if (bpIds.has(iid)) out.push(iid);
  }
  return out;
}

// Item ids for the Travis jacket/pants/sunglasses and Beam Katana 1 blueprints.
const TRAVIS_BLUEPRINT_IDS = [ 'ITMP_SPE_TOPS_015', 'ITMP_SPE_BTM_015', 'ITMP_SPE_HEAD_015', 'ITMP_ARM_WP001_0N1' ];

// Travis blueprint ids that exist in the loaded masters.db.
function travisBlueprintItemIds() {
  return TRAVIS_BLUEPRINT_IDS.filter(id => ITEM_INDEX[id]);
}

// Blueprints for parts whose name ends in 'TDM' (Tokyo Death Metro).
function tdmBlueprintItemIds() {
  const out = [];
  for (const p of AP.pts || []) {
    const name = resolveName(p.name) || '';
    if (!/TDM\s*$/i.test(name)) continue;
    const iid = 'ITMP_' + p.id.slice(3);
    if (ITEM_INDEX[iid] && isRealBlueprint(iid)) out.push(iid);
  }
  return out;
}

// ==== Storage deposits ====
// Put blueprint items into free slots (stops when full); returns how many were added.
// New instances get an 'edit-' prefixed random id so they are distinguishable from game ids.
function depositBlueprintIds(itemIds) {
  const cl = SAVE.cl;
  let added = 0;
  for (const itemId of itemIds) {
    const emptyIdx = storageFreeSlotIndex();
    if (emptyIdx < 0) break;
    const eitemid = 'edit-' + Math.random().toString(16).slice(2) + Date.now().toString(16) + added;
    cl.items.push({
      eitemid: eitemid,
      itemId: itemId,
      gettime: Math.floor(Date.now() / 1e3)
    });
    cl.slots[emptyIdx] = {
      slot: emptyIdx,
      eptid: '-1',
      emsrid: '-1',
      ebstid: '-1',
      eitemid: eitemid
    };
    added++;
  }
  return added;
}

// Deposit `qty` copies of the picked record into the Storage Box according to sbCategory.
// Each copy creates an instance in cl.pts / cl.items / cl.msrs / cl.bsts and points a free slot at it.
// Parts get full durability/ammo for the chosen level; mushrooms only cook if enable_roast;
// cooked/state: 0 = raw, 1 = grilled.
function depositToStorage(rec) {
  const cl = SAVE.cl;
  const qty = Math.max(1, parseInt((document.getElementById('sb-qty') || {}).value, 10) || 1);
  let deposited = 0;
  for (let n = 0; n < qty; n++) {
    const emptyIdx = storageFreeSlotIndex();
    if (emptyIdx < 0) {
      toast(`Storage box full -- deposited ${deposited}/${qty}, raise capacity for the rest`, true);
      break;
    }
    if (sbCategory === 'pt') {
      const clampedLvl = rawFromDisplay(rec, (document.getElementById('sb-add-lvl') || {}).value);
      const eptid = 'edit-' + Math.random().toString(16).slice(2) + Date.now().toString(16) + n;
      cl.pts.push({
        eptid: eptid,
        ptid: rec.id,
        gettime: Math.floor(Date.now() / 1e3),
        rest: Number(rec.capacity) || 0,
        spare: Number(rec.spare) || 0,
        grade: 0,
        dur: partMaxDur(rec, clampedLvl) || rec.dur,
        lvl: clampedLvl
      });
      cl.slots[emptyIdx] = {
        slot: emptyIdx,
        eptid: eptid,
        emsrid: '-1',
        ebstid: '-1',
        eitemid: '-1'
      };
    } else if (sbCategory === 'bp') {
      const unrevealed = !!(document.getElementById('sb-add-unrevealed') || {}).checked;
      let itemId = rec.id;
      if (!itemId.startsWith('ITMP_')) {
        toast('That\'s not a blueprint item', true);
        return;
      }
      if (unrevealed && !itemId.endsWith('U')) itemId += 'U';
      if (!unrevealed && itemId.endsWith('U')) itemId = itemId.slice(0, -1);
      const eitemid = 'edit-' + Math.random().toString(16).slice(2) + Date.now().toString(16) + n;
      cl.items.push({
        eitemid: eitemid,
        itemId: itemId,
        gettime: Math.floor(Date.now() / 1e3)
      });
      cl.slots[emptyIdx] = {
        slot: emptyIdx,
        eptid: '-1',
        emsrid: '-1',
        ebstid: '-1',
        eitemid: eitemid
      };
    } else if (sbCategory === 'msr') {
      const cooked = !!(document.getElementById('sb-add-cooked') || {}).checked;
      if (cooked && !rec.enable_roast) {
        toast(`"${rec.name}" can't be roasted (enable_roast=0 in apiparams) -- depositing uncooked instead`, true);
      }
      const actuallyCooked = cooked && !!rec.enable_roast;
      const emsrid = 'edit-' + Math.random().toString(16).slice(2) + Date.now().toString(16) + n;
      cl.msrs.push({
        emsrid: emsrid,
        msrid: rec.id,
        gettime: Math.floor(Date.now() / 1e3),
        eefcid: '',
        tefcid: '',
        state: actuallyCooked ? 1 : 0,
        cooked: actuallyCooked
      });
      cl.slots[emptyIdx] = {
        slot: emptyIdx,
        eptid: '-1',
        emsrid: emsrid,
        ebstid: '-1',
        eitemid: '-1'
      };
    } else if (sbCategory === 'bst') {
      const cooked = !!(document.getElementById('sb-add-cooked') || {}).checked;
      const ebstid = 'edit-' + Math.random().toString(16).slice(2) + Date.now().toString(16) + n;
      cl.bsts.push({
        ebstid: ebstid,
        bstid: rec.id,
        gettime: Math.floor(Date.now() / 1e3),
        lvl: 1,
        state: cooked ? 1 : 0,
        cooked: cooked
      });
      cl.slots[emptyIdx] = {
        slot: emptyIdx,
        eptid: '-1',
        emsrid: '-1',
        ebstid: ebstid,
        eitemid: '-1'
      };
    } else {
      const eitemid = 'edit-' + Math.random().toString(16).slice(2) + Date.now().toString(16) + n;
      cl.items.push({
        eitemid: eitemid,
        itemId: rec.id,
        gettime: Math.floor(Date.now() / 1e3)
      });
      cl.slots[emptyIdx] = {
        slot: emptyIdx,
        eptid: '-1',
        emsrid: '-1',
        ebstid: '-1',
        eitemid: eitemid
      };
    }
    deposited++;
  }
  if (deposited === qty) toast(`Deposited ${qty}x "${rec.name}"`);
  renderAll();
}

