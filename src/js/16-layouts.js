// ===== Layouts: a shared library of fighter loadouts (weapons, armor, decals) =====
// The library lives in this browser (localStorage) and in exported .json files, not in the save, so one
// set of layouts works for every save and fighter. Applying a layout follows the same equipment rules as
// the Fighters tab (gearProblem): right slot type, not broken, stat requirement met (counting the decals the
// layout puts on). Each piece comes from stock (the fighter's own Death Bag, then the Storage Box; decals
// from the decal stock), is created new, or stock first and then created.
// localStorage key for the layout library (versioned).
const LAY_KEY = 'lid.layouts.v1';
// Weapon quick-slot indexes: 0-2 are right hand, 3-5 left hand.
const LAY_WEAPON_SLOTS = [ 0, 1, 2, 3, 4, 5 ];
// Armor equip sites, with display labels and the part type each site accepts.
const LAY_ARMOR_SITES = [ 'EQSITE_HEAD', 'EQSITE_BODY', 'EQSITE_LEGS' ];
const LAY_ARMOR_LABEL = { EQSITE_HEAD: 'Head', EQSITE_BODY: 'Body', EQSITE_LEGS: 'Legs' };
const LAY_ARMOR_TYPE = { EQSITE_HEAD: 'PTTP_HEAD', EQSITE_BODY: 'PTTP_BODY', EQSITE_LEGS: 'PTTP_LEGS' };
// Source modes for gear/decals: [value, label]. 'both' = stock first then create.
const LAY_MODES = [ [ 'both', 'Stock first, then create' ], [ 'stock', 'Stock only' ], [ 'create', 'Create only' ] ];
// Layout library state: `list` of normalized layouts, `sel` selected layout id.
let LAY = { list: [], sel: null };
// UI/session options for the Layouts tab: chosen fighter cid, gear/decal source modes, replace/clear/PS
// toggles, the last preview/apply `report`, and the single-level `undo` snapshot.
let LAY_UI = { fighter: '', gearMode: 'both', decalMode: 'both', replaceDecals: true, clearEmpty: false, includePs: null, report: null, undo: null };
// Decal bookkeeping for this loaded save (keys are "cid|sklid"): decals a layout took from the decal stock (premium ones go
// back on removal), and premium decals the save itself had equipped that were already returned to stock.
let LAY_STATE = { root: null, fromStock: new Set, returned: new Set };

// Random layout id.
function layRid() { return 'lay-' + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4); }
// Coerce to string and truncate to n characters.
function layStr(s, n) { return String(s == null ? '' : s).slice(0, n); }
// Normalize one gear entry to {ptid, lvl} (display level, clamped 0-99), or null if invalid.
function layEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.ptid !== 'string' || !e.ptid) return null;
  const l = Math.round(Number(e.lvl));
  return { ptid: layStr(e.ptid, 80), lvl: Number.isFinite(l) ? Math.min(Math.max(l, 0), 99) : 0 };
}
// Make any object (library entry or imported file) a well-formed layout.
function layNorm(o) {
  if (!o || typeof o !== 'object') return null;
  const w = Array.isArray(o.weapons) ? o.weapons : [];
  const a = o.armor && typeof o.armor === 'object' ? o.armor : {};
  const held = Array.isArray(o.held) ? o.held.map(v => { v = Math.round(Number(v)); return v >= 0 && v <= 2 ? v : 0; }) : [ 0, 0 ];
  const seen = new Set;
  const decals = (Array.isArray(o.decals) ? o.decals : []).filter(id => typeof id === 'string' && id && !seen.has(id) && seen.add(id)).map(id => layStr(id, 80)).slice(0, 99);
  const armor = {};
  for (const s of LAY_ARMOR_SITES) armor[s] = layEntry(a[s]);
  return {
    id: typeof o.id === 'string' && o.id ? layStr(o.id, 40) : layRid(),
    name: layStr(o.name, 80) || 'Layout',
    notes: layStr(o.notes, 400),
    weapons: LAY_WEAPON_SLOTS.map(i => layEntry(w[i])),
    held: [ held[0] || 0, held[1] || 0 ],
    armor,
    decals
  };
}
// Load the library from localStorage (up to 200 layouts), normalizing each; falls back to empty and keeps a valid selection.
function layLoad() {
  try {
    const j = JSON.parse(localStorage.getItem(LAY_KEY) || '[]');
    LAY.list = (Array.isArray(j) ? j : []).slice(0, 200).map(layNorm).filter(Boolean);
  } catch (err) { LAY.list = []; }
  if (!LAY.list.some(l => l.id === LAY.sel)) LAY.sel = LAY.list.length ? LAY.list[0].id : null;
}
// Persist the library to localStorage; toasts and returns false if the browser refuses.
function laySave() {
  try { localStorage.setItem(LAY_KEY, JSON.stringify(LAY.list)); return true; }
  catch (err) { toast("Couldn't save the layout library in this browser. Use Export to keep a copy.", true); return false; }
}
// Load the library once at startup.
layLoad();
// The currently selected layout, or null.
function laySel() { return LAY.list.find(l => l.id === LAY.sel) || null; }
// A new empty layout with the given name (not added to the list).
function layNew(name) {
  const l = layNorm({ name: name || 'New layout' });
  return l;
}
// Whether PS-only items may be created: defaults to whether the loaded save is a PlayStation save, then user-controlled.
function layPsOk() {
  if (LAY_UI.includePs == null) LAY_UI.includePs = typeof isPsSave === 'function' ? !!isPsSave() : false;
  return !!LAY_UI.includePs;
}
// Pick the display level a part can actually be (min/max depend on the part; uncap parts start above +4).
function layClampLvl(rec, L) { return rec ? displayFromRaw(rec, rawFromDisplay(rec, L)) : (Number(L) || 0); }
// "Name +lvl" for a layout entry, or the raw ptid for unknown parts.
function layPartName(e) {
  const rec = e && PT_INDEX[e.ptid];
  return rec ? `${rec.name} +${layClampLvl(rec, e.lvl)}` : (e ? e.ptid : '');
}
// One-line summary like "3 weapons · 1 armor · 2 decals".
function laySummary(l) {
  const w = l.weapons.filter(Boolean).length, a = LAY_ARMOR_SITES.filter(s => l.armor[s]).length;
  return `${w} weapon${w === 1 ? '' : 's'} · ${a} armor · ${l.decals.length} decal${l.decals.length === 1 ? '' : 's'}`;
}

