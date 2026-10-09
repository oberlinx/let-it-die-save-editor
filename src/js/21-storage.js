// ==== Storage Box tab ====
// HTML for the Storage Box tab: capacity, bulk blueprint buttons, deposit form, contents list.
// SAVE.cl.slots is an array of {slot, eptid, emsrid, ebstid, eitemid}; '-1' means empty. Each non-empty
// slot points at an instance in cl.pts / cl.msrs / cl.bsts / cl.items.
function blockStorageBox() {
  const cl = SAVE.cl;
  const cap = cl.slots.length;
  const occupied = cl.slots.filter(s => s.eptid && s.eptid !== '-1' || s.emsrid && s.emsrid !== '-1' || s.ebstid && s.ebstid !== '-1' || s.eitemid && s.eitemid !== '-1').length;
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Item Storage</div><h2>Storage Box</h2></div></div>\n    <div class="block-body">\n      <div class="grid" style="margin-bottom:6px;">\n        <div class="field"><label>Capacity (${STORAGE_BOX_MIN}-${storageBoxMax()}, steps of ${storageBoxStep()})</label><input type="number" id="sb-capacity" min="${STORAGE_BOX_MIN}" max="${storageBoxMax()}" step="${storageBoxStep()}" value="${cap}"></div>\n        <div class="field" style="display:flex; align-items:end;"><button class="subtle" id="sb-max">Max (${storageBoxMax()})</button></div>\n      </div>\n      <div class="capNote ${occupied >= cap ? 'over' : ''}">${occupied} / ${cap} slots occupied${occupied >= cap ? ' -- FULL, raise capacity to add more' : ''}. Changing capacity adds/removes empty slots at the end; it never deletes occupied ones.</div>\n\n      <div class="eyebrow" style="margin:12px 0 6px;">Bulk blueprints</div>\n      <div class="toolbar">\n        <button class="subtle" id="sb-add-legit-bp">+1 of every obtainable blueprint</button>\n        <button class="subtle" id="sb-add-ps-bp">+1 PlayStation-only blueprint</button>\n        <button class="subtle" id="sb-add-travis-bp">+1 Travis jacket, pants, sunglasses &amp; Beam Katana 1</button>\n        <button class="subtle" id="sb-add-tdm-bp">+1 every TDM blueprint</button>\n      </div>\n\n      <div class="eyebrow" style="margin:12px 0 6px;">Deposit item</div>\n      <div class="subTabs" id="sb-cat-tabs">\n        <div class="subTab active" data-sb-cat="bp">Blueprint</div>\n        <div class="subTab" data-sb-cat="pt">Weapon / Armor</div>\n        <div class="subTab" data-sb-cat="msr">Mushroom</div>\n        <div class="subTab" data-sb-cat="bst">Beast</div>\n        <div class="subTab" data-sb-cat="item">Material / Other Item</div>\n      </div>\n      <div id="sb-add-form"></div>\n\n      <div class="eyebrow" style="margin:16px 0 8px;">Contents <button class="subtle" id="sb-refresh-all" style="margin-left:8px;" title="Durability to 100% and ammo full on every weapon and armor in the Storage Box">Repair &amp; refill all</button> <button class="subtle" id="sb-clear-all" style="margin-left:4px;">Clear all</button></div>\n      <div class="toolbar" style="margin-bottom:6px;"><input type="text" id="sb-content-search" placeholder="Search contents: name, level, or weapon / armor / blueprint / mushroom / beast / material" value="${escapeHtml(SB_CONTENT_FILTER)}" style="flex:1; max-width:360px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);"><span class="count" id="sb-content-count"></span></div>\n      <div class="listBlock" id="sb-list">\n        ${cl.slots.map((s, i) => storageSlotRow(s, i)).filter(Boolean).join('') || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No occupied slots.</div>'}\n      </div>\n    </div>\n  </section>`;
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
  let label = null, sub = '', kind = '';
  if (s.eptid && s.eptid !== '-1') {
    const inst = arr(SAVE.cl.pts).find(p => p.eptid === s.eptid);
    const rec = inst && PT_INDEX[inst.ptid];
    label = rec ? rec.name : inst ? inst.ptid : 'part (unresolved)';
    const pct = rec ? durabilityPct(inst, rec) : null;
    sub = rec ? `+${displayFromRaw(rec, inst.lvl)} · durability ${pct != null ? pct + '%' : '?'}${ammoText(inst, rec)}` : '';
    kind = rec ? (rec.type === 'PTTP_ARM' ? 'weapon' : 'armor ' + partSlotLabel(rec)) : 'part';
  } else if (s.eitemid && s.eitemid !== '-1') {
    const inst = arr(SAVE.cl.items).find(p => p.eitemid === s.eitemid);
    label = inst ? itemDisplayName(inst.itemId) : 'item (unresolved)';
    kind = inst && String(inst.itemId).startsWith('ITMP_') ? 'blueprint' : 'material item';
  } else if (s.emsrid && s.emsrid !== '-1') {
    const inst = arr(SAVE.cl.msrs).find(m => m.emsrid === s.emsrid);
    label = inst ? msrDisplayName(inst.msrid, inst.cooked) : 'Mushroom';
    kind = 'mushroom';
  } else if (s.ebstid && s.ebstid !== '-1') {
    const inst = arr(SAVE.cl.bsts).find(b => b.ebstid === s.ebstid);
    label = inst ? bstDisplayName(inst.bstid, inst.cooked) : 'Beast';
    kind = 'beast';
  }
  if (!label) return '';
  return `<div class="listRow" data-sb-kind="${kind}"><div class="name">${escapeHtml(label)} ${sub}</div><div class="id">slot ${s.slot != null ? s.slot : i}</div><button class="subtle" data-sb-remove="${i}">✕</button></div>`;
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
  if (c) c.textContent = q ? `${shown} of ${rows.length} shown` : `${rows.length} item${rows.length === 1 ? '' : 's'}`;
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
  document.querySelectorAll('[data-sb-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
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

