// ==== Fighter stat / grade / limit-break math ====
//
// Max "core" (stat) level cap constant.
const BODYLVL_CORE_CAP = 40;

// CLASS_NAMES: fighter class codes (chr.type) -> in-game display names. 'OLD' is a legacy class that
// the Class dropdown deliberately hides.
const CLASS_NAMES = {
  BAL: 'All-rounder',
  DEF: 'Defender',
  TEC: 'Attacker',
  SHT: 'Shooter',
  COL: 'Collector',
  SKI: 'Skill Master',
  LUK: 'Lucky Star',
  BRE: 'Striker',
  OLD: 'OLD (legacy, unused)'
};

// getConstInt(): look up an integer from the master_const_int table (AP.constInt) by id, with a fallback.
function getConstInt(id, fallback) {
  const row = (AP.constInt || []).find(r => r.id === id);
  return row ? row.value : fallback;
}

// ---- Part (weapon/armor) upgrade-level conversions ----
// The save stores a part's level as a RAW level >= 1 (rec.reflvllmt is the raw maximum). The game UI
// shows "+N". For normal parts display = raw - 1. For "Uncap" (is_limitbreak) parts, which continue a
// chain from a preceding part (the one whose nextptid points here), display = carry + raw, where
// carry = (preceding part's max raw level - 1), i.e. the +N where the older part left off.
//
// maxPartLevel(): max RAW level of a part record (1 when unknown, 0 for no record).
function maxPartLevel(rec) {
  return rec ? rec.reflvllmt != null ? rec.reflvllmt : 1 : 0;
}

// precedingPtid(): the part record whose nextptid is `ptid` (the base part an Uncap part upgrades), or null.
function precedingPtid(ptid) {
  return (AP.pts || []).find(p => p.nextptid === ptid) || null;
}

// maxDisplayLevel(): highest in-game "+N" a part can reach (see conversions above).
function maxDisplayLevel(rec) {
  if (!rec) return 0;
  if (rec.is_limitbreak) {
    const prev = precedingPtid(rec.id);
    const carryover = prev ? Math.max(0, (prev.reflvllmt || 1) - 1) : 0;
    return carryover + (rec.reflvllmt || 0);
  }
  return Math.max(0, (rec.reflvllmt || 1) - 1);
}

// uncapCarry(): for Uncap parts, the +N already reached by the preceding part (0 for normal parts).
function uncapCarry(rec) {
  if (!rec || !rec.is_limitbreak) return 0;
  const prev = precedingPtid(rec.id);
  return prev ? Math.max(0, (prev.reflvllmt || 1) - 1) : 0;
}

// minDisplayLevel(): lowest "+N" this part can show; Uncap parts start just above the carry-over, others at +0.
function minDisplayLevel(rec) {
  if (!rec) return 0;
  return rec.is_limitbreak ? uncapCarry(rec) + 1 : 0;
}

// displayFromRaw(): raw saved level -> in-game "+N" (raw is clamped into 1..max first).
function displayFromRaw(rec, raw) {
  if (!rec) return raw || 0;
  const r = Math.max(1, Math.min(raw || 1, maxPartLevel(rec) || 1));
  return rec.is_limitbreak ? uncapCarry(rec) + r : r - 1;
}

// rawFromDisplay(): in-game "+N" (string or number) -> raw saved level; clamps into the part's legal range.
function rawFromDisplay(rec, disp) {
  if (!rec) return 1;
  const d = Math.max(minDisplayLevel(rec), Math.min(parseInt(disp, 10) || 0, maxDisplayLevel(rec)));
  const raw = rec.is_limitbreak ? d - uncapCarry(rec) : d + 1;
  return Math.max(1, Math.min(raw, maxPartLevel(rec) || 1));
}

// ---- Per-fighter limits derived from master tables ----
// AP.bodylvlsts rows are keyed by (type = class, grade, limit_break, lvl) and give derived stat values
// plus the skill (decal slot) and bag (Death Bag) bonuses at that stat level. AP.bodydetail rows are
// keyed by (type, grade, limit_break) and hold param_lv_max, skill_slots, bag_capacity, rage_capacity.
//
// statLevelCapFor(): highest stat level available in bodylvlsts for this class/grade/limit break (1 if no rows).
function statLevelCapFor(type, grade, lb) {
  const rows = (AP.bodylvlsts || []).filter(r => r.type === type && r.grade === grade && r.limit_break === lb);
  return rows.length ? Math.max(...rows.map(r => r.lvl)) : 1;
}

// rageCapacityFor(): rage bar count for the class/grade/limit break from bodydetail (default 5).
function rageCapacityFor(type, grade, lb) {
  const row = (AP.bodydetail || []).find(r => r.type === type && r.grade === grade && r.limit_break === lb);
  return row ? row.rage_capacity : 5;
}

// statLevelFloorFor(): lowest stat level in bodylvlsts for this class/grade/limit break (1 if none).
function statLevelFloorFor(type, grade, lb) {
  const rows = (AP.bodylvlsts || []).filter(r => r.type === type && r.grade === grade && r.limit_break === lb);
  return rows.length ? Math.min(...rows.map(r => r.lvl)) : 1;
}

// skillCapFor(): highest decal-slot bonus in bodylvlsts for this combination (0 if none).
function skillCapFor(type, grade, lb) {
  const rows = (AP.bodylvlsts || []).filter(r => r.type === type && r.grade === grade && r.limit_break === lb);
  return rows.length ? Math.max(...rows.map(r => r.skill)) : 0;
}

// skillFloorFor(): lowest decal-slot bonus in bodylvlsts for this combination (0 if none).
function skillFloorFor(type, grade, lb) {
  const rows = (AP.bodylvlsts || []).filter(r => r.type === type && r.grade === grade && r.limit_break === lb);
  return rows.length ? Math.min(...rows.map(r => r.skill)) : 0;
}