// A fighter's current weapons / armor / decals as a layout.
function layCapture(chr, name) {
  const l = layNorm({ name: name || `${chr.name || 'Fighter'} loadout` });
  const byEid = {};
  for (const p of arr(chr.pspts)) byEid[p.eptid] = p;
  const mk = p => { const rec = p && PT_INDEX[p.ptid]; return rec ? { ptid: p.ptid, lvl: displayFromRaw(rec, p.lvl) } : null; };
  LAY_WEAPON_SLOTS.forEach(i => { l.weapons[i] = mk(byEid[(chr.armslots || {})[i]]); });
  LAY_ARMOR_SITES.forEach(s => { const e = arr(chr.eqpts).find(x => x.site === s); l.armor[s] = e ? mk(byEid[e.eptid]) : null; });
  l.held = HAND_SITES.map(h => heldIndex(chr, h));
  l.decals = arr(chr.eqskls).map(s => s.id || s.sklid).filter(Boolean);
  return l;
}

// Number of decal slots the fighter has: class/grade base plus body-level skill bonus, clamped to the class floor and cap.
function layDecalSlots(chr) {
  const R = fighterRanges(chr.type || 'BAL', chr.grade != null ? chr.grade : 1, chr.limit_break || 0);
  return Math.min(Math.max(R.skillBase + ((chr.bodylvl || {}).skill || 0), R.skillFloor), R.skillCap);
}
// Reason a fighter can't receive a layout (dead Hater, dummy, kidnapped), or null if fine.
function layFighterBlock(c) {
  if (!c) return 'No fighter selected.';
  if (c.state === 'ENEMY') return 'This fighter is dead (a Hater). Recover them first.';
  if (c.state === 'DUMMY') return "This isn't a normal freezer fighter.";
  if (c.abid) return 'This fighter has been kidnapped.';
  return null;
}

