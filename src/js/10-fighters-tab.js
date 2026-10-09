// ==== Fighters tab (main block) ====
//
// blockCharacters(): HTML for the Fighters tab: freezer controls, the fighter picker, and the
// collapsible sections Profile / Stats / Equipment / Skill Decals / Fighter Inventory. Computes the
// legal ranges for the selected fighter (fighterRanges) and header summaries first. Also back-fills
// chr.bodylvl if missing. Returns an HTML string (the chosen fighter is chrs[activeCharIdx]).
function blockCharacters() {
  const chrs = SAVE.soul.chrs;
  const FZ = realFreezerInfo();
  const freezerLevel = FZ.level || 1;
  const freezerCap = FZ.slots || freezerCapacity(Math.min(Math.max(freezerLevel, 1), freezerLevels()));
  const atCap = !freeHangers().length;
  const chr = chrs[activeCharIdx] || chrs[0];
  const isCurrent = chr && chr.cid && chr.cid === SAVE.soul.crntcid;
  chr.bodylvl = chr.bodylvl || {
    lvl: chr.lvl || 1,
    hp: 1,
    str: 1,
    dex: 1,
    vit: 1,
    stm: 1,
    luk: 1,
    skill: 0,
    bag: 0
  };
  const type = chr.type || 'BAL';
  const grade = chr.grade != null ? chr.grade : 1;
  const lb = chr.limit_break != null ? chr.limit_break : 0;
  const maxLb = maxLimitBreakFor(type, grade);
  const R = fighterRanges(type, grade, lb);
  const statCap = R.statCap, statFloor = R.statFloor;
  const skillTotal = Math.min(Math.max(R.skillBase + (chr.bodylvl.skill || 0), R.skillFloor), R.skillCap);
  const bagTotal = Math.min(Math.max(R.bagBase + (chr.bodylvl.bag || 0), R.bagFloor), R.bagCap);
  const rageTotal = rageTotalFor(chr, R);
  const rageLocked = R.rageFloor === R.rageCap;
  const modelLock = chr.state === 'ENEMY' ? 'dead: the archive keeps its look' : chr.state === 'DUMMY' ? 'not a real fighter' : chr.abid ? 'kidnapped' : '';
  const combat = combatStatsFor(chr, type, grade);
  // one-line summaries for the section headers and the line under the fighter picker
  const bad = (n, what) => n ? ` · <span class="fsec-bad">${n} ${what}</span>` : '';
  const gearBad = gearProblems(chr).length, invN = fighterItemCount(chr), invCap = deathBagLimit(chr), decN = arr(chr.eqskls).length;
  const statsMaxed = [ 'hp', 'str', 'dex', 'vit', 'stm', 'luk' ].every(k => (chr.bodylvl[k] != null ? chr.bodylvl[k] : statFloor) >= statCap) && skillTotal >= R.skillCap && bagTotal >= R.bagCap && (rageLocked || rageTotal >= R.rageCap);
  const weaponsN = Object.values(chr.armslots || {}).filter(Boolean).length, armorN = arr(chr.eqpts).filter(e => /HEAD|BODY|LEGS/.test(e.site)).length;
  const fsumLine = `<div class="fsumLine"><b>${escapeHtml(chr.name || 'Fighter')}</b> · ${escapeHtml(CLASS_NAMES[type] || type)} · Grade ${grade}${lb ? ' · Limit Break ' + lb : ''} · Lv ${chr.lvl != null ? chr.lvl : 1} · Death Bag ${invN}/${invCap} · Decals ${decN}/${skillTotal}${isCurrent ? ' · <span class="badge current">★ SELECTED FIGHTER</span>' : ''}${bad(gearBad, gearBad === 1 ? 'gear problem' : 'gear problems')}</div>`;
  const profileSum = 'name, class, model, gas mask, grade, limit break';
  const statsSum = (statsMaxed ? 'all at max for this grade / limit break' : `Lv ${chr.lvl != null ? chr.lvl : 1} of ${R.levelMax} max`) + ` · ${skillTotal} decal slots · Death Bag ${bagTotal}`;
  const equipSum = `${weaponsN} weapon${weaponsN === 1 ? '' : 's'} · ${armorN}/3 armor` + bad(gearBad, gearBad === 1 ? "piece the game wouldn't allow" : "pieces the game wouldn't allow");
  const decalSum = `${decN} / ${skillTotal} slots` + (decN > skillTotal ? bad(decN - skillTotal, 'over') : '');
  const invSum = `${invN} / ${invCap} slots` + (vipBagBonus() ? ' (incl. Express Pass)' : '') + (invN > invCap ? bad(invN - invCap, 'over capacity') : '');
  return `<section class="block">\n    <div class="block-head">\n      <div><div class="eyebrow">Fighters</div><h2>Fighter Freezer</h2></div>\n      <div style="display:flex; gap:6px; align-items:center;">\n        <span style="font-size:11px; color:var(--text-dim);">${FZ.slots} hangers · ${freeHangers().length} empty</span>\n        <select id="new-char-body" ${atCap ? 'disabled' : ''} title="Body for the new fighter" style="background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:4px 6px; font-family:var(--mono); font-size:11.5px;">${arr(AP && AP.bodies).map(b => `<option value="${b.id}">${b.gender === 'GENDER_MALE' ? 'Male' : 'Female'} ${String(b.id).slice(-1)}</option>`).join('')}</select>\n        <button class="subtle" id="btn-max-all-chars" title="Every freezer fighter to Grade 6, Limit Break 4, with stats, decal slots, Death Bag and rage at the maximum. Skips dead, kidnapped and placeholder fighters and the one in a run.">${MAX_ALL_ARMED ? 'Click again to max all' : 'Max all fighters'}</button>\n        <button class="subtle" id="btn-add-char" ${atCap ? 'disabled title="No empty hanger in the freezer."' : 'title="Adds a fighter the same way the Fighter Depot does, into the first empty hanger."'}>+ Add Fighter</button>\n        <button class="subtle" id="btn-del-char" ${fighterDeleteBlock(chr) ? `disabled title="${escapeHtml(fighterDeleteBlock(chr))}"` : 'title="Delete the selected fighter, the way the game does"'}>Delete ${escapeHtml(chr ? chr.name || 'fighter' : 'fighter')}</button>\n      </div>\n    </div>\n    <div class="block-body">\n      <div class="grid" style="margin-bottom:12px;">\n        <div class="field"><label>Freezer Level</label><select id="freezer-level" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">${FZ.level == null ? `<option selected>? (${FZ.slots} hangers)</option>` : ''}${arr(AP && AP.freezer).map(r => `<option value="${r.number}" ${r.number === FZ.level ? 'selected' : ''}>Level ${r.number} (${r.count} hangers)</option>`).join('')}</select></div>\n        <div class="field" style="display:flex; align-items:end;"><button class="subtle" id="freezer-max" ${FZ.slots >= FZ.max ? 'disabled' : ''}>Max (${FZ.max} hangers)</button></div>\n      </div>\n      ${howTo(`Your freezer has ${FZ.slots} hangers, ${freeHangers().length} empty.${atCap ? ' Every hanger is in use.' : ''}`, `${atCap ? 'Every hanger is in use, so a fighter can\'t be added. ' : 'New fighters are added the way the Fighter Depot adds them: grade 1 All-rounder at level 1, into the first empty hanger. Change their class, grade and stats below after adding. '}Raising the freezer level adds empty hangers; it can only go down if the hangers it removes are empty.`)}\n      <div class="charTabs">\n        ${chrs.map((c, i) => `<div class="charTab ${i === activeCharIdx ? 'active' : ''}" data-char-idx="${i}">${c.cid === SAVE.soul.crntcid ? '★ ' : ''}${c.state === 'ENEMY' ? '☠ ' : ''}${escapeHtml(c.name || '#' + i)} · Lv${c.lvl != null ? c.lvl : '?'}</div>`).join('')}\n      </div>\n      ${fighterDeleteBlock(chr) ? `<div class="capNote" id="del-why" style="margin:-4px 0 10px; font-size:12px;">Delete is off for ${escapeHtml(chr.name || 'this fighter')}: ${escapeHtml(fighterDeleteBlock(chr))}</div>` : ''}\n      ${fsumLine}\n      ${fsec('profile', 'Profile', profileSum, `<div class="grid" style="margin-bottom:10px;">\n        <div class="field"><label>Name</label><input type="text" id="chr-name" value="${escapeHtml(chr.name || '')}"></div>\n        <div class="field"><label>Class</label>\n          <select id="chr-type" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">\n            ${Object.keys(CLASS_NAMES).filter(k => k !== 'OLD').map(k => `<option value="${k}" ${k === type ? 'selected' : ''}>${CLASS_NAMES[k]}</option>`).join('')}\n          </select>\n        </div>\n        <div class="field"><label>Model${modelLock ? ' <span class="id">(' + modelLock + ')</span>' : ''}</label><select id="chr-body" ${modelLock ? 'disabled' : ''} style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">${arr(AP && AP.bodies).map(b => `<option value="${b.id}" ${b.id === chr.body ? 'selected' : ''}>${bodyLabel(b.id)}</option>`).join('')}${arr(AP && AP.bodies).some(b => b.id === chr.body) ? '' : `<option selected>${escapeHtml(chr.body || '?')}</option>`}</select></div>
        <div class="field"><label>Gas mask</label><select id="chr-gasmask" ${modelLock ? 'disabled' : ''} style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">${arr(AP && AP.gasmasks).filter(m => m.gender === bodyGender(chr.body)).map(m => `<option value="${m.id}" ${m.id === chr.gasmask ? 'selected' : ''}>Gas mask ${Number(String(m.id).slice(-3))}</option>`).join('')}${arr(AP && AP.gasmasks).some(m => m.id === chr.gasmask && m.gender === bodyGender(chr.body)) ? '' : `<option selected>${escapeHtml(chr.gasmask || '—')}</option>`}</select></div>
        <div class="field"><label>Grade</label><select id="chr-grade" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">${fighterOpts(1, gradeMax(), grade, v => 'Grade ' + v)}</select></div>\n        <div class="field"><label>Limit Break${maxLb < 4 ? ` <span class="id">(grade ${grade} goes up to ${maxLb})</span>` : ''}</label><select id="chr-lb" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">${fighterOpts(0, maxLb, lb, v => v ? 'Limit Break ' + v : 'None')}</select></div>\n        <div class="field"><label>Level (from stats)</label><div id="chr-lvl" style="padding:8px 0; font-size:14px;"><b>Lv ${chr.lvl != null ? chr.lvl : 1}</b> <span class="id">of ${R.levelMax} max</span></div></div>\n      </div>\n      ${chr.state === 'ENEMY' ? fighterDeadNote(chr) : ''}`)}\n      ${fsec('stats', 'Stats', statsSum, `<div class="toolbar" style="margin:6px 0 8px;"><button class="subtle" id="stat-max">Max all for this grade/limit break</button></div>\n      <div class="grid" style="margin-bottom:8px;">\n        ${[ 'hp', 'str', 'dex', 'vit', 'stm', 'luk' ].map(k => `\n          ${fighterStatField(k.toUpperCase(), k, statFloor, statCap, Math.min(Math.max(chr.bodylvl[k] != null ? chr.bodylvl[k] : statFloor, statFloor), statCap), null)}`).join('')}\n        ${fighterStatField('Decal Slots', 'skill', R.skillFloor, R.skillCap, skillTotal, R.skillBase)}\n        ${fighterStatField('Death Bag', 'bag', R.bagFloor, R.bagCap, bagTotal, R.bagBase)}\n        ${rageLocked ? `<div class="field"><label>Rage Bars</label><div id="chr-rage" style="padding:8px 0; font-size:14px;"><b>${R.rageCap}</b> <span class="id">fixed for this class and grade</span></div></div>` : fighterStatField('Rage Bars', 'rage', R.rageFloor, R.rageCap, rageTotal, R.rageBase)}\n      </div>\n      ${combat ? `<div class="listBlock" style="margin-bottom:16px;"><div class="listRow"><div class="name">Combat stats</div></div>\n        <div class="listRow"><div class="name">${combat}</div></div></div>` : ''}`)}\n      ${fsec('equip', 'Equipment', equipSum, `\n      ${equipEditor(chr)}`)}\n      ${fsec('decals', 'Skill Decals', decalSum, `${arr(chr.eqskls).length > skillTotal ? `<div class="warnNote">More decals equipped than this fighter has slots (${skillTotal}). Remove some or raise Decal Slots above.</div>` : ''}\n      <div class="searchwrap">\n        <input type="text" id="skill-search" placeholder="Search skill decal name, e.g. &quot;Living on the Edge&quot;...">\n        <div class="acdrop" id="skill-acdrop"></div>\n      </div>\n      <div class="chipRow" id="skill-chips">\n        ${arr(chr.eqskls).map((s, i) => skillChip(s, i)).join('')}\n      </div>`)}\n      ${fsec('inv', 'Fighter Inventory', invSum, `<div class="toolbar" style="margin:6px 0 8px;"><span class="capNote" style="margin:0;">Everything in the Death Bag, equipped gear included.</span><button class="subtle" id="fi-refresh-all" title="Durability to 100% and ammo full on every weapon and armor this fighter carries, equipped gear included">Repair &amp; refill all</button><button class="subtle" id="fi-clear-all">Clear all</button></div>\n      ${fighterItemCount(chr) > deathBagLimit(chr) ? `<div class="warnNote">Over this fighter's Death Bag capacity (${deathBagLimit(chr)}${vipBagBonus() ? ', incl. Express Pass' : ''}). Remove items or raise Death Bag above.</div>` : ''}\n      <div class="subTabs" id="fi-cat-tabs">\n        <div class="subTab active" data-fi-cat="pt">Weapon/Armor</div>\n        <div class="subTab" data-fi-cat="bp">Blueprint</div>\n        <div class="subTab" data-fi-cat="msr">Mushroom</div>\n        <div class="subTab" data-fi-cat="bst">Beast</div>\n        <div class="subTab" data-fi-cat="item">Material / Other</div>\n      </div>\n      <div id="fi-add-form"></div>\n      <div class="listBlock" id="fi-list">\n        ${fighterInventoryRows(chr).join('') || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">Empty.</div>'}\n      </div>`)}\n    </div>\n  </section>`;
}

// combatStatsFor(): "HP x · STM y · ..." text of real stat values for the fighter's current stat levels
// (from bodylvlsts); '' if the master data has no rows.
function combatStatsFor(chr, type, grade) {
  const bl = chr.bodylvl || {};
  const parts = [];
  for (const [k, label] of [ [ 'hp', 'HP' ], [ 'stm', 'STM' ], [ 'str', 'STR' ], [ 'dex', 'DEX' ], [ 'vit', 'VIT' ], [ 'luk', 'LUK' ] ]) {
    const row = (AP.bodylvlsts || []).find(r => r.type === type && r.grade === grade && r.lvl === (bl[k] || 1));
    if (row && row[k] != null) parts.push(`${label} ${Number(row[k]).toLocaleString()}`);
  }
  return parts.length ? parts.join(' · ') : '';
}

// fighterInventoryRows(): HTML rows for the Death Bag list. Equipped gear is shown with a badge and
// no remove button; everything else gets a remove button (data-fi-remove="cat:index").
function fighterInventoryRows(chr) {
  const rows = [];
  const equippedEptids = new Set(arr(chr.eqpts).map(e => e.eptid).concat(Object.values(chr.armslots || {})));
  arr(chr.pspts).forEach((p, i) => {
    const rec = PT_INDEX[p.ptid];
    if (equippedEptids.has(p.eptid)) {
      rows.push(`<div class="listRow fiRow"><div class="name">${escapeHtml(rec ? rec.name : p.ptid)}${rec ? ` · +${displayFromRaw(rec, p.lvl)}` : ''}</div><span class="badge current">${arr(chr.eqpts).some(e => e.eptid === p.eptid) ? 'EQUIPPED' : 'WEAPON SLOT'}</span></div>`);
      return;
    }
    const name = rec ? rec.name : p.ptid;
    const pct = rec ? durabilityPct(p, rec) : null;
    const sub = rec ? ` · +${displayFromRaw(rec, p.lvl)} · durability ${pct != null ? pct + '%' : '?'}${ammoText(p, rec)}` : '';
    rows.push(`<div class="listRow fiRow"><div class="name">${escapeHtml(name)}${sub}</div><button class="subtle" data-fi-remove="pt:${i}">✕</button></div>`);
  });
  arr(chr.psmsrs).forEach((m, i) => rows.push(`<div class="listRow fiRow"><div class="name">${escapeHtml(msrDisplayName(m.msrid, m.cooked))}</div><button class="subtle" data-fi-remove="msr:${i}">✕</button></div>`));
  arr(chr.psbsts).forEach((b, i) => rows.push(`<div class="listRow fiRow"><div class="name">${escapeHtml(bstDisplayName(b.bstid, b.cooked))}</div><button class="subtle" data-fi-remove="bst:${i}">✕</button></div>`));
  arr(chr.psitems).forEach((it, i) => rows.push(`<div class="listRow fiRow"><div class="name">${escapeHtml(itemDisplayName(it.itemId))}</div><button class="subtle" data-fi-remove="item:${i}">✕</button></div>`));
  return rows;
}

// FLOOR_NAME_CACHE: cache object for floor display names (not referenced within this range).
const FLOOR_NAME_CACHE = {};

// equipViewRow(): read-only HTML row showing what's equipped in one slot.
function equipViewRow(chr, slot) {
  const eq = arr(chr.eqpts).find(e => e.site === slot.site);
  const inst = eq ? arr(chr.pspts).find(p => p.eptid === eq.eptid) : null;
  const rec = inst ? PT_INDEX[inst.ptid] : null;
  const name = rec ? rec.name : inst ? inst.ptid : null;
  return `<div class="eqRow">\n    <div class="slotname">${slot.label}</div>\n    <div class="${name ? '' : 'empty'}">${name ? escapeHtml(name) : 'Nothing equipped'}</div>\n    <div>${rec ? `<span class="badge ${rec.is_limitbreak ? 'lb' : ''}">+${displayFromRaw(rec, inst.lvl)}</span>` : ''}</div>\n  </div>`;
}

// ==== Equipment rules and editing ====

// ---- Equipped gear editing -------------------------------------------------
// From real saves: every weapon a fighter has in a quick slot has arm_slot
// 0-2 (right hand) or 3-5 (left hand) on its death bag entry; the one being
// held in each hand also has site EQSITE_ARMR / EQSITE_ARML. Armor has site
// EQSITE_HEAD / BODY / LEGS and arm_slot -1. chr.select_arm_slots is
// "right,left" (the quick slot index 0-2 held in each hand; "" = never
// changed). The site entries are what decides what's held.
// HAND_SITES: the two hand sites. base = first arm_slot index of that hand (0-2 right, 3-5 left);
// sel = position inside chr.select_arm_slots ("right,left").
const HAND_SITES = [ { site: 'EQSITE_ARMR', label: 'Right hand', base: 0, sel: 0 }, { site: 'EQSITE_ARML', label: 'Left hand', base: 3, sel: 1 } ];
// ptTypeOk(): true if the part record's type is allowed in this slot (slot.ptType may be a string or array).
function ptTypeOk(slot, rec) {
  const t = Array.isArray(slot.ptType) ? slot.ptType : [ slot.ptType ];
  return !!rec && t.includes(rec.type);
}
// gearLabel(): "Name +N (durability%)" for a part instance, used in the equipment dropdowns.
function gearLabel(p) {
  const rec = PT_INDEX[p.ptid];
  if (!rec) return p.ptid;
  const pct = durabilityPct(p, rec);
  return `${rec.name} +${displayFromRaw(rec, p.lvl)}${pct != null ? ` (${pct}%)` : ''}`;
}
// heldIndex(chr, hand): which of the 3 quick slots (0-2) the hand holds. Prefers the weapon actually in
// eqpts for that hand site, else select_arm_slots, else 0.
function heldIndex(chr, hand) {
  const eq = arr(chr.eqpts).find(e => e.site === hand.site);
  if (eq && chr.armslots) for (let i = 0; i < 3; i++) if (chr.armslots[hand.base + i] === eq.eptid) return i;
  const sel = String(chr.select_arm_slots || '').split(',').map(n => parseInt(n, 10));
  const v = sel[hand.sel];
  return v >= 0 && v <= 2 ? v : 0;
}
// syncHeldWeapons(): rewrite the two hand-site eqpts entries from chr.armslots and the held indexes
// (held[0] right, held[1] left). arm_slot = base + index.
function syncHeldWeapons(chr, held) {
  chr.eqpts = arr(chr.eqpts).filter(e => e.site !== 'EQSITE_ARMR' && e.site !== 'EQSITE_ARML');
  for (const hand of HAND_SITES) {
    const eid = chr.armslots[hand.base + held[hand.sel]];
    if (eid) chr.eqpts.push({ site: hand.site, eptid: eid, arm_slot: hand.base + held[hand.sel] });
  }
}
// What a fighter is allowed to equip. The game only lets a fighter equip a
// part in its own slot type, and only when the fighter's stat meets the
// part's requirement (master_part.lvllmttp / lvllmt, e.g. STR 100, raised for
// upgraded parts, see gearRequirement). The stat
// value is master_bodylvl_status_value for the fighter's class, grade and
// stat level. Checked against every weapon/armor fighters wear in the sample
// saves (379 of 381 pass; the 2 exceptions were an edited save). Hand items
// that aren't real weapons (first aid, food, sand), the "no mask / pants"
// placeholders, gas masks and broken parts are never offered.
// GEAR_SITE_TYPES: equipment site -> part types allowed there.
const GEAR_SITE_TYPES = { EQSITE_ARMR: [ 'PTTP_ARM' ], EQSITE_ARML: [ 'PTTP_ARM' ], EQSITE_HEAD: [ 'PTTP_HEAD' ], EQSITE_BODY: [ 'PTTP_BODY' ], EQSITE_LEGS: [ 'PTTP_LEGS' ] };
// PT_GAS_HEAD_* are real head gear (M42 Gas Mask, Surgical Mask, ... and their N versions), not the
// fighter's built-in gas mask (that's chr.gasmask, an ASSET_ id), so they're allowed.
// GEAR_NEVER: part ids never offered for equipping (hand items that aren't weapons, placeholder none/mask/pants parts).
const GEAR_NEVER = /^PT_(ARM_(FirstAid|Food|Sand)$|NONE_|MASK_|PANTS_)/;
// fighterStatValue(): the fighter's real value of one stat (e.g. 'STR') from bodylvlsts at their stat level; null if unknown.
function fighterStatValue(chr, stat) {
  const k = String(stat || '').toLowerCase();
  const lvl = (chr.bodylvl || {})[k] || 1;
  const type = chr.type || 'BAL', grade = chr.grade != null ? chr.grade : 1;
  const row = (AP && AP.bodylvlsts || []).find(r => r.type === type && r.grade === grade && r.lvl === lvl);
  return row && row[k] != null ? Number(row[k]) : null;
}
// Requirement grows with the part's upgrade level: lvllmt × lvllmt_c^(lvl − 1)
// (lvllmt_c is 1.01-1.02). Confirmed by the user in game; the saves rule out
// scaling from lvl 0 (a +0 part at exactly its base requirement is worn).
// gearRequirement(): stat needed to equip a part at raw level `lvl` (floored at 1): lvllmt * lvllmt_c^(lvl-1). Unrounded.
function gearRequirement(rec, lvl) {
  const base = Number(rec.lvllmt) || 0, c = Number(rec.lvllmt_c) || 1;
  return base * Math.pow(c, Math.max(1, Number(lvl) || 1) - 1);
}
// Decals that lower equip requirements (master_skill type + value, text from
// the game's own decal descriptions):
//   SKLTP_DISCOUNT_<STAT>      "Halves the <STAT> necessary to equip"   val0 = 50 (%)
//   SKLTP_DISCOUNT_ALL         "All stat requirements … become #0%"      val0 = 80
//   SKLTP_DISCOUNT_ALL_NMH     JEANE: "all equip requirements to #0%"    val0 = 90
//   SKLTP_DISALL_ATKUP_HPDWN   "all stats required … become #1%"         val1 = 80
// How they combine, from the user's in-game numbers for a KAMAS-A1 Assault
// Rifle RE +4 (DEX 27 with no decals):
//   Dexterity Discount alone → 13, both Dexterity Discounts → 0,
//   Everything's On Sale alone → 21, One Way Ticket alone → 21,
//   one Dexterity Discount + Everything's On Sale + One Way Ticket → 2.
// Every equipped decal's reduction ADDS (50 + 50 = 100% off → 0;
// 50 + 20 + 20 = 90% off → 2.7), never below 0, and the requirement is
// rounded down. Only decals equipped on the fighter count.
// gearDiscountPct(): percent of the requirement left after equipped decals (100 = no discount, min 0).
// Each relevant decal contributes (100 - value) points of discount; contributions add up.
function gearDiscountPct(chr, stat) {
  const st = String(stat || '').toUpperCase();
  let off = 0;
  for (const e of arr(chr.eqskls)) {
    const rec = SKL_INDEX[e.id || e.sklid];
    if (!rec) continue;
    let v = null;
    if (rec.type === 'SKLTP_DISCOUNT_' + st) v = rec.val0;
    else if (rec.type === 'SKLTP_DISCOUNT_ALL' || rec.type === 'SKLTP_DISCOUNT_ALL_NMH') v = rec.val0;
    else if (rec.type === 'SKLTP_DISALL_ATKUP_HPDWN') v = rec.val1;
    v = Number(v);
    if (v > 0 && v < 100) off += 100 - v;
  }
  return Math.max(0, 100 - off);
}
// gearProblem(chr, p, site): why part instance p can't go in `site` for this fighter, or null if legal.
// Checks: instance exists, known part, slot type, equippable/not consumable, not broken (dur<=0),
// and the stat requirement (rounded down after decal discounts) against the fighter's stat.
function gearProblem(chr, p, site) {
  if (!p) return "the item isn't in the fighter's Death Bag";
  const rec = PT_INDEX[p.ptid];
  if (!rec) return "unknown part (not in this masters.db)";
  if (!(GEAR_SITE_TYPES[site] || []).includes(rec.type)) return "wrong slot for this part";
  if (GEAR_NEVER.test(rec.id) || Number(rec.is_consume) === 1) return "not equippable";
  if (p.dur != null && Number(p.dur) <= 0) return "broken";
  const stat = rec.lvllmttp, pct = stat ? gearDiscountPct(chr, stat) : 100;
  // the game shows (and checks) the requirement rounded down
  const need = Math.floor(gearRequirement(rec, p.lvl) * pct / 100 + 1e-9);
  if (stat && need > 0) {
    const have = fighterStatValue(chr, stat);
    const note = pct < 100 ? ` with decals (${100 - pct}% off)` : '';
    if (have == null) return `needs ${stat} ${need}${note} (couldn't read this fighter's ${stat})`;
    if (have < need) return `needs ${stat} ${need}${note}, has ${have}`;
  }
  return null;
}
// gearProblems(): all illegal equipped items: [{eid, site, why}] for eqpts, plus weapons only sitting
// in quick slots (armslots) that wouldn't be allowed (site '' with their slot number).
function gearProblems(chr) {
  const out = [];
  const byEid = {};
  for (const p of arr(chr.pspts)) byEid[p.eptid] = p;
  for (const e of arr(chr.eqpts)) {
    const why = gearProblem(chr, byEid[e.eptid], e.site);
    if (why) out.push({ eid: e.eptid, site: e.site, why });
  }
  for (const [k, eid] of Object.entries(chr.armslots || {})) {
    if (!eid || arr(chr.eqpts).some(e => e.eptid === eid)) continue;
    const why = gearProblem(chr, byEid[eid], Number(k) < 3 ? 'EQSITE_ARMR' : 'EQSITE_ARML');
    if (why) out.push({ eid, site: '', slot: Number(k), why });
  }
  return out;
}
// unequipProblemGear(): remove every gearProblems() item from armslots and eqpts. Returns how many.
function unequipProblemGear(chr) {
  const bad = gearProblems(chr);
  for (const b of bad) {
    for (const k of Object.keys(chr.armslots || {})) if (chr.armslots[k] === b.eid) delete chr.armslots[k];
    chr.eqpts = arr(chr.eqpts).filter(e => e.eptid !== b.eid);
  }
  return bad.length;
}
// setWeaponSlot(): put a weapon in (or clear) quick slot armSlot (0-5). A weapon occupies only one slot.
// Returns false (with a toast) if illegal. Preserves which weapon is held in each hand.
function setWeaponSlot(chr, armSlot, eptid) {
  if (eptid) {
    const p = arr(chr.pspts).find(x => x.eptid === eptid);
    const why = gearProblem(chr, p, armSlot < 3 ? 'EQSITE_ARMR' : 'EQSITE_ARML');
    if (why) { toast(`Can't equip that: ${why}`, true); return false; }
  }
  chr.armslots = chr.armslots || {};
  const held = HAND_SITES.map(h => heldIndex(chr, h));
  for (const k of Object.keys(chr.armslots)) if (chr.armslots[k] === eptid) delete chr.armslots[k];
  if (eptid) chr.armslots[armSlot] = eptid; else delete chr.armslots[armSlot];
  syncHeldWeapons(chr, held);
}
// setHeldSlot(): choose which quick slot (0-2) of a hand is held; stores select_arm_slots "right,left".
function setHeldSlot(chr, handIdx, idx) {
  chr.armslots = chr.armslots || {};
  const held = HAND_SITES.map(h => heldIndex(chr, h));
  held[handIdx] = idx;
  chr.select_arm_slots = `${held[0]},${held[1]}`;
  syncHeldWeapons(chr, held);
}
// setArmor(): equip an armor part at a head/body/legs site (arm_slot -1), replacing the previous one. Returns false if illegal.
function setArmor(chr, site, eptid) {
  if (eptid) {
    const why = gearProblem(chr, arr(chr.pspts).find(x => x.eptid === eptid), site);
    if (why) { toast(`Can't equip that: ${why}`, true); return false; }
  }
  chr.eqpts = arr(chr.eqpts).filter(e => e.site !== site && e.eptid !== eptid);
  if (eptid) chr.eqpts.push({ site, eptid, arm_slot: -1 });
}
// equipEditor(): HTML for the Equipment section (weapon slots and armor dropdowns, with disabled options and a warning for illegal gear).
// Ensures chr.armslots exists (quick slot index -> eptid).
function equipEditor(chr) {
  if (!chr.armslots) chr.armslots = {};
  const weapons = arr(chr.pspts).filter(p => (PT_INDEX[p.ptid] || {}).type === 'PTTP_ARM');
  const sel = (cur, list, attr, site) => `<select ${attr} style="width:100%; background:var(--bg); border:1px solid ${cur && gearProblem(chr, list.find(p => p.eptid === cur), site) ? 'var(--bad, #c33)' : 'var(--panel-border)'}; color:var(--text); padding:5px 6px; font-family:var(--mono); font-size:11.5px;">
      <option value="">— empty —</option>${list.map(p => { const why = gearProblem(chr, p, site); return `<option value="${escapeHtml(p.eptid)}" ${p.eptid === cur ? 'selected' : ''} ${why && p.eptid !== cur ? 'disabled' : ''}>${escapeHtml(gearLabel(p))}${why ? ` — ✕ ${escapeHtml(why)}` : ''}</option>`; }).join('')}</select>`;
  let h = '<div class="grid" style="margin-bottom:6px; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));">';
  HAND_SITES.forEach((hand, hi) => {
    const held = heldIndex(chr, hand);
    h += `<div class="field"><label>${hand.label} (weapon slots)</label>`;
    for (let i = 0; i < 3; i++) {
      const as = hand.base + i;
      h += `<div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
        <label style="display:flex; align-items:center; gap:3px; font-size:11px; white-space:nowrap; text-transform:none; letter-spacing:0;" title="The weapon held in this hand"><input type="radio" name="held-${hi}" data-eq-held="${hi}:${i}" ${held === i ? 'checked' : ''}> in hand</label>
        ${sel(chr.armslots[as] || '', weapons, `data-eq-arm="${as}"`, hand.site)}</div>`;
    }
    h += '</div>';
  });
  h += '</div><div class="grid" style="margin-bottom:6px; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));">';
  for (const slot of SLOT_TYPES.filter(s => s.site !== 'EQSITE_ARMR' && s.site !== 'EQSITE_ARML')) {
    const cur = (arr(chr.eqpts).find(e => e.site === slot.site) || {}).eptid || '';
    const list = arr(chr.pspts).filter(p => ptTypeOk(slot, PT_INDEX[p.ptid]) && (p.eptid === cur || !GEAR_NEVER.test(p.ptid)));
    h += `<div class="field"><label>${slot.label}</label>${sel(cur, list, `data-eq-armor="${slot.site}"`, slot.site)}</div>`;
  }
  const bad = gearProblems(chr);
  if (bad.length) h += `</div><div class="warnNote" style="display:flex; gap:10px; align-items:center;"><div style="flex:1;">${escapeHtml(chr.name || 'This fighter')} has ${bad.length} piece${bad.length === 1 ? '' : 's'} of gear the game wouldn't let them equip: ${bad.map(b => escapeHtml(gearLabel(arr(chr.pspts).find(p => p.eptid === b.eid) || { ptid: '?' })) + ' (' + escapeHtml(b.why) + ')').join('; ')}.</div><button class="subtle" id="eq-unequip-bad">Unequip ${bad.length === 1 ? 'it' : 'them'}</button>`;
  h += '</div>' + howTo('Only gear this fighter can wear is offered; greyed-out entries say why.', 'Pick from the gear this fighter is carrying (add gear to the Fighter Inventory below first). Only gear this fighter can use is offered: the right slot type, not broken, and the fighter\'s stat meets the part\'s requirement, which rises with each upgrade and is lowered by requirement decals like Strength Discount or Everything\'s On Sale equipped on this fighter (greyed-out entries show why). Each hand has 3 weapon slots; the ticked one is the weapon in hand. A weapon can only be in one slot.');
  return h;
}
// wireEquipEditor(): listeners for weapon slot, held radio, armor selects, and the Unequip-problem-gear button.
function wireEquipEditor(chr) {
  document.querySelectorAll('[data-eq-arm]').forEach(el => el.addEventListener('change', () => { setWeaponSlot(chr, Number(el.dataset.eqArm), el.value || null); renderAll(); }));
  document.querySelectorAll('[data-eq-held]').forEach(el => el.addEventListener('change', () => { const [hi, i] = el.dataset.eqHeld.split(':').map(Number); setHeldSlot(chr, hi, i); renderAll(); }));
  document.querySelectorAll('[data-eq-armor]').forEach(el => el.addEventListener('change', () => { setArmor(chr, el.dataset.eqArmor, el.value || null); renderAll(); }));
  const ub = document.getElementById('eq-unequip-bad');
  if (ub) ub.addEventListener('click', () => { const n = unequipProblemGear(chr); runSaveCheck(); renderAll(); toast(`Unequipped ${n} item${n === 1 ? '' : 's'}`); });
}

// skillChip(): HTML chip for one equipped decal with a remove button (data-remove-skill = index).
function skillChip(s, i) {
  const rec = SKL_INDEX[s.id || s.sklid];
  return `<div class="chip">${rec ? escapeHtml(rec.name) : escapeHtml(s.id || s.sklid || '?')}<button data-remove-skill="${i}">✕</button></div>`;
}

// escapeHtml(): escape & < > " ' for safe insertion into HTML; null/undefined become ''.
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// ==== Fighters tab wiring ====
//
// wireCharacters(): attaches all Fighters-tab listeners: freezer level/max, recover, delete (with confirm),
// max-all (two clicks within 6 s), add fighter, picker, profile fields, stat selects, inventory add/remove,
// repair/refill, clear-all, and decal search. Most handlers mutate SAVE, call runSaveCheck(), then renderAll().
// It acts on the fighter chrs[activeCharIdx] captured at wire time.
function wireCharacters() {
  document.getElementById('freezer-level').addEventListener('change', e => {
    const lvl = parseInt(e.target.value, 10);
    if (!lvl) return;
    const err = setFreezerLevel(lvl);
    if (err) toast(err, true); else toast(`Freezer set to level ${lvl} (${realFreezerInfo().slots} hangers)`);
    runSaveCheck();
    renderAll();
  });
  document.getElementById('freezer-max').addEventListener('click', () => {
    const top = Math.max(...arr(AP && AP.freezer).map(r => r.number));
    const err = setFreezerLevel(top);
    if (err) toast(err, true); else toast(`Freezer maxed (${realFreezerInfo().slots} hangers)`);
    runSaveCheck();
    renderAll();
  });
  const recBtn = document.getElementById('btn-recover-char');
  if (recBtn) recBtn.addEventListener('click', () => {
    const c = SAVE.soul.chrs[activeCharIdx] || SAVE.soul.chrs[0];
    if (!recoverFighter(c)) return;
    runSaveCheck();
    renderAll();
    toast(`Recovered ${c.name || 'the fighter'}. Download the .sav to keep it.`);
  });
  const delBtn = document.getElementById('btn-del-char');
  if (delBtn) delBtn.addEventListener('click', () => {
    const c = SAVE.soul.chrs[activeCharIdx] || SAVE.soul.chrs[0];
    const why = fighterDeleteBlock(c);
    if (why) { toast(why, true); return; }
    const n = fighterItemCount(c) + arr(c.eqskls).length;
    if (!confirm(`Delete ${c.name || 'this fighter'}?\n\nLike the game's own delete, everything they carry is deleted too (${fighterItemCount(c)} item${fighterItemCount(c) === 1 ? '' : 's'}), premium decals go back to your decal stock, normal decals are lost, and their hanger becomes empty. You can undo by reloading the save before you download.`)) return;
    deleteFighter(c);
    runSaveCheck();
    renderAll();
    toast(`Deleted ${c.name || 'the fighter'}`);
  });
  const maxAllBtn = document.getElementById('btn-max-all-chars');
  if (maxAllBtn) maxAllBtn.addEventListener('click', () => {
    // first click arms the button for 6 seconds; a second click performs the action
    if (!MAX_ALL_ARMED) { MAX_ALL_ARMED = true; renderAll(); setTimeout(() => { if (MAX_ALL_ARMED) { MAX_ALL_ARMED = false; renderAll(); } }, 6000); return; }
    MAX_ALL_ARMED = false;
    const r = maxAllFighters();
    runSaveCheck();
    renderAll();
    toast(`Maxed ${r.done.length} fighter${r.done.length === 1 ? '' : 's'} (Grade 6, Limit Break 4, all stats)${r.skipped.length ? '. Skipped: ' + r.skipped.join(', ') : ''}`);
  });
  const addBtn = document.getElementById('btn-add-char');
  addBtn.addEventListener('click', () => {
    const body = (document.getElementById('new-char-body') || {}).value;
    const c = addFighterToFreezer('New Fighter', body);
    if (!c) { toast('No empty hanger in the freezer', true); return; }
    activeCharIdx = SAVE.soul.chrs.indexOf(c);
    runSaveCheck();
    renderAll();
    toast('Added a new fighter to the freezer. Rename and set it up below.');
  });
  document.querySelectorAll('[data-char-idx]').forEach(el => {
    el.addEventListener('click', () => {
      activeCharIdx = parseInt(el.dataset.charIdx, 10);
      renderAll();
    });
  });
  const chr = SAVE.soul.chrs[activeCharIdx] || SAVE.soul.chrs[0];
  document.getElementById('chr-name').addEventListener('change', e => {
    chr.name = cleanFighterName(e.target.value) || chr.name;
    renderAll();
  });
  document.getElementById('chr-type').addEventListener('change', e => {
    const before = fighterTotals(chr);
    chr.type = e.target.value;
    clampStatLevelAndRecalc(chr);
    renderAll();
    const note = fighterFitNote(before, chr);
    if (note) toast(note);
  });
  document.getElementById('chr-body').addEventListener('change', e => {
    const before = bodyLabel(chr.body);
    setFighterBody(chr, e.target.value);
    renderAll();
    toast(`${chr.name || 'Fighter'}: ${before} → ${bodyLabel(chr.body)}`);
  });
  document.getElementById('chr-gasmask').addEventListener('change', e => {
    chr.gasmask = e.target.value;
    renderAll();
    toast(`${chr.name || 'Fighter'}: gas mask ${Number(String(chr.gasmask).slice(-3))}`);
  });
  document.getElementById('chr-grade').addEventListener('change', e => {
    const before = fighterTotals(chr);
    chr.grade = Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), gradeMax());
    clampStatLevelAndRecalc(chr);
    renderAll();
    const note = fighterFitNote(before, chr);
    toast(`Grade ${chr.grade}` + (note ? '. ' + note : ''));
  });
  document.getElementById('chr-lb').addEventListener('change', e => {
    const before = fighterTotals(chr);
    const maxLb = maxLimitBreakFor(chr.type || 'BAL', chr.grade != null ? chr.grade : 1);
    chr.limit_break = Math.min(Math.max(parseInt(e.target.value, 10) || 0, 0), maxLb);
    clampStatLevelAndRecalc(chr);
    renderAll();
    const note = fighterFitNote(before, chr);
    toast(`Limit Break ${chr.limit_break}` + (note ? '. ' + note : ''));
  });
  document.querySelectorAll('.chr-stat').forEach(inp => {
    inp.addEventListener('change', () => {
      chr.bodylvl = chr.bodylvl || {};
      let v = parseInt(inp.value, 10) || 0;
      const floorAttr = inp.getAttribute('data-floor'), capAttr = inp.getAttribute('data-cap');
      if (capAttr && v > parseInt(capAttr, 10)) {
        v = parseInt(capAttr, 10);
        toast(`Clamped to this grade/limit break's max (${v})`);
      }
      if (floorAttr && v < parseInt(floorAttr, 10)) {
        v = parseInt(floorAttr, 10);
        toast(`Clamped to this grade/limit break's minimum (${v})`);
      }
      inp.value = v;
      const baseAttr = inp.getAttribute('data-base');
      if (inp.dataset.stat === 'rage') chr.rage = v - parseInt(baseAttr, 10);
      // base-offset fields store (value - base); rage lives on chr.rage, the rest in chr.bodylvl
      else chr.bodylvl[inp.dataset.stat] = baseAttr != null ? v - parseInt(baseAttr, 10) : v;
      recomputeLevel(chr);
      renderAll();
    });
  });
  document.querySelectorAll('.chr-stat-max').forEach(btn => btn.addEventListener('click', () => {
    const inp = document.querySelector(`select.chr-stat[data-stat="${btn.dataset.stat}"]`);
    if (!inp) return;
    inp.value = inp.getAttribute('data-cap');
    inp.dispatchEvent(new Event('change'));
  }));
  document.getElementById('stat-max').addEventListener('click', () => {
    const R = fighterRanges(chr.type || 'BAL', chr.grade != null ? chr.grade : 1, chr.limit_break || 0);
    setStatLevel(chr, R.statCap);
    chr.bodylvl.skill = R.skillCap - R.skillBase;
    chr.bodylvl.bag = R.bagCap - R.bagBase;
    chr.rage = R.rageCap - R.rageBase;
    recomputeLevel(chr);
    renderAll();
    toast('Stats, decal slots, death bag, rage, and level all maxed for this grade/limit break');
  });
  document.querySelectorAll('[data-fi-cat]').forEach(el => {
    el.addEventListener('click', () => {
      fiCategory = el.dataset.fiCat;
      renderFiForm(chr);
    });
  });
  document.querySelectorAll('[data-fi-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [cat, idxStr] = btn.dataset.fiRemove.split(':');
      const idx = parseInt(idxStr, 10);
      const listKey = cat === 'pt' ? 'pspts' : cat === 'msr' ? 'psmsrs' : cat === 'bst' ? 'psbsts' : 'psitems';
      chr[listKey].splice(idx, 1);
      renderAll();
    });
  });
  document.getElementById('fi-refresh-all').addEventListener('click', () => {
    let n = 0;
    for (const p of arr(chr.pspts)) if (refreshPart(p)) n++;
    renderAll();
    toast(n ? `Repaired and refilled ${n} item${n === 1 ? '' : 's'} on ${chr.name || 'this fighter'}` : 'Everything this fighter carries is already at 100% with full ammo');
  });
  document.getElementById('fi-clear-all').addEventListener('click', () => {
    // clear every unequipped item; equipped gear (in eqpts or quick slots) is kept
    const total = arr(chr.pspts).length + arr(chr.psmsrs).length + arr(chr.psbsts).length + arr(chr.psitems).length;
    const worn = new Set(arr(chr.eqpts).map(e => e.eptid).concat(Object.values(chr.armslots || {})));
    if (!confirm(`Delete all ${total - arr(chr.pspts).filter(p => worn.has(p.eptid)).length} unequipped items in ${chr.name}'s Fighter Inventory? Equipped gear is kept. This can't be undone.`)) return;
    chr.pspts = arr(chr.pspts).filter(p => worn.has(p.eptid));
    chr.psmsrs = [];
    chr.psbsts = [];
    chr.psitems = [];
    renderAll();
    toast('Fighter Inventory cleared');
  });
  renderFiForm(chr);
  wireEquipEditor(chr);
  const skillInput = document.getElementById('skill-search');
  wireAutocomplete(skillInput, document.getElementById('skill-acdrop'), 'skl', rec => {
    chr.eqskls = arr(chr.eqskls);
    const R = fighterRanges(chr.type || 'BAL', chr.grade != null ? chr.grade : 1, chr.limit_break || 0);
    const slotsTotal = Math.min(Math.max(R.skillBase + ((chr.bodylvl || {}).skill || 0), R.skillFloor), R.skillCap);
    if (chr.eqskls.some(s => (s.id || s.sklid) === rec.id)) {
      toast(`"${rec.name}" is already equipped`, true);
      skillInput.value = '';
      return;
    }
    if (chr.eqskls.length >= slotsTotal) {
      toast(`All ${slotsTotal} decal slots are full`, true);
      skillInput.value = '';
      return;
    }
    // find the lowest unused decal slot number
    const used = new Set(chr.eqskls.map(s => s.slot).filter(s => s != null));
    let slot = 0;
    while (used.has(slot)) slot++;
    chr.eqskls.push({
      id: rec.id,
      sklid: rec.id,
      slot: slot
    });
    skillInput.value = '';
    renderAll();
  }, null, null, decalOffered);
  document.querySelectorAll('[data-remove-skill]').forEach(btn => {
    btn.addEventListener('click', () => {
      chr.eqskls.splice(parseInt(btn.dataset.removeSkill, 10), 1);
      renderAll();
    });
  });
}