// bagCapFor(): highest Death Bag bonus in bodylvlsts for this combination (0 if none).
function bagCapFor(type, grade, lb) {
  const rows = (AP.bodylvlsts || []).filter(r => r.type === type && r.grade === grade && r.limit_break === lb);
  return rows.length ? Math.max(...rows.map(r => r.bag)) : 0;
}

// bagFloorFor(): lowest Death Bag bonus in bodylvlsts for this combination (0 if none).
function bagFloorFor(type, grade, lb) {
  const rows = (AP.bodylvlsts || []).filter(r => r.type === type && r.grade === grade && r.limit_break === lb);
  return rows.length ? Math.min(...rows.map(r => r.bag)) : 0;
}

// derivedStatsAt(): the bodylvlsts row for exactly (type, grade, limit break, stat level), or null.
// Its hp/str/dex/vit/stm/luk columns are the real in-game stat values for that level.
function derivedStatsAt(type, grade, lb, statLevel) {
  return (AP.bodylvlsts || []).find(r => r.type === type && r.grade === grade && r.limit_break === lb && r.lvl === statLevel) || null;
}

// maxLevelForGrade(): top fighter level in AP.bodylvlexp for a grade (1 if none).
function maxLevelForGrade(grade) {
  const rows = (AP.bodylvlexp || []).filter(r => r.grade === grade);
  return rows.length ? Math.max(...rows.map(r => r.lvl)) : 1;
}

// setStatLevel(): set all six stat levels (hp/str/dex/vit/stm/luk) in chr.bodylvl to one level.
function setStatLevel(chr, level) {
  chr.bodylvl = chr.bodylvl || {};
  for (const k of [ 'hp', 'str', 'dex', 'vit', 'stm', 'luk' ]) chr.bodylvl[k] = level;
}

// bodyDetail(): the AP.bodydetail row for (class, grade, limit break), or null.
function bodyDetail(type, grade, lb) {
  return (AP && AP.bodydetail || []).find(r => r.type === type && r.grade === grade && r.limit_break === lb) || null;
}

// skillSlotCount(): number of decal slots in a bodydetail row (skill_slots is a comma-separated list; empty entries ignored).
function skillSlotCount(d) {
  return d && d.skill_slots ? String(d.skill_slots).split(',').filter(s => s.trim() !== '').length : 0;
}

// maxLimitBreakFor(): highest limit break that exists for this class and grade (0 if none). Lower grades cap below 4.
function maxLimitBreakFor(type, grade) {
  const rows = (AP && AP.bodydetail || []).filter(r => r.type === type && r.grade === grade);
  return rows.length ? Math.max(...rows.map(r => r.limit_break)) : 0;
}

// fighterRanges(): the central "what is legal for this fighter" calculator.
// Returns { statFloor, statCap, skillBase/Floor/Cap, bagBase/Floor/Cap, rageBase/Floor/Cap, levelMax }.
// "Base" is the value at limit break 0 (what every fighter of that class/grade has for free); the save
// stores only the BOUGHT extra on top of it (chr.bodylvl.skill, chr.bodylvl.bag, chr.rage), so
// total = base + stored. "Floor" is the previous limit break's value (a fighter can't drop below what
// an earlier limit break already granted); "Cap" is the current limit break's value.
// levelMax is the fighter level reached when everything is at cap (see levelFromParts).
// Special case: Skill Master (SKI) at grade 6 / LB 4 has a rage floor from the previous limit break.
function fighterRanges(type, grade, lb) {
  const cur = bodyDetail(type, grade, lb), base = bodyDetail(type, grade, 0);
  const prev = lb > 0 ? bodyDetail(type, grade, lb - 1) : null;
  const statCap = cur ? cur.param_lv_max : statLevelCapFor(type, grade, lb);
  const statFloor = prev ? prev.param_lv_max : 1;
  const skillBase = skillSlotCount(base), skillCap = Math.max(skillSlotCount(cur), skillBase);
  const skillFloor = prev ? Math.max(skillSlotCount(prev), skillBase) : skillBase;
  const bagBase = base ? base.bag_capacity : 0, bagCap = cur ? Math.max(cur.bag_capacity, bagBase) : bagBase;
  const bagFloor = prev ? Math.max(prev.bag_capacity, bagBase) : bagBase;
  const rageBase = base ? base.rage_capacity : rageCapacityFor(type, grade, 0);
  const rageCap = cur ? cur.rage_capacity : rageBase;
  const rageFloor = type === 'SKI' && grade === 6 && lb === 4 && prev ? prev.rage_capacity : rageCap;
  const levelMax = levelFromParts(6 * statCap, skillCap - skillBase, bagCap - bagBase, rageCap - rageBase);
  return {
    statFloor: statFloor,
    statCap: statCap,
    skillBase: skillBase,
    skillFloor: skillFloor,
    skillCap: skillCap,
    bagBase: bagBase,
    bagFloor: bagFloor,
    bagCap: bagCap,
    rageBase: rageBase,
    rageFloor: rageFloor,
    rageCap: rageCap,
    levelMax: levelMax
  };
}

// rageTotalFor(): total rage bars = base + stored extra, clamped into [rageFloor, rageCap]. R is a fighterRanges() result.
function rageTotalFor(chr, R) {
  return Math.min(Math.max(R.rageBase + (chr.rage || 0), R.rageFloor), R.rageCap);
}

// ---- Death Bag capacity ----
// deathBagCapacity(): Death Bag slots from the fighter's class/grade/LB plus bought bag upgrades,
// clamped into [bagFloor, bagCap]. Returns 0 when the master data (AP) isn't loaded.
function deathBagCapacity(chr) {
  if (!AP) return 0;
  const R = fighterRanges(chr.type || 'BAL', chr.grade != null ? chr.grade : 1, chr.limit_break || 0);
  const bl = chr.bodylvl || {};
  return Math.min(Math.max(R.bagBase + (bl.bag || 0), R.bagFloor), R.bagCap);
}