// Apply `lay` to `chr` (a fighter), `cl` (the Storage Box) and `psskls` (the decal stock). It changes the
// objects it is given, so a preview runs it on copies. Returns the list of steps for the report.
// Details: `o` = {gearMode, decalMode, replaceDecals, clearEmpty, includePs}; `state` = LAY_STATE-like decal
// bookkeeping {fromStock, returned}; `rawEqIds` = decals the original save already had equipped (to decide whether a
// removed premium decal goes back to stock). Parts are identified by instance id `eptid`; new ones get an
// 'edit-' prefixed id. Order matters: decals first (requirement decals alter what gear is wearable), then gear,
// then held weapons. Step status: new, same, skip, lost, info, warn.
function layApply(lay, chr, cl, psskls, o, state, rawEqIds) {
  const steps = [];
  const add = (kind, status, label, text) => steps.push({ kind, status, label, text: text || '' });
  const ps = !!o.includePs;
  // normalize containers so later code can push without existence checks
  cl.pts = arr(cl.pts); cl.slots = arr(cl.slots);
  chr.pspts = arr(chr.pspts); chr.eqpts = arr(chr.eqpts); chr.eqskls = arr(chr.eqskls);
  chr.armslots = chr.armslots || {};
  // ---- decals first: requirement decals change what gear the fighter can wear ----
  const slotsTotal = layDecalSlots(chr);
  const cur = chr.eqskls.map(s => s.id || s.sklid);
  // `want` = layout decals; `finalIds` = what the fighter ends with; `removed` = decals taken off
  const want = lay.decals.slice();
  const stockOf = id => psskls.find(s => s.id === id);
  const finalIds = o.replaceDecals ? [] : cur.slice();
  const removed = o.replaceDecals ? cur.filter(id => !want.includes(id)) : [];
  // add each wanted decal: already on, else from decal stock, else created (if allowed)
  for (const id of want) {
    const rec = SKL_INDEX[id], nm = rec ? rec.name : id;
    if (cur.includes(id)) { add('decal', 'same', nm, 'already on'); if (o.replaceDecals) finalIds.push(id); continue; }
    if (!rec) { add('decal', 'skip', nm, 'unknown decal (not in this masters.db)'); continue; }
    const used = finalIds.length;
    if (used >= slotsTotal) { add('decal', 'skip', nm, `no free decal slot (${slotsTotal} slots)`); continue; }
    const st = stockOf(id);
    if (o.decalMode !== 'create' && st && (st.cnt || 0) > 0) {
      st.cnt -= 1; state.fromStock.add(`${chr.cid}|${id}`); finalIds.push(id); add('decal', 'new', nm, 'taken from the decal stock'); continue;
    }
    if (o.decalMode !== 'stock') {
      const why = rewardUnfit('skl', id, ps);
      if (why) { add('decal', 'skip', nm, `can't be created: ${why}`); continue; }
      finalIds.push(id); add('decal', 'new', nm, 'created (not taken from stock)'); continue;
    }
    add('decal', 'skip', nm, 'none in the decal stock');
  }
  // removed decals: premium ones return to the decal stock (capped at DECAL_CAP), normal ones are lost
  for (const id of removed) {
    const rec = SKL_INDEX[id], nm = rec ? rec.name : id;
    const key = `${chr.cid}|${id}`;
    if (rec && Number(rec.premium) === 1 && (state.fromStock.has(key) || (rawEqIds.has(id) && !state.returned.has(key)))) {
      let st = stockOf(id);
      if (!st) psskls.push(st = { id, lvl: 1, cnt: 0, is_checked: 1 });
      st.cnt = Math.min((st.cnt || 0) + 1, DECAL_CAP);
      if (state.fromStock.has(key)) state.fromStock.delete(key); else state.returned.add(key);
      add('decal', 'info', nm, 'taken off, premium decal returned to the decal stock');
    } else if (rec && Number(rec.premium) === 1) add('decal', 'info', nm, 'taken off (the editor added it, so nothing goes back to stock)');
    else add('decal', 'lost', nm, 'taken off. Normal decals are lost when removed');
  }
  // rebuild eqskls keeping existing objects for kept decals and assigning the first free slot to new ones
  const keptObjs = finalIds.map(id => chr.eqskls.find(s => (s.id || s.sklid) === id) || null);
  const used = new Set(keptObjs.filter(Boolean).map(e => e.slot));
  chr.eqskls = keptObjs.map((e, i) => {
    if (e) return e;
    let slot = 0; while (used.has(slot)) slot++;
    used.add(slot);
    return { id: finalIds[i], sklid: finalIds[i], slot };
  });
  // ---- gear ----
  // slots 0-2 = right hand (EQSITE_ARMR), 3-5 = left hand (EQSITE_ARML); armor targets use slot -1
  const weaponTargets = LAY_WEAPON_SLOTS.map(i => ({ site: i < 3 ? 'EQSITE_ARMR' : 'EQSITE_ARML', slot: i, e: lay.weapons[i], label: `${i < 3 ? 'Right' : 'Left'} hand slot ${(i % 3) + 1}` }));
  const armorTargets = LAY_ARMOR_SITES.map(s => ({ site: s, slot: -1, e: lay.armor[s], label: LAY_ARMOR_LABEL[s], armor: true }));
  const targets = weaponTargets.concat(armorTargets);
  // part currently in a target slot, or null
  const occupant = t => {
    const eid = t.armor ? (chr.eqpts.find(x => x.site === t.site) || {}).eptid : chr.armslots[t.slot];
    return eid ? chr.pspts.find(p => p.eptid === eid) : null;
  };
  const heldBefore = HAND_SITES.map(h => heldIndex(chr, h));
  const usedEids = new Set;
  // (a bag part worn in a slot the layout doesn't set must not be borrowed)
  const wornElsewhere = eid => {                 // worn in a slot this layout does not set
    for (const t of targets) if (!t.e && occupant(t) && occupant(t).eptid === eid) return true;
    return false;
  };
  // Storage Box pieces actually placed in a box slot ('-1' means empty)
  const inBox = new Set(cl.slots.map(s => s.eptid).filter(e => e && e !== '-1'));
  const bagFree = () => deathBagLimit(chr) - fighterItemCount(chr);
  // equip part p in target t, removing it from any other slot first
  const place = (t, p) => {
    for (const k of Object.keys(chr.armslots)) if (chr.armslots[k] === p.eptid) delete chr.armslots[k];
    chr.eqpts = chr.eqpts.filter(x => x.eptid !== p.eptid);
    if (t.armor) { chr.eqpts = chr.eqpts.filter(x => x.site !== t.site); chr.eqpts.push({ site: t.site, eptid: p.eptid, arm_slot: -1 }); }
    else chr.armslots[t.slot] = p.eptid;
  };
  // per target: skip/clear if the layout leaves it empty; else reuse, take from stock, or create
  for (const t of targets) {
    if (!t.e) {
      if (o.clearEmpty && occupant(t)) {
        const p = occupant(t);
        if (t.armor) chr.eqpts = chr.eqpts.filter(x => x.site !== t.site); else delete chr.armslots[t.slot];
        add(t.armor ? 'armor' : 'weapon', 'info', t.label, `emptied (${(PT_INDEX[p.ptid] || {}).name || p.ptid} stays in the Death Bag)`);
      }
      continue;
    }
    const rec = PT_INDEX[t.e.ptid];
    const kind = t.armor ? 'armor' : 'weapon';
    if (!rec) { add(kind, 'skip', t.label, `${t.e.ptid}: unknown part (not in this masters.db)`); continue; }
    const raw = rawFromDisplay(rec, t.e.lvl);
    const name = `${rec.name} +${displayFromRaw(rec, raw)}`;
    const label = `${t.label}: ${name}`;
    const occ = occupant(t);
    if (occ && occ.ptid === t.e.ptid && Number(occ.lvl) === raw && !gearProblem(chr, occ, t.site)) { usedEids.add(occ.eptid); add(kind, 'same', label, 'already equipped'); continue; }
    let stockNote = '';
    // 1. stock: the fighter's own bag, then the Storage Box
    if (o.gearMode !== 'create') {
      const fit = (p, from) => p.ptid === t.e.ptid && Number(p.lvl) === raw && !usedEids.has(p.eptid) && !(from === 'bag' && wornElsewhere(p.eptid));
      const cands = chr.pspts.filter(p => fit(p, 'bag')).map(p => ({ p, from: 'bag' }))
        .concat(cl.pts.filter(p => inBox.has(p.eptid) && fit(p, 'box')).map(p => ({ p, from: 'box' })))
        .sort((a, b) => (a.from === b.from ? 0 : a.from === 'bag' ? -1 : 1) || (Number(b.p.dur) || 0) - (Number(a.p.dur) || 0));
      let firstWhy = '';
      for (const c of cands) {
        const why = gearProblem(chr, c.p, t.site);
        if (why) { firstWhy = firstWhy || why; continue; }
        if (c.from === 'box') {
          if (bagFree() < 1) { firstWhy = firstWhy || `Death Bag full (${deathBagLimit(chr)} slots)`; continue; }
          cl.pts = cl.pts.filter(x => x !== c.p);
          cl.slots = cl.slots.map(s => s.eptid === c.p.eptid ? { slot: s.slot, eptid: '-1', emsrid: '-1', ebstid: '-1', eitemid: '-1' } : s);
          inBox.delete(c.p.eptid);
          chr.pspts.push(c.p);
        }
        usedEids.add(c.p.eptid); place(t, c.p);
        add(kind, 'new', label, c.from === 'bag' ? 'equipped from the Death Bag' : 'moved from the Storage Box and equipped');
        stockNote = 'done'; break;
      }
      if (stockNote === 'done') continue;
      stockNote = cands.length ? `in stock but ${firstWhy}` : 'none in stock';
    }
    // 2. create
    if (o.gearMode === 'stock') { add(kind, 'skip', label, stockNote); continue; }
    const unfit = rewardUnfit('pt', t.e.ptid, ps);
    if (unfit) { add(kind, 'skip', label, `${stockNote ? stockNote + '; ' : ''}can't be created: ${unfit}`); continue; }
    const fresh = { eptid: 'edit-' + Math.random().toString(16).slice(2) + Date.now().toString(16), ptid: rec.id, gettime: Math.floor(Date.now() / 1e3), rest: Number(rec.capacity) || 0, spare: Number(rec.spare) || 0, grade: 0, dur: partMaxDur(rec, raw) || rec.dur, lvl: raw };
    const why = gearProblem(chr, fresh, t.site);
    if (why) { add(kind, 'skip', label, `${stockNote ? stockNote + '; ' : ''}${why}`); continue; }
    if (bagFree() < 1) { add(kind, 'skip', label, `Death Bag full (${deathBagLimit(chr)} slots)`); continue; }
    chr.pspts.push(fresh); usedEids.add(fresh.eptid); place(t, fresh);
    add(kind, 'new', label, `created at full durability${stockNote ? ' (' + stockNote + ')' : ''}`);
  }
  // held weapons: the layout's choice per hand, where that slot ends up holding a weapon
  // held weapons: only switch a hand when the wanted slot holds a weapon
  let held = heldBefore.slice(), heldChanged = false;
  HAND_SITES.forEach((h, hi) => {
    const want = lay.held[hi];
    if (want !== heldBefore[hi] && chr.armslots[h.base + want]) { held[hi] = want; heldChanged = true; }
  });
  if (heldChanged) chr.select_arm_slots = `${held[0]},${held[1]}`;
  syncHeldWeapons(chr, held);
  // gear still worn that the fighter can no longer use (e.g. a requirement decal came off)
  // warn about gear still worn that is no longer allowed
  for (const b of gearProblems(chr)) {
    const p = chr.pspts.find(x => x.eptid === b.eid);
    add('warn', 'warn', (p && (PT_INDEX[p.ptid] || {}).name) || 'Gear', `still equipped but ${b.why}. Use "Unequip" on the Fighters tab or the Save check`);
  }
  return steps;
}