// ==== Autocomplete ====
//
// fullRecordFor(): turn a search result entry into its full master record (via PT/ITEM/SKL/MSR/BST_INDEX).
// Blueprint ('bp') entries use the item record but keep the search entry's display name.
function fullRecordFor(entry) {
  if (!entry) return entry;
  if (entry.category === 'bp') {
    const full = ITEM_INDEX[entry.id];
    return full ? Object.assign({}, full, {
      name: entry.name
    }) : entry;
  }
  const idx = entry.category === 'pt' ? PT_INDEX : entry.category === 'item' ? ITEM_INDEX : entry.category === 'skl' ? SKL_INDEX : entry.category === 'msr' ? MSR_INDEX : entry.category === 'bst' ? BST_INDEX : null;
  return idx && idx[entry.id] || entry;
}

// wireAutocomplete(input, dropEl, category, onPick, ptType, levelInputId, keep): attaches a search-as-you-type dropdown.
//   category   'pt' | 'item' | 'skl' | 'msr' | 'bst' | 'bp' (passed to searchNames).
//   onPick(rec) called with the full master record when the user clicks/Enters a result.
//   ptType     optional part-type filter. keep(id) optional predicate to filter results (e.g. decalOffered).
//   levelInputId  (parts only) element id of a level box used to hide parts that cannot be at that level.
// Supports arrow keys, Enter, Escape; mousedown (not click) is used so it fires before the input blurs.
// levelInputId (weapon/armor searches): only offer parts that can really be at the level typed
// in that box (e.g. Iron Hammer tops out at +4, so at +5 only its uncapped versions are listed).
function wireAutocomplete(input, dropEl, category, onPick, ptType, levelInputId, keep) {
  let hiIdx = -1, results = [], hiddenNote = '';
  const levelEl = () => levelInputId ? document.getElementById(levelInputId) : null;
  function search(q) {
    const lv = levelEl();
    if (category !== 'pt' || !lv || lv.value === '') { hiddenNote = ''; return keep ? searchNames(q, category, 400, ptType).filter(r => keep(r.id)).slice(0, 30) : searchNames(q, category, 30, ptType); }
    const L = parseInt(lv.value, 10) || 0;
    let hidden = 0;
    const list = searchNames(q, category, 400, ptType).filter(r => !keep || keep(r.id)).filter(r => {
      const rec = PT_INDEX[r.id];
      const ok = !rec || (L >= minDisplayLevel(rec) && L <= maxDisplayLevel(rec));
      if (!ok) hidden++;
      return ok;
    });
    hiddenNote = hidden ? `${hidden} more can't be +${L} and aren't listed (change the level to see them)` : '';
    return list.slice(0, 30);
  }
  function show(list) {
    results = list;
    hiIdx = -1;
    dropEl.innerHTML = list.map((r, i) => `<div class="acitem" data-i="${i}"><span>${escapeHtml(r.name)}${r.category === 'pt' && PT_INDEX[r.id] && PT_INDEX[r.id].is_limitbreak ? ' <span class="badge lb" style="margin-left:4px;">Uncap</span>' : ''}${r.category === 'skl' && SKL_INDEX[r.id] ? (Number(SKL_INDEX[r.id].premium) ? ' <span class="badge" style="margin-left:4px;" title="Kept when the fighter dies or the decal is taken off">Premium</span>' : ' <span class="badge" style="margin-left:4px; opacity:.7;" title="Lost when the fighter dies or the decal is taken off">Normal</span>') : ''}</span><span class="id">${r.id}</span></div>`).join('');
    if (hiddenNote) dropEl.innerHTML += `<div class="acnote" style="padding:6px 10px; font-size:11px; color:var(--text-faint); cursor:default;">${escapeHtml(hiddenNote)}</div>`;
    dropEl.classList.toggle('open', list.length > 0 || !!hiddenNote);
  }
  input.addEventListener('input', () => show(search(input.value)));
  input.addEventListener('focus', () => {
    if (input.value) show(search(input.value));
  });
  if (levelEl()) levelEl().addEventListener('input', () => { if (input.value) show(search(input.value)); });
  input.addEventListener('blur', () => setTimeout(() => dropEl.classList.remove('open'), 150));
  input.addEventListener('keydown', e => {
    if (!dropEl.classList.contains('open')) return;
    if (e.key === 'ArrowDown') {
      hiIdx = Math.min(hiIdx + 1, results.length - 1);
      highlight();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      hiIdx = Math.max(hiIdx - 1, 0);
      highlight();
      e.preventDefault();
    } else if (e.key === 'Enter' && hiIdx >= 0) {
      pick(results[hiIdx]);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      dropEl.classList.remove('open');
    }
  });
  function highlight() {
    dropEl.querySelectorAll('.acitem').forEach((el, i) => el.classList.toggle('hi', i === hiIdx));
  }
  function pick(rec) {
    onPick(fullRecordFor(rec));
    dropEl.classList.remove('open');
  }
  dropEl.addEventListener('mousedown', e => {
    const item = e.target.closest('.acitem');
    if (!item) return;
    pick(results[parseInt(item.dataset.i, 10)]);
  });
}