// vipBagBonus(): extra Death Bag slots from the Express Pass (VIP).
// Express Pass (VIP) adds VIP_INCREASE_DEATHBAG (10) Death Bag slots while it is active.
function vipBagBonus() {
  const v = SAVE && SAVE.soul && SAVE.soul.vip;
  if (!v || !Number(v.vip_flag != null ? v.vip_flag : v.flag)) return 0;
  if (Number(v.expired_time) > 0 && Number(v.expired_time) < Math.floor(Date.now() / 1000)) return 0;
  const r = arr(AP && AP.constInt).find(x => x.id === 'VIP_INCREASE_DEATHBAG');
  return r ? Number(r.value) || 0 : 10;
}
// deathBagLimit(): the real slot limit for a fighter = deathBagCapacity + VIP bonus.
// Returns 0 (not just the bonus) when capacity is unknown so callers treat it as "no data".
// Use this, not deathBagCapacity(), when checking whether items can be added.
function deathBagLimit(chr) { const cap = deathBagCapacity(chr); return cap ? cap + vipBagBonus() : 0; }

// fighterItemCount(): how many Death Bag slots are used: parts + mushrooms + beasts + items.
// Equipped gear counts too (it lives in pspts as well).
function fighterItemCount(chr) {
  return arr(chr.pspts).length + arr(chr.psmsrs).length + arr(chr.psbsts).length + arr(chr.psitems).length;
}

// ---- Fighter level formula ----
// levelFromParts(): level = (sum of the six stat levels) - 5 + bought decal slots + bought bag slots
// + bought rage bars, minimum 1. (Six stats at level 1 gives level 1.)
function levelFromParts(statSum, skillBought, bagBought, rageBought) {
  return Math.max(1, statSum - 5 + (skillBought || 0) + (bagBought || 0) + (rageBought || 0));
}

// computedLevel(): fighter level from chr's current bodylvl stats, skill/bag purchases and rage.
function computedLevel(chr) {
  const bl = chr.bodylvl || {};
  const sum = [ 'hp', 'str', 'dex', 'vit', 'stm', 'luk' ].reduce((a, k) => a + (bl[k] || 1), 0);
  return levelFromParts(sum, bl.skill, bl.bag, chr.rage);
}

// recomputeLevel(): recalculate and store the level in both chr.lvl and chr.bodylvl.lvl (the game keeps both).
// Call after any stat/slot/rage edit.
function recomputeLevel(chr) {
  chr.bodylvl = chr.bodylvl || {};
  chr.lvl = computedLevel(chr);
  chr.bodylvl.lvl = chr.lvl;
}

// fighterOpts(): builds <option> HTML for integers lo..hi, selecting `cur`; `label(v)` customizes the text.
function fighterOpts(lo, hi, cur, label) {
  let h = '';
  for (let v = lo; v <= hi; v++) h += `<option value="${v}" ${v === cur ? 'selected' : ''}>${escapeHtml(label ? label(v) : String(v))}</option>`;
  return h;
}
// One stat as a dropdown of the legal values for this grade/limit break, with its own Max button.
// Fighters tab sections: which are open is remembered in this browser (Profile and Equipment open at first)
// FSEC_OPEN: which collapsible Fighters-tab sections are open; persisted to localStorage
// ('lid.fighterSections') as a per-browser convenience. Storage failures are ignored.
let FSEC_OPEN = { profile: true, stats: false, equip: true, decals: false, inv: false, skins: false };
try { Object.assign(FSEC_OPEN, JSON.parse(localStorage.getItem('lid.fighterSections') || '{}')); } catch (err) {}
// fsec(): HTML for one collapsible <details> section of the Fighters tab (key, title, one-line summary, body HTML).
function fsec(key, title, summary, body) {
  return `<details class="fsec" data-fsec="${key}" ${FSEC_OPEN[key] ? 'open' : ''}><summary><span class="fsec-title">${title}</span><span class="fsec-sum">${summary}</span></summary><div class="fsec-body">${body}</div></details>`;
}
// wireFsec(): remember open/closed state of each section in FSEC_OPEN and localStorage when toggled.
function wireFsec() {
  document.querySelectorAll('details[data-fsec]').forEach(d => d.addEventListener('toggle', () => {
    FSEC_OPEN[d.dataset.fsec] = d.open;
    try { localStorage.setItem('lid.fighterSections', JSON.stringify(FSEC_OPEN)); } catch (err) {}
  }));
}
// a one-line note with the full explanation behind "How this works"
// howTo(): a short note plus an expandable "How this works" explanation (both are HTML strings).
function howTo(short, long) {
  return `<div class="capNote" style="margin:0 0 4px;">${short}</div><details class="howto"><summary>How this works</summary><div class="capNote">${long}</div></details>`;
}
// fighterStatField(): one stat dropdown (lo..hi) with a Max button (omitted when already at max).
// `base` (if not null) is stored in data-base: the saved value is then (chosen - base), used for
// decal slots / Death Bag / rage which the save stores as "bought extra over base".
function fighterStatField(label, key, lo, hi, cur, base) {
  const sel = 'flex:1; min-width:0; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);';
  const atMax = cur >= hi;
  return `<div class="field"><label>${escapeHtml(label)} <span class="id">(${lo === hi ? hi + ', fixed' : lo + '-' + hi})</span></label>
    <div style="display:flex; gap:6px;"><select class="chr-stat" data-stat="${key}" ${base != null ? `data-base="${base}"` : ''} data-floor="${lo}" data-cap="${hi}" style="${sel}">${fighterOpts(lo, hi, cur)}</select>
    ${atMax ? '' : `<button class="subtle chr-stat-max" data-stat="${key}" title="Set to ${hi}">Max</button>`}</div></div>`;
}
// Totals as the game shows them, for "what changed" messages.
// fighterTotals(): snapshot of displayed totals (six stats, Decal Slots, Death Bag, Rage Bars) used to
// build the "what changed" message after a class/grade/limit-break change.
function fighterTotals(chr) {
  const R = fighterRanges(chr.type || 'BAL', chr.grade != null ? chr.grade : 1, chr.limit_break || 0), bl = chr.bodylvl || {};
  const t = {};
  for (const k of [ 'hp', 'str', 'dex', 'vit', 'stm', 'luk' ]) t[k.toUpperCase()] = bl[k] || 1;
  t['Decal Slots'] = R.skillBase + (bl.skill || 0);
  t['Death Bag'] = R.bagBase + (bl.bag || 0);
  t['Rage Bars'] = R.rageBase + (chr.rage || 0);
  return t;
}
// fighterFitNote(): compares an earlier fighterTotals() snapshot with the fighter now; returns a
// "Fitted to the new range: ..." string, or '' if nothing changed.
function fighterFitNote(before, chr) {
  const after = fighterTotals(chr), ch = Object.keys(after).filter(k => before[k] !== after[k]).map(k => `${k} ${before[k]}→${after[k]}`);
  return ch.length ? 'Fitted to the new range: ' + ch.join(', ') : '';
}