// ==== Layouts UI ====
// ---------- UI ----------
// Block shell for the Layouts tab.
function blockLayouts() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Fighters</div><h2>Layouts</h2></div></div>
    <div class="block-body"><div id="lay-body"></div></div>
  </section>`;
}
// Tab hook: render Layouts when active.
function wireLayouts() { if (activeTab === 'layouts') renderLayouts(); }

// Shared inline style for Layouts selects.
const LAY_SEL_STYLE = 'width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);';
// HTML row for one gear slot: label, current part, search box (autocomplete wired later by id), level input and Clear.
// `key` is 'w0'..'w5' for weapons or an EQSITE_* armor key; `lead` is optional leading HTML (the held radio).
function laySlotRow(key, label, entry, ptType, lead) {
  const rec = entry && PT_INDEX[entry.ptid];
  const cur = entry ? (rec ? `${escapeHtml(rec.name)} <span class="id">+${layClampLvl(rec, entry.lvl)}</span>` : `<span class="id">${escapeHtml(entry.ptid)} (unknown part)</span>`) : '<span class="id">empty</span>';
  return `<div class="listRow" style="gap:8px; align-items:center; flex-wrap:wrap;">
    <div style="width:150px; flex:none; font-size:12px; color:var(--text-faint); display:flex; align-items:center; gap:8px;">${lead || ''}<span>${escapeHtml(label)}</span></div>
    <div style="flex:1 1 160px; min-width:140px;">${cur}</div>
    <div class="searchwrap" style="flex:1 1 180px; min-width:150px;"><input type="text" id="lay-s-${key}" placeholder="Search to set..."><div class="acdrop" id="lay-d-${key}"></div></div>
    <label style="display:flex; align-items:center; gap:4px; font-size:11px; text-transform:none; letter-spacing:0;">+<input type="number" id="lay-l-${key}" min="0" max="99" value="${entry ? layClampLvl(rec, entry.lvl) : 0}" style="width:56px;"></label>
    ${entry ? `<button class="subtle" data-lay-clear="${key}">Clear</button>` : ''}
  </div>`;
}
// Render the Layouts tab: library list, capture-from-fighter, editor for the selected layout, and the apply
// panel (Preview / Apply / Undo). Resets decal bookkeeping when a different save is loaded.
function renderLayouts() {
  const host = document.getElementById('lay-body');
  if (!host) return;
  if (LAY_STATE.root !== RAW_SAV_ROOT) { LAY_STATE = { root: RAW_SAV_ROOT, fromStock: new Set, returned: new Set }; LAY_UI.undo = null; LAY_UI.report = null; }
  if (!AP || !SAVE) { host.innerHTML = '<div class="capNote">Load a save and masters.db first.</div>'; return; }
  const chrs = arr(SAVE.soul && SAVE.soul.chrs);
  if (!chrs.some(c => c.cid === LAY_UI.fighter)) LAY_UI.fighter = (chrs.find(c => !layFighterBlock(c)) || chrs[0] || {}).cid || '';
  const L = laySel();
  const modeOpts = cur => LAY_MODES.map(([ v, t ]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('');
  let h = howTo('Save loadouts once, apply them to any fighter in any save.', "A layout is a set of weapons (6 quick slots, which one is in hand), head/body/legs armor and decals. The library is kept in this browser and can be exported to a .json file and imported on another computer or shared. Applying a layout never skips the equipment rules: only gear the fighter can use is equipped (right slot, not broken, stat requirement met, counting the decals the layout puts on). 'Stock' means the fighter's own Death Bag, then the Storage Box for gear, and the decal stock for decals. 'Create' adds a new copy at full durability and ammo (new decals are not taken from stock, like adding one on the Fighters tab). 'Stock first, then create' uses what you have and makes only what is missing. You always get a preview before anything changes, and Undo puts the fighter, Storage Box and decal stock back.");
  h += `<div class="toolbar" style="margin:10px 0;">
    <button class="subtle" id="lay-new">New layout</button>
    <button class="subtle" id="lay-dup" ${L ? '' : 'disabled'}>Duplicate</button>
    <button class="subtle" id="lay-del" ${L ? '' : 'disabled'}>Delete</button>
    <button class="subtle" id="lay-import">Import…</button>
    <button class="subtle" id="lay-export" ${LAY.list.length ? '' : 'disabled'}>Export all</button>
    <input type="file" id="lay-import-file" accept=".json,application/json" style="display:none;">
  </div>`;
  h += `<div class="listBlock" id="lay-list" style="margin-bottom:12px;">${LAY.list.length ? LAY.list.map(l => `<div class="listRow" data-lay-pick="${escapeHtml(l.id)}" style="cursor:pointer; ${l.id === LAY.sel ? 'background:var(--panel-hi, rgba(255,255,255,0.06));' : ''}"><div class="name">${escapeHtml(l.name)}</div><div class="id">${laySummary(l)}</div></div>`).join('') : '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No layouts yet. Create one, or save a fighter\'s current loadout below.</div>'}</div>`;
  h += `<div class="toolbar" style="margin:6px 0 14px;"><span class="capNote" style="margin:0;">Save a fighter's current loadout as a layout:</span>
    <select id="lay-cap-fighter" style="${LAY_SEL_STYLE} max-width:260px;">${chrs.map(c => `<option value="${escapeHtml(c.cid)}" ${c.cid === LAY_UI.fighter ? 'selected' : ''}>${escapeHtml(c.name || '?')}</option>`).join('')}</select>
    <button class="subtle" id="lay-capture">Save as new layout</button></div>`;
  if (L) {
    h += `<div class="grid" style="margin-bottom:8px;"><div class="field"><label>Name</label><input type="text" id="lay-name" maxlength="80" value="${escapeHtml(L.name)}"></div>
      <div class="field"><label>Notes</label><input type="text" id="lay-notes" maxlength="400" value="${escapeHtml(L.notes)}"></div></div>`;
    h += '<div class="listBlock" style="margin-bottom:10px;">';
    HAND_SITES.forEach((hand, hi) => {
      h += `<div class="listRow"><div class="name">${hand.label}</div></div>`;
      for (let i = 0; i < 3; i++) {
        const slot = hand.base + i;
        const radio = `<input type="radio" name="lay-held-${hi}" data-lay-held="${hi}:${i}" ${L.held[hi] === i ? 'checked' : ''} title="Held in this hand when the layout is applied" style="width:auto;">`;
        h += laySlotRow('w' + slot, `Slot ${i + 1}${L.held[hi] === i ? ' (in hand)' : ''}`, L.weapons[slot], 'PTTP_ARM', radio);
      }
    });
    h += '<div class="listRow"><div class="name">Armor</div></div>';
    for (const s of LAY_ARMOR_SITES) h += laySlotRow(s, LAY_ARMOR_LABEL[s], L.armor[s], LAY_ARMOR_TYPE[s]);
    h += `<div class="listRow"><div class="name">Decals <span class="id">(${L.decals.length})</span></div></div>
      <div class="listRow" style="flex-direction:column; align-items:stretch; gap:6px;">
        <div class="searchwrap"><input type="text" id="lay-decal-search" placeholder="Search a decal to add..."><div class="acdrop" id="lay-decal-drop"></div></div>
        <div class="chipRow">${L.decals.map((id, i) => { const r = SKL_INDEX[id]; return `<div class="chip">${r ? escapeHtml(r.name) : escapeHtml(id)}${r && Number(r.premium) === 1 ? ' <span class="id">P</span>' : ''}<button data-lay-rmdecal="${i}">✕</button></div>`; }).join('') || '<span class="id">No decals.</span>'}</div>
      </div></div>`;
    // apply
    const fighterOpts = chrs.map(c => { const why = layFighterBlock(c); return `<option value="${escapeHtml(c.cid)}" ${c.cid === LAY_UI.fighter ? 'selected' : ''} ${why ? 'disabled' : ''}>${escapeHtml(c.name || '?')} · ${escapeHtml((CLASS_NAMES || {})[c.type] || c.type)} g${c.grade}${why ? ' (' + escapeHtml(why) + ')' : ''}</option>`; }).join('');
    h += `<div class="listBlock" style="margin-bottom:10px;"><div class="listRow"><div class="name">Apply “${escapeHtml(L.name)}”</div></div>
      <div class="listRow" style="flex-direction:column; align-items:stretch; gap:8px;">
        <div class="grid">
          <div class="field"><label>Fighter</label><select id="lay-fighter" style="${LAY_SEL_STYLE}">${fighterOpts}</select></div>
          <div class="field"><label>Weapons &amp; armor from</label><select id="lay-gearmode" style="${LAY_SEL_STYLE}">${modeOpts(LAY_UI.gearMode)}</select></div>
          <div class="field"><label>Decals from</label><select id="lay-decalmode" style="${LAY_SEL_STYLE}">${modeOpts(LAY_UI.decalMode)}</select></div>
        </div>
        <label style="display:flex; align-items:center; gap:6px; text-transform:none; letter-spacing:0; font-size:12px;"><input type="checkbox" id="lay-replace" ${LAY_UI.replaceDecals ? 'checked' : ''} style="width:auto;"> Replace the fighter's current decals (off: keep them and only add)</label>
        <label style="display:flex; align-items:center; gap:6px; text-transform:none; letter-spacing:0; font-size:12px;"><input type="checkbox" id="lay-clear" ${LAY_UI.clearEmpty ? 'checked' : ''} style="width:auto;"> Unequip slots this layout leaves empty (off: leave them as they are)</label>
        <label style="display:flex; align-items:center; gap:6px; text-transform:none; letter-spacing:0; font-size:12px;"><input type="checkbox" id="lay-ps" ${layPsOk() ? 'checked' : ''} style="width:auto;"> Include PS-only items when creating (${typeof isPsSave === 'function' && isPsSave() ? 'PlayStation save' : 'modded PC games'})</label>
        <div class="toolbar" style="margin:0;"><button id="lay-preview">Preview</button><button id="lay-apply" ${LAY_UI.report && LAY_UI.report.layId === L.id && LAY_UI.report.cid === LAY_UI.fighter ? '' : 'disabled'}>Apply</button><button class="subtle" id="lay-undo" ${LAY_UI.undo ? '' : 'disabled'}>Undo last apply${LAY_UI.undo ? ' (' + escapeHtml(LAY_UI.undo.name) + ')' : ''}</button></div>
        <div id="lay-report">${layReportHtml()}</div>
      </div></div>`;
  }
  host.innerHTML = h;
  wireLayoutsUi();
}
// HTML for the preview/apply report: one line per step with a status symbol, plus a summary count.
function layReportHtml() {
  const r = LAY_UI.report;
  if (!r) return '<div class="capNote" style="margin:0;">Press Preview to see exactly what would change. Nothing is changed until you press Apply.</div>';
  const sym = { new: '+', same: '=', skip: '✕', lost: '!', warn: '!', info: '·' };
  const col = { new: 'var(--good, #4a4)', same: 'var(--text-faint)', skip: 'var(--bad, #c33)', lost: 'var(--warn, #c93)', warn: 'var(--warn, #c93)', info: 'var(--text-faint)' };
  const rows = r.steps.map(s => `<div class="listRow" style="gap:8px;"><div style="width:16px; flex:none; font-family:var(--mono); color:${col[s.status]};">${sym[s.status]}</div><div style="flex:1;"><b>${escapeHtml(s.label)}</b> <span class="id">${escapeHtml(s.text)}</span></div></div>`).join('');
  const n = k => r.steps.filter(s => s.status === k).length;
  return `<div class="capNote" style="margin:0;">${r.done ? 'Applied to' : 'Preview for'} ${escapeHtml(r.fighter)}: ${n('new')} added or equipped, ${n('same')} already set, ${n('skip')} skipped${n('lost') ? `, ${n('lost')} decal${n('lost') === 1 ? '' : 's'} lost` : ''}.${r.done ? ' Download the .sav to keep it (the review screen lists every change).' : ''}</div><div class="listBlock" style="margin-top:6px;">${rows || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">This layout is empty.</div>'}</div>`;
}
// Current apply options gathered from the UI state.
function layOpts() {
  return { gearMode: LAY_UI.gearMode, decalMode: LAY_UI.decalMode, replaceDecals: LAY_UI.replaceDecals, clearEmpty: LAY_UI.clearEmpty, includePs: layPsOk() };
}
// Decal ids the original (raw) save had equipped on fighter `cid` (from soul.skl.eqskl under the main uid).
function layRawEqIds(cid) {
  const raw = RAW_SAV_ROOT && RAW_SAV_ROOT.soul && RAW_SAV_ROOT.soul.skl && RAW_SAV_ROOT.soul.skl.eqskl && RAW_SAV_ROOT.soul.skl.eqskl[RAW_SAV_MAIN_UID];
  return new Set(arr(raw).filter(e => e.cid === cid).map(e => e.sklid));
}
// Dry run: applies the layout to deep copies of the fighter, Storage Box and decal stock and shows the report.
function layPreview() {
  const L = laySel(), chr = arr(SAVE.soul.chrs).find(c => c.cid === LAY_UI.fighter);
  if (!L || !chr) return;
  const why = layFighterBlock(chr);
  if (why) { toast(why, true); return; }
  const clone = x => JSON.parse(JSON.stringify(x));
  const steps = layApply(L, clone(chr), clone(SAVE.cl || { pts: [], slots: [] }), clone(arr(SAVE.soul.psskls)), layOpts(), { fromStock: new Set(LAY_STATE.fromStock), returned: new Set(LAY_STATE.returned) }, layRawEqIds(chr.cid));
  LAY_UI.report = { layId: L.id, cid: chr.cid, fighter: chr.name || 'the fighter', steps, done: false };
  renderLayouts();
}
// Real apply: confirms if normal decals would be lost, snapshots state for Undo, mutates SAVE and re-runs the save check.
function layDoApply() {
  const L = laySel(), chr = arr(SAVE.soul.chrs).find(c => c.cid === LAY_UI.fighter);
  if (!L || !chr || !LAY_UI.report || LAY_UI.report.layId !== L.id || LAY_UI.report.cid !== chr.cid) return;
  const lost = LAY_UI.report.steps.filter(s => s.status === 'lost');
  if (lost.length && !confirm(`${lost.length} normal decal${lost.length === 1 ? '' : 's'} will be lost (${lost.map(s => s.label).join(', ')}). Continue?`)) return;
  SAVE.cl = SAVE.cl || { pts: [], slots: [] };
  SAVE.soul.psskls = arr(SAVE.soul.psskls);
  const snap = { cid: chr.cid, name: L.name, chr: JSON.stringify(chr), cl: JSON.stringify(SAVE.cl), psskls: JSON.stringify(SAVE.soul.psskls), fromStock: [...LAY_STATE.fromStock], returned: [...LAY_STATE.returned] };
  const steps = layApply(L, chr, SAVE.cl, SAVE.soul.psskls, layOpts(), LAY_STATE, layRawEqIds(chr.cid));
  LAY_UI.undo = snap;
  LAY_UI.report = { layId: L.id, cid: chr.cid, fighter: chr.name || 'the fighter', steps, done: true };
  runSaveCheck();
  renderAll();
  toast(`Applied "${L.name}" to ${chr.name || 'the fighter'}`);
}
// Restore the pre-apply snapshot (fighter, Storage Box, decal stock, bookkeeping) in place; one level only.
function layUndo() {
  const u = LAY_UI.undo;
  if (!u) return;
  const chr = arr(SAVE.soul.chrs).find(c => c.cid === u.cid);
  if (!chr) { toast('That fighter is gone', true); LAY_UI.undo = null; renderLayouts(); return; }
  if (!confirm(`Undo "${u.name}"? The fighter, the Storage Box and the decal stock go back to how they were before it was applied. Anything you changed on those since is lost.`)) return;
  const restore = (target, json) => { const o = JSON.parse(json); if (Array.isArray(target)) { target.length = 0; o.forEach(x => target.push(x)); } else { for (const k of Object.keys(target)) delete target[k]; Object.assign(target, o); } };
  restore(chr, u.chr); restore(SAVE.cl, u.cl); restore(SAVE.soul.psskls, u.psskls);
  LAY_STATE.fromStock = new Set(u.fromStock); LAY_STATE.returned = new Set(u.returned);
  LAY_UI.undo = null; LAY_UI.report = null;
  runSaveCheck();
  renderAll();
  toast('Layout undone');
}
// Download text as a JSON file via a temporary link.
function layDownload(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ text ], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// Exported files are laid out for people: one gear piece per line with its in-game name, empty slots
// spelled out, and "_" notes explaining each part. The import only reads id, name, notes, weapons
// (ptid + lvl), held, armor and decals, so the extra fields and notes are ignored and older editors
// still read these files. Windows line endings so Notepad shows the lines.
// Label such as "Right hand 2" for weapon slot i.
function layWeaponLabel(i) { return (i < 3 ? 'Right hand ' : 'Left hand ') + (i % 3 + 1); }
// Build the export document ({format:'lid-layouts', version:1, layouts:[...]}) with human-readable extras.
function layExportDoc(list) {
  const named = !!(AP && AP.pts && AP.pts.length);
  const piece = (slot, e) => {
    if (!e) return { slot, empty: true };
    const rec = named && PT_INDEX[e.ptid];
    return rec ? { slot, part: `${rec.name} +${layClampLvl(rec, e.lvl)}`, ptid: e.ptid, lvl: e.lvl } : { slot, ptid: e.ptid, lvl: e.lvl };
  };
  const now = new Date();
  return {
    format: 'lid-layouts',
    version: 1,
    _read_me: [
      'LET IT DIE Offline Editor: fighter layouts (' + list.length + ' layout' + (list.length === 1 ? '' : 's') + ')',
      'Exported ' + now.toLocaleString() + '. Import it on the Layouts tab of the editor.',
      'Fields starting with _ are notes for people, and "slot" / "part" / "empty" are labels: the import ignores them.',
      'Each gear piece is ptid (the part id) + lvl (the in-game +number). Names follow the masters.db loaded when exporting.',
      'weapons: the 6 quick slots in order, Right hand 1-3 then Left hand 1-3. held: which of its 3 slots each hand holds (0 = first).',
      'armor: Head (EQSITE_HEAD), Body (EQSITE_BODY), Legs (EQSITE_LEGS). decals: decal ids, with their names in _decals.'
    ],
    layouts: list.map((l, n) => ({
      _layout: `Layout ${n + 1} of ${list.length}: ${laySummary(l)}`,
      id: l.id,
      name: l.name,
      notes: l.notes,
      weapons: LAY_WEAPON_SLOTS.map(i => piece(layWeaponLabel(i), l.weapons[i])),
      _held: `Right hand holds Right hand ${(l.held[0] || 0) + 1}; left hand holds Left hand ${(l.held[1] || 0) + 1}`,
      held: l.held,
      armor: Object.fromEntries(LAY_ARMOR_SITES.map(s => [ s, piece(LAY_ARMOR_LABEL[s], l.armor[s]) ])),
      _decals: l.decals.map(id => { const r = SKL_INDEX && SKL_INDEX[id]; return r ? r.name + (Number(r.premium) ? ' (Premium)' : '') : id; }),
      decals: l.decals
    }))
  };
}
// JSON with small objects and short lists kept on one line, everything else indented.
function layPretty(v, ind) {
  ind = ind || '';
  const flat = JSON.stringify(v);
  if (v === null || typeof v !== 'object') return flat;
  const kids = Array.isArray(v) ? v : Object.values(v);
  const simple = kids.every(x => x === null || typeof x !== 'object');
  if (!kids.length || (simple && flat.length <= 110 && !(Array.isArray(v) && kids.length > 3 && kids.some(x => typeof x === 'string')))) return Array.isArray(v) ? '[' + v.map(x => JSON.stringify(x)).join(', ') + ']' : !kids.length ? '{}' : '{ ' + Object.keys(v).map(k => JSON.stringify(k) + ': ' + JSON.stringify(v[k])).join(', ') + ' }';
  const next = ind + '  ';
  if (Array.isArray(v)) return '[\r\n' + v.map(x => next + layPretty(x, next)).join(',\r\n') + '\r\n' + ind + ']';
  return '{\r\n' + Object.keys(v).map(k => next + JSON.stringify(k) + ': ' + layPretty(v[k], next)).join(',\r\n') + '\r\n' + ind + '}';
}
// Export layouts as a pretty-printed JSON file.
function layExport(list, file) {
  layDownload(file, layPretty(layExportDoc(list)) + '\r\n');
}
// Import layouts from file text (accepts our export format or a bare array); normalizes, gives clashing ids new
// ones, caps the library at 200 and selects the last one imported.
function layImportText(text) {
  let j;
  try { j = JSON.parse(text); } catch (err) { toast("That file isn't valid JSON", true); return; }
  const src = Array.isArray(j) ? j : (j && j.format === 'lid-layouts' && Array.isArray(j.layouts)) ? j.layouts : null;
  if (!src) { toast("That isn't a layouts file", true); return; }
  const have = new Set(LAY.list.map(l => l.id));
  let n = 0;
  for (const o of src.slice(0, 200)) {
    const l = layNorm(o);
    if (!l) continue;
    if (have.has(l.id)) l.id = layRid();
    have.add(l.id); LAY.list.push(l); n++;
    if (LAY.list.length >= 200) break;
  }
  if (n) { LAY.sel = LAY.list[LAY.list.length - 1].id; laySave(); }
  LAY_UI.report = null;
  toast(n ? `Imported ${n} layout${n === 1 ? '' : 's'}` : 'No layouts found in that file', !n);
  renderLayouts();
}
// Wire all Layouts tab controls (library actions, slot autocompletes, decals, apply options). Edits to a
// layout are saved to localStorage immediately via laySave().
function wireLayoutsUi() {
  const $ = id => document.getElementById(id);
  const L = laySel();
  const redo = () => { LAY_UI.report = null; renderLayouts(); };
  $('lay-new').addEventListener('click', () => { const l = layNew('New layout'); LAY.list.push(l); LAY.sel = l.id; laySave(); redo(); });
  $('lay-dup').addEventListener('click', () => { if (!L) return; const l = layNorm(JSON.parse(JSON.stringify(L))); l.id = layRid(); l.name = layStr(L.name + ' copy', 80); LAY.list.push(l); LAY.sel = l.id; laySave(); redo(); });
  $('lay-del').addEventListener('click', () => { if (!L || !confirm(`Delete the layout "${L.name}"?`)) return; LAY.list = LAY.list.filter(x => x !== L); LAY.sel = LAY.list.length ? LAY.list[0].id : null; laySave(); redo(); });
  $('lay-export').addEventListener('click', () => layExport(LAY.list, 'lid-layouts.json'));
  $('lay-import').addEventListener('click', () => $('lay-import-file').click());
  $('lay-import-file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => layImportText(String(r.result)); r.readAsText(f); e.target.value = ''; });
  document.querySelectorAll('[data-lay-pick]').forEach(el => el.addEventListener('click', () => { LAY.sel = el.dataset.layPick; redo(); }));
  $('lay-cap-fighter').addEventListener('change', e => { LAY_UI.fighter = e.target.value; });
  $('lay-capture').addEventListener('click', () => {
    const c = arr(SAVE.soul.chrs).find(x => x.cid === $('lay-cap-fighter').value);
    if (!c) return;
    const l = layCapture(c);
    LAY.list.push(l); LAY.sel = l.id; laySave(); redo();
    toast(`Saved ${c.name || 'the fighter'}'s loadout as "${l.name}"`);
  });
  if (!L) return;
  $('lay-name').addEventListener('change', e => { L.name = layStr(e.target.value, 80).trim() || 'Layout'; laySave(); redo(); });
  $('lay-notes').addEventListener('change', e => { L.notes = layStr(e.target.value, 400); laySave(); });
  document.querySelectorAll('[data-lay-held]').forEach(el => el.addEventListener('change', () => { const [ hi, i ] = el.dataset.layHeld.split(':').map(Number); L.held[hi] = i; laySave(); LAY_UI.report = null; }));
  // weapon / armor slots
  const slotKeys = LAY_WEAPON_SLOTS.map(i => 'w' + i).concat(LAY_ARMOR_SITES);
  for (const key of slotKeys) {
    const isW = key[0] === 'w' && key.length === 2;
    const ptType = isW ? 'PTTP_ARM' : LAY_ARMOR_TYPE[key];
    const get = () => isW ? L.weapons[Number(key.slice(1))] : L.armor[key];
    const set = v => { if (isW) L.weapons[Number(key.slice(1))] = v; else L.armor[key] = v; };
    wireAutocomplete($('lay-s-' + key), $('lay-d-' + key), 'pt', rec => {
      const lvl = layClampLvl(rec, ($('lay-l-' + key) || {}).value);
      set({ ptid: rec.id, lvl });
      laySave(); redo();
    }, ptType, 'lay-l-' + key, id => !rewardUnfit('pt', id, true));
    $('lay-l-' + key).addEventListener('change', e => {
      const cur = get();
      if (!cur) return;
      cur.lvl = layClampLvl(PT_INDEX[cur.ptid], e.target.value);
      laySave(); redo();
    });
  }
  document.querySelectorAll('[data-lay-clear]').forEach(el => el.addEventListener('click', () => {
    const key = el.dataset.layClear;
    if (key[0] === 'w' && key.length === 2) L.weapons[Number(key.slice(1))] = null; else L.armor[key] = null;
    laySave(); redo();
  }));
  // decals
  wireAutocomplete($('lay-decal-search'), $('lay-decal-drop'), 'skl', rec => {
    if (L.decals.includes(rec.id)) { toast(`"${rec.name}" is already in this layout`, true); return; }
    if (L.decals.length >= 99) { toast('A layout holds up to 99 decals', true); return; }
    L.decals.push(rec.id); laySave(); redo();
  }, null, null, id => !rewardUnfit('skl', id, true));
  document.querySelectorAll('[data-lay-rmdecal]').forEach(el => el.addEventListener('click', () => { L.decals.splice(parseInt(el.dataset.layRmdecal, 10), 1); laySave(); redo(); }));
  // apply
  $('lay-fighter').addEventListener('change', e => { LAY_UI.fighter = e.target.value; redo(); });
  $('lay-gearmode').addEventListener('change', e => { LAY_UI.gearMode = e.target.value; redo(); });
  $('lay-decalmode').addEventListener('change', e => { LAY_UI.decalMode = e.target.value; redo(); });
  $('lay-replace').addEventListener('change', e => { LAY_UI.replaceDecals = e.target.checked; redo(); });
  $('lay-clear').addEventListener('change', e => { LAY_UI.clearEmpty = e.target.checked; redo(); });
  $('lay-ps').addEventListener('change', e => { LAY_UI.includePs = e.target.checked; redo(); });
  $('lay-preview').addEventListener('click', layPreview);
  $('lay-apply').addEventListener('click', layDoApply);
  $('lay-undo').addEventListener('click', layUndo);
}
// ===== end Layouts =====