// Models: master_body BODY_FEMALE_001..008 / BODY_MALE_001..008 (same labels as Add Fighter).
// Gas masks are per gender (ASSET_NF_* female, ASSET_NM_* male), so a model of the other gender
// also swaps the mask to the same number of the new gender.
// bodyGender(): 'GENDER_MALE'/'GENDER_FEMALE' for a body id; looks in AP.bodies, then guesses from the id text.
function bodyGender(id) { const b = arr(AP && AP.bodies).find(x => x.id === id); return b ? b.gender : (/MALE_/.test(id) && !/FEMALE/.test(id) ? 'GENDER_MALE' : 'GENDER_FEMALE'); }
// bodyLabel(): friendly label such as "Female 3" for a body id.
function bodyLabel(id) { const b = arr(AP && AP.bodies).find(x => x.id === id); return b ? `${b.gender === 'GENDER_MALE' ? 'Male' : 'Female'} ${Number(String(b.id).slice(-3))}` : String(id); }
// setFighterBody(): change a fighter's model. If the current gas mask belongs to the other gender it is
// swapped for the mask with the same trailing number (or the first one) of the new gender.
// Also mirrors the new body into the defense lineup entry (SAVE.fortsetting) for that cid.
function setFighterBody(chr, bodyId) {
  const g = bodyGender(bodyId), masks = arr(AP && AP.gasmasks).filter(m => m.gender === g);
  chr.body = bodyId;
  if (!masks.some(m => m.id === chr.gasmask)) {
    const num = String(chr.gasmask || '').slice(-3);
    const m = masks.find(x => String(x.id).slice(-3) === num) || masks[0];
    if (m) chr.gasmask = m.id;
  }
  // keep the defense lineup's copy of the look in step
  for (const e of arr(SAVE.fortsetting)) if (e.cid === chr.cid) e.body = chr.body;
}

// "Max all fighters": Grade 6, highest limit break (4), then stats, decal slots, Death Bag and rage at the cap,
// the same as the per-fighter Max button. Skipped: dead (ENEMY), placeholders (DUMMY), kidnapped (abid) and the
// fighter in a run (the save is paused/crashed mid-run).
let MAX_ALL_ARMED = false;
// maxAllFighters(): applies the per-fighter "Max" to every eligible fighter (Grade 6, top limit break,
// all stats, decal slots, Death Bag, rage at cap). Returns { done: [names], skipped: ["name (reason)"] }.
// Skipped: dead (ENEMY), placeholder (DUMMY), kidnapped (abid), and the USE fighter while the raw
// save is paused mid-run (soul.pause). Mutates SAVE only.
function maxAllFighters() {
  const inRun = !!(RAW_SAV_ROOT && RAW_SAV_ROOT.soul && RAW_SAV_ROOT.soul.pause);
  const done = [], skipped = [];
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) {
    if (!c) continue;
    const why = c.state === 'ENEMY' ? 'dead' : c.state === 'DUMMY' ? 'not a real fighter' : c.abid ? 'kidnapped' : c.state === 'USE' && inRun ? 'in a run' : '';
    if (why) { skipped.push(`${c.name || '?'} (${why})`); continue; }
    c.grade = gradeMax();
    c.limit_break = maxLimitBreakFor(c.type || 'BAL', 6);
    const R = fighterRanges(c.type || 'BAL', 6, c.limit_break);
    c.bodylvl = c.bodylvl || {};
    setStatLevel(c, R.statCap);
    c.bodylvl.skill = R.skillCap - R.skillBase;
    c.bodylvl.bag = R.bagCap - R.bagBase;
    c.rage = R.rageCap - R.rageBase;
    recomputeLevel(c);
    done.push(c.name || '?');
  }
  return { done, skipped };
}
// clampStatLevelAndRecalc(): after a class/grade/limit-break change, pull the fighter back into the
// legal ranges (limit break, six stats, decal slots, Death Bag, rage) and recompute the level.
function clampStatLevelAndRecalc(chr) {
  const type = chr.type || 'BAL', grade = chr.grade != null ? chr.grade : 1;
  const maxLb = maxLimitBreakFor(type, grade);
  chr.limit_break = Math.min(Math.max(chr.limit_break || 0, 0), maxLb);
  const R = fighterRanges(type, grade, chr.limit_break);
  chr.bodylvl = chr.bodylvl || {};
  for (const k of [ 'hp', 'str', 'dex', 'vit', 'stm', 'luk' ]) {
    chr.bodylvl[k] = Math.min(Math.max(chr.bodylvl[k] || R.statFloor, R.statFloor), R.statCap);
  }
  const skillTotal = Math.min(Math.max(R.skillBase + (chr.bodylvl.skill || 0), R.skillFloor), R.skillCap);
  const bagTotal = Math.min(Math.max(R.bagBase + (chr.bodylvl.bag || 0), R.bagFloor), R.bagCap);
  chr.bodylvl.skill = skillTotal - R.skillBase;
  chr.bodylvl.bag = bagTotal - R.bagBase;
  chr.rage = rageTotalFor(chr, R) - R.rageBase;
  recomputeLevel(chr);
}

// ==== Fighter Inventory (Death Bag) add form ====
//
// fiCategory: selected add-form category: 'pt' weapon/armor, 'bp' blueprint, 'msr' mushroom, 'bst' beast, else material/item.
let fiCategory = 'pt';

// fiAddFormHtml(): HTML for the add form of the current category (search box + level/cooked/unrevealed + quantity).
// Values come from the shared FI_FORM state so they survive re-rendering.
function fiAddFormHtml() {
  const qtyField = `<div class="field"><label>Quantity</label><input type="number" id="fi-qty" min="1" value="${escapeHtml(FI_FORM.qty)}"></div>`;
  if (fiCategory === 'pt') {
    return `<div class="grid">\n      <div class="searchwrap" style="grid-column:span 2;"><input type="text" id="fi-add-search" placeholder="Search weapon/armor name (spare, not equipped)..."><div class="acdrop" id="fi-add-acdrop"></div></div>\n      <div class="field"><label>Level (in-game +N)</label><input type="number" id="fi-add-lvl" value="${escapeHtml(FI_FORM.lvl)}" min="0"></div>\n      ${qtyField}\n    </div>`;
  }
  if (fiCategory === 'bp') {
    return `<div class="grid">\n      <div class="searchwrap" style="grid-column:span 2;"><input type="text" id="fi-add-search" placeholder="Search blueprint (by the weapon/armor it unlocks)..."><div class="acdrop" id="fi-add-acdrop"></div></div>\n      <div class="field"><label><input type="checkbox" id="fi-add-unrevealed" style="width:auto; margin-right:6px;" ${FI_FORM.unrevealed ? 'checked' : ''}>Unrevealed (shows as "?" -- ITMP_*U)</label></div>\n      ${qtyField}\n    </div>`;
  }
  if (fiCategory === 'msr' || fiCategory === 'bst') {
    return `<div class="grid">\n      <div class="searchwrap" style="grid-column:span 2;"><input type="text" id="fi-add-search" placeholder="Search ${fiCategory === 'msr' ? 'mushroom' : 'beast'} name..."><div class="acdrop" id="fi-add-acdrop"></div></div>\n      <div class="field"><label><input type="checkbox" id="fi-add-cooked" style="width:auto; margin-right:6px;" ${FI_FORM.cooked ? 'checked' : ''}>Cooked</label></div>\n      ${qtyField}\n    </div>`;
  }
  return `<div class="grid">\n    <div class="searchwrap" style="grid-column:span 3;"><input type="text" id="fi-add-search" placeholder="Search material or item name..."><div class="acdrop" id="fi-add-acdrop"></div></div>\n    ${qtyField}\n  </div>`;
}

// Picking a result from these search boxes adds the item straight away with
// the Quantity (and Level) already in the form, so say so under the form.
// qtyFirstNote(): small hint HTML. Picking a search result adds immediately, using the form's current quantity.
function qtyFirstNote(withLevel) {
  return `<div class="capNote" style="margin-top:4px;">Set the Quantity${withLevel ? ' (and Level)' : ''} first: choosing an item from the search adds it right away.</div>`;
}

// renderFiForm(chr): renders the add form and wires its autocomplete. Choosing a result adds it
// straight away, up to the Death Bag free space (deathBagLimit - fighterItemCount); extra quantity is dropped with a toast.
// Created records use 'edit-<random>' ids (eptid/eitemid/emsrid/ebstid) so they're recognizable as editor-made.
// Shapes added:
//   weapon/armor -> chr.pspts {eptid, ptid, gettime, rest, spare, grade, dur, lvl}; lvl is the RAW level.
//   blueprint    -> chr.psitems {eitemid, itemId}; itemId gets a 'U' suffix when "unrevealed" (shows as "?").
//   mushroom     -> chr.psmsrs {emsrid, msrid, cooked}; beast -> chr.psbsts {ebstid, bstid, cooked}.
//                   cooked is a boolean here (the save uses state 0=raw / 1=grilled); mushrooms only
//                   get cooked if rec.enable_roast.
//   material/item-> chr.psitems {eitemid, itemId}.
function renderFiForm(chr) {
  // highlight the active category tab
  document.querySelectorAll('[data-fi-cat]').forEach(el => el.classList.toggle('active', el.dataset.fiCat === fiCategory));
  const formEl = document.getElementById('fi-add-form');
  if (!formEl) return;
  formEl.innerHTML = fiAddFormHtml() + qtyFirstNote(fiCategory === 'pt');
  // two-way bind the form inputs to FI_FORM so values persist across re-renders
  bindFormState([ [ 'fi-qty', FI_FORM, 'qty' ], [ 'fi-add-lvl', FI_FORM, 'lvl' ], [ 'fi-add-unrevealed', FI_FORM, 'unrevealed' ], [ 'fi-add-cooked', FI_FORM, 'cooked' ] ]);
  const catType = fiCategory === 'pt' ? 'pt' : fiCategory === 'bp' ? 'bp' : fiCategory === 'msr' ? 'msr' : fiCategory === 'bst' ? 'bst' : 'item';
  wireAutocomplete(document.getElementById('fi-add-search'), document.getElementById('fi-add-acdrop'), catType, rec => {
    const wanted = Math.max(1, parseInt((document.getElementById('fi-qty') || {}).value, 10) || 1);
    const free = Math.max(0, deathBagLimit(chr) - fighterItemCount(chr));
    const qty = Math.min(wanted, free);
    if (!qty) {
      toast(`Death Bag full (${deathBagLimit(chr)} slots${vipBagBonus() ? ', incl. Express Pass' : ''})`, true);
      return;
    }
    for (let n = 0; n < qty; n++) {
      if (fiCategory === 'pt') {
        const clampedLvl = rawFromDisplay(rec, (document.getElementById('fi-add-lvl') || {}).value);
        chr.pspts = arr(chr.pspts);
        chr.pspts.push({
          eptid: 'edit-' + Math.random().toString(16).slice(2) + n,
          ptid: rec.id,
          gettime: Math.floor(Date.now() / 1e3),
          rest: Number(rec.capacity) || 0,
          spare: Number(rec.spare) || 0,
          grade: 0,
          dur: partMaxDur(rec, clampedLvl) || rec.dur,
          lvl: clampedLvl
        });
      } else if (fiCategory === 'bp') {
        const unrevealed = !!(document.getElementById('fi-add-unrevealed') || {}).checked;
        let itemId = rec.id + (unrevealed ? 'U' : '');
        chr.psitems = arr(chr.psitems);
        chr.psitems.push({
          eitemid: 'edit-' + Math.random().toString(16).slice(2) + n,
          itemId: itemId
        });
      } else if (fiCategory === 'msr') {
        const cooked = !!(document.getElementById('fi-add-cooked') || {}).checked;
        if (n === 0 && cooked && !rec.enable_roast) toast(`"${rec.name}" can't be roasted -- adding uncooked`, true);
        chr.psmsrs = arr(chr.psmsrs);
        chr.psmsrs.push({
          emsrid: 'edit-' + Math.random().toString(16).slice(2) + n,
          msrid: rec.id,
          cooked: cooked && !!rec.enable_roast
        });
      } else if (fiCategory === 'bst') {
        const cooked = !!(document.getElementById('fi-add-cooked') || {}).checked;
        chr.psbsts = arr(chr.psbsts);
        chr.psbsts.push({
          ebstid: 'edit-' + Math.random().toString(16).slice(2) + n,
          bstid: rec.id,
          cooked: cooked
        });
      } else {
        chr.psitems = arr(chr.psitems);
        chr.psitems.push({
          eitemid: 'edit-' + Math.random().toString(16).slice(2) + n,
          itemId: rec.id
        });
      }
    }
    toast(qty < wanted ? `Death Bag full -- added ${qty} of ${wanted}x "${rec.name}"` : `Added ${qty}x "${rec.name}" to Fighter Inventory`, qty < wanted);
    renderAll();
  }, undefined, 'fi-add-lvl');
}

// ==== Adding, deleting and recovering fighters ====
//
// The game has no freezer-level field: the freezer's size is the number of
// entries in soul.chr.slots[uid] (one {uid, slot, cid} per hanger), and
// master_freezer maps level -> slot count (1 -> 3 ... 8 -> 10). The editor's
// old "Freezer Level" value was never written to the save, and "Add Character"
// created fighters with no freezer slot and most fields missing, which can
// stop the game from booting. Both are disabled until the slot format for an
// empty hanger is known.
// A fighter exactly as the game stores a newly bought, never-used one (from a
// real save: grade 1 "Marie" - hp 999999, all exp 0, stats all 1, empty arm
// slots). Empty freezer hangers are {uid, slot, cid: ""}; adding a fighter
// fills the first empty hanger. soul.chr.chrs is kept sorted by cid, as the
// game writes it.
// newFighterRecord(): builds a brand-new fighter exactly as the game stores one (see notes above).
// The record is in the editor's working shape: the fields after the "editor-side" marker
// (lvl, rage, bodylvl, bodybonus, pspts/eqpts/...) are converted to the game's separate tables
// (bodyuser / deathbag / eqskl) by buildDownloadRoot() at download time.
// Picks a random gas mask matching the body's gender. Does NOT place it in a hanger (see addFighterToFreezer).
function newFighterRecord(name, body) {
  const uid = Number(RAW_SAV_MAIN_UID);
  const b = arr(AP && AP.bodies).find(x => x.id === body) || arr(AP && AP.bodies)[0] || { id: 'BODY_FEMALE_001', gender: 'GENDER_FEMALE' };
  const masks = arr(AP && AP.gasmasks).filter(m => m.gender === b.gender);
  const mask = masks.length ? masks[Math.floor(Math.random() * masks.length)].id : (b.gender === 'GENDER_MALE' ? 'ASSET_NM_GAS_HEAD_001' : 'ASSET_NF_GAS_HEAD_001');
  return {
    uid, cid: presentUuid(), body: b.id, gasmask: mask, type: 'BAL', grade: 1, limit_break: 0,
    money: 0, spirit: 0, bloodnium: 0,
    bloodnium_result: '{"enemy_count":0,"bloodnium":0,"elapsed_time":0,"max_floor_id":""}',
    hp: 999999, escdie: 0, total_exp: 0, rest_exp: 0, gain_exp: 0, start_exp: 0, sklgauge: 0,
    pause: '', abid: '', name: name || 'New Fighter', state: 'FREE', select_arm_slots: '',
    hunter_win: -1, hunter_lose: -1, hunter_draw: -1,
    // editor-side fields (turned into bodyuser / deathbag / eqskl on download)
    lvl: 1, rage: 0,
    bodylvl: { lvl: 1, hp: 1, str: 1, dex: 1, vit: 1, stm: 1, luk: 1, skill: 0, bag: 0 },
    bodybonus: { hp_bonus: 0, str_bonus: 0, dex_bonus: 0, vit_bonus: 0, stm_bonus: 0, luk_bonus: 0 },
    pspts: [], eqpts: [], psmsrs: [], psbsts: [], psitems: [], eqskls: []
  };
}
// Deleting a fighter, as the game's own delete does it (before/after saves):
// the fighter record and its bodyuser row go, its hanger's cid becomes "",
// its death bag becomes {}, every item it carried is deleted (parts,
// mushrooms, beasts, items), equipped decals come off (premium decals go
// back to the decal stock +1, normal ones are lost), and
// playlog.fighter.destory_fighter goes up by 1. The game also takes some
// rank points and gives SPLithium; the amounts aren't known, so those are
// left alone. The fighter you're playing
// (USE), defense fighters (GUARD), DUMMY fighters and kidnapped ones are not
// deletable here.
// FIGHTER_DELETES: pending deletions to apply to the cloned raw JSON at download time. `root` ties
// the set to the RAW_SAV_ROOT it was recorded for (reset when a different save is loaded); `cids` are
// fighter cids that existed in the original save; `eids` are item instance ids (eptid/emsrid/ebstid/eitemid) to drop from deathbags.
let FIGHTER_DELETES = { root: null, cids: new Set, eids: new Set };
// fighterDeleteBlock(): why a fighter can't be deleted (string for the UI), or null if deletion is allowed.
function fighterDeleteBlock(c) {
  if (!c) return 'No fighter selected.';
  if (c.state === 'USE') return "This is the fighter you're currently playing. Switch fighters in game first.";
  if (c.state === 'GUARD') return 'This fighter is on Tokyo Death Metro defense. Take them off defense in game first.';
  if (c.state === 'DUMMY') return "This fighter isn't a normal freezer fighter.";
  if (c.state === 'ENEMY') return 'This fighter is dead (a Hater). Recover them first.';
  if (c.abid) return 'This fighter has been kidnapped.';
  return null;
}
// deleteFighter(c): remove fighter `c` from SAVE and record the raw-save deletions (FIGHTER_DELETES).
// Frees its freezer hanger, gives back premium decals the ORIGINAL save had equipped (up to DECAL_CAP),
// and bumps playlog.fighter.destory_fighter (sic, the game's spelling). Fighters created in this
// session never existed in the raw save, so nothing is recorded or counted for them.
function deleteFighter(c) {
  if (FIGHTER_DELETES.root !== RAW_SAV_ROOT) FIGHTER_DELETES = { root: RAW_SAV_ROOT, cids: new Set, eids: new Set };
  for (const p of arr(c.pspts)) FIGHTER_DELETES.eids.add(p.eptid);
  for (const m of arr(c.psmsrs)) FIGHTER_DELETES.eids.add(m.emsrid);
  for (const b of arr(c.psbsts)) FIGHTER_DELETES.eids.add(b.ebstid);
  for (const it of arr(c.psitems)) FIGHTER_DELETES.eids.add(it.eitemid);
  // fighters added in this session never existed in the save: nothing to keep
  const rawChrs = arr(RAW_SAV_ROOT.soul && RAW_SAV_ROOT.soul.chr && RAW_SAV_ROOT.soul.chr.chrs && RAW_SAV_ROOT.soul.chr.chrs[RAW_SAV_MAIN_UID]);
  const existed = rawChrs.some(x => x.cid === c.cid);
  if (existed) FIGHTER_DELETES.cids.add(c.cid);
  // drop the fighter from the working list and empty its hanger
  SAVE.soul.chrs = SAVE.soul.chrs.filter(x => x !== c);
  for (const s of arr(SAVE.soul.chrslots)) if (s && s.cid === c.cid) s.cid = '';
  if (existed) {
    // only decals the save itself had on this fighter (the editor's own
    // equip doesn't take from stock, so those aren't given back)
    const rawEq = arr(RAW_SAV_ROOT.soul && RAW_SAV_ROOT.soul.skl && RAW_SAV_ROOT.soul.skl.eqskl && RAW_SAV_ROOT.soul.skl.eqskl[RAW_SAV_MAIN_UID]).filter(e => e.cid === c.cid);
    const still = new Set(arr(c.eqskls).map(e => e.id || e.sklid));
    SAVE.soul.psskls = arr(SAVE.soul.psskls);
    for (const e of rawEq) {
      if (!still.has(e.sklid) || !(SKL_INDEX[e.sklid] && Number(SKL_INDEX[e.sklid].premium) === 1)) continue;
      let st = SAVE.soul.psskls.find(x => x.id === e.sklid);
      if (!st) SAVE.soul.psskls.push(st = { id: e.sklid, lvl: 1, cnt: 0, is_checked: 1 });
      st.cnt = Math.min((st.cnt || 0) + 1, DECAL_CAP);
    }
    const pl = SAVE.playlog && SAVE.playlog[0];
    if (pl && pl.fighter && typeof pl.fighter.destory_fighter === 'number') pl.fighter.destory_fighter++;
  }
  activeCharIdx = 0;
}

// Recovering a dead fighter (a Hater), as the game's own recovery does it
// (before/after saves): when a fighter dies the game sets chr.state "ENEMY"
// and hp 0, keeps the death bag, and adds a record to diedchara.dchrs[uid]
// (rcvrymn = the Kill Coin price) plus diedchara.bodylvls[uid] (row by did)
// and diedchara.pspts/eqpts/eqskls[uid][did]. Recovery sets the fighter back
// to FREE with full HP, resets bloodnium_result, removes those diedchara
// entries (dchrs[uid] becomes {} when empty) and adds 1 to
// playlog.fighter.recover_fighter. The editor doesn't charge the Kill Coins.
// hp 999999 is the value the game itself uses for "full" (new fighters).
let FIGHTER_RECOVERS = { root: null, cids: new Set };
// BLOODNIUM_RESULT_EMPTY: the JSON string the game stores in chr.bloodnium_result for a fighter with no run result.
const BLOODNIUM_RESULT_EMPTY = '{"enemy_count":0,"bloodnium":0,"elapsed_time":0,"max_floor_id":""}';
// fighterDeathRecords(): this fighter's records in the ORIGINAL save's diedchara.dchrs[mainUid] (matched by cid).
function fighterDeathRecords(c) {
  const d = RAW_SAV_ROOT && RAW_SAV_ROOT.diedchara && RAW_SAV_ROOT.diedchara.dchrs && RAW_SAV_ROOT.diedchara.dchrs[RAW_SAV_MAIN_UID];
  return arr(d).filter(e => e && e.cid === c.cid);
}
// recoverFighter(c): marks a dead fighter FREE with full HP and queues the diedchara cleanup for download
// (FIGHTER_RECOVERS). Returns false if c isn't ENEMY. Does not charge Kill Coins.
function recoverFighter(c) {
  if (!c || c.state !== 'ENEMY') return false;
  if (FIGHTER_RECOVERS.root !== RAW_SAV_ROOT) FIGHTER_RECOVERS = { root: RAW_SAV_ROOT, cids: new Set };
  c.state = 'FREE';
  c.hp = 999999;
  c.bloodnium_result = BLOODNIUM_RESULT_EMPTY;
  FIGHTER_RECOVERS.cids.add(c.cid);
  const pl = SAVE.playlog && SAVE.playlog[0];
  if (pl && pl.fighter && typeof pl.fighter.recover_fighter === 'number') pl.fighter.recover_fighter++;
  return true;
}
// fighterDeadNote(): warning banner HTML (death time/floor, recovery price) with the Recover button for a dead fighter.
function fighterDeadNote(chr) {
  const d = fighterDeathRecords(chr)[0];
  const when = d && dtIsDateValue(d.created) ? ` Died ${escapeHtml(dtFmt(d.created))} on ${escapeHtml(graveFloor(d.flrid))}.` : '';
  const cost = d && d.rcvrymn ? ` The Fighter Depot charges ${Number(d.rcvrymn).toLocaleString()} Kill Coins to recover them.` : '';
  return `<div class="warnNote" style="display:flex; gap:10px; align-items:center;"><div style="flex:1;"><b>${escapeHtml(chr.name || 'This fighter')} is dead and roaming the Tower as a Hater.</b>${when}${cost} Recovering here is free and makes the same changes the game's recovery does: back in the freezer with full HP, death bag kept.</div><button class="action" id="btn-recover-char">Recover ${escapeHtml(chr.name || 'fighter')}</button></div>`;
}
// applyFighterRecovers(): download-time step (called from buildDownloadRoot) that edits the cloned
// root: removes the diedchara records of recovered fighters from dchrs, bodylvls, and pspts/eqpts/eqskls.
// Gotcha: when dchrs[mainUid] becomes empty the game's shape is {} not [] so an empty object is written.
function applyFighterRecovers(root, rawRoot, mainUid) {
  if (FIGHTER_RECOVERS.root !== rawRoot || !FIGHTER_RECOVERS.cids.size) return;
  const dc = root.diedchara;
  if (!dc || !dc.dchrs) return;
  const list = arr(dc.dchrs[mainUid]);
  const dids = new Set(list.filter(e => FIGHTER_RECOVERS.cids.has(e.cid)).map(e => e.did));
  if (!dids.size) return;
  const keep = list.filter(e => !dids.has(e.did));
  dc.dchrs[mainUid] = keep.length ? keep : {};
  if (dc.bodylvls && Array.isArray(dc.bodylvls[mainUid])) dc.bodylvls[mainUid] = dc.bodylvls[mainUid].filter(b => !dids.has(b.did));
  for (const k of [ 'pspts', 'eqpts', 'eqskls' ]) {
    const m = dc[k] && dc[k][mainUid];
    if (m && typeof m === 'object' && !Array.isArray(m)) for (const did of dids) delete m[did];
  }
}

// ==== Freezer (hangers) ====
//
// freeHangers(): the empty freezer hangers (chrslots entries with cid '').
function freeHangers() {
  return arr(SAVE && SAVE.soul && SAVE.soul.chrslots).filter(s => s && s.cid === '');
}
// addFighterToFreezer(): create a new fighter in the first empty hanger; keeps chrs sorted by cid like the
// game. Returns the new fighter, or null when the freezer is full.
function addFighterToFreezer(name, body) {
  const hanger = freeHangers()[0];
  if (!hanger) return null;
  const c = newFighterRecord(name, body);
  hanger.cid = c.cid;
  SAVE.soul.chrs.push(c);
  SAVE.soul.chrs.sort((a, b) => String(a.cid).localeCompare(String(b.cid)));
  return c;
}

// Freezer level = number of hangers (soul.chr.slots[uid]); a level-1 save has
// 3 hangers, maxed saves have 10 (master_freezer: level -> count). Raising the
// level appends empty hangers {uid, slot, cid: ""}; lowering is only allowed
// when the hangers being removed are empty.
// setFreezerLevel(level): resize chrslots to master_freezer's count for that level. Returns null on
// success or an error message string (unknown level, or non-empty hangers would be removed).
function setFreezerLevel(level) {
  const rows = arr(AP && AP.freezer);
  const row = rows.find(r => r.number === level);
  if (!row) return 'Unknown freezer level';
  const slots = SAVE.soul.chrslots = arr(SAVE.soul.chrslots);
  const uid = Number(RAW_SAV_MAIN_UID);
  if (row.count > slots.length) {
    for (let i = slots.length; i < row.count; i++) slots.push({ uid, slot: i, cid: '' });
    return null;
  }
  if (row.count < slots.length) {
    const removed = slots.slice(row.count);
    if (removed.some(s => s && s.cid)) return `Hangers ${row.count + 1}-${slots.length} aren't empty, so the freezer can't go down to level ${level}.`;
    slots.length = row.count;
  }
  return null;
}

// realFreezerInfo(): { slots, level, max } from the actual hanger count; level is null when no master row matches.
function realFreezerInfo() {
  const n = arr(SAVE && SAVE.soul && SAVE.soul.chrslots).length;
  const row = arr(AP && AP.freezer).find(r => r.count === n);
  const max = Math.max(0, ...arr(AP && AP.freezer).map(r => r.count));
  return { slots: n, level: row ? row.number : null, max: max || 10 };
}
// brokenFighters(): non-DUMMY fighters that would likely break the game: cid not a UUID, no body, or no freezer hanger.
function brokenFighters() {
  const slotCids = new Set(arr(SAVE && SAVE.soul && SAVE.soul.chrslots).map(s => s && s.cid));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return arr(SAVE && SAVE.soul && SAVE.soul.chrs).filter(c => c && c.state !== 'DUMMY' && (!uuid.test(c.cid || '') || !c.body || !slotCids.has(c.cid)));
}

