// =============================================================================
// LET IT DIE Offline save editor - application script (single file, no build step)
// =============================================================================
// WHAT THIS IS
//   A browser-only editor for LET IT DIE Offline saves. Nothing is uploaded: the
//   .sav file, the game database (masters.db) and every edit stay in this tab.
//
// DATA FLOW (read this first)
//   load:  file bytes -> parseBrgSav (16-byte "BRG" header + zlib chunks)
//          -> JSON text -> RAW_SAV_ROOT (the raw document, NEVER edited)
//          -> adaptFullDumpToLegacyShape -> SAVE (friendlier shape the UI edits)
//   edit:  UI handlers change SAVE (and a few side tables) only.
//   save:  buildDownloadRoot() clones RAW_SAV_ROOT and writes back only what the
//          editor owns, merging into the existing rows (pushInst) so fields the
//          editor does not understand survive. A review diff is shown, then
//          buildBrgSav() compresses to a single zlib chunk with a BRG header.
//
// masters.db
//   The save stores ids only. The game's own SQLite database (masters.db) is read
//   in the browser with sql.js and supplies names, limits and rules (indexes such
//   as PT_INDEX/SKL_INDEX/BST_INDEX/MSR_INDEX, constIntOf(), freezer sizes, Jackal
//   weights...). Reading limits from it keeps the editor correct across updates.
//
// SAFETY IDEAS WORTH COPYING
//   - keep an untouched raw copy and merge edits into a clone of it
//   - remember empty {} vs [] shapes (captureEmptyShapes/restoreEmptyShapes)
//   - run a self-check (runSaveCheck) and show a diff before any download
//   - dated output names so an older save is never overwritten
//   - every localStorage/IndexedDB access is wrapped in try/catch (storage is a
//     convenience, never a source of truth)
//
// MAP OF THIS FILE (approximate order): constants and helpers, save codec,
// loader/adapter, per-feature tabs (fighters, inventory, decals, stews, jackals,
// storage, runs and floors, VIP, ...), Save check, rendering and UI helpers,
// buildDownloadRoot, then start-up/bootstrap code. Search for the "====" banners.
// =============================================================================
// ============================================================================
// ==== Core state, game tables, save-file codec, masters.db loading ====
// Covers: global editor state, form defaults, masters.db-derived limits
// (currencies, freezer, bank, storage box, research stamps), the BRG/zlib save
// reader+writer, the adapter that flattens the game's "full dump" JSON into the
// editor's friendlier SAVE shape, and the inverse buildRawSavRootFromSave().
// ============================================================================
'use strict';

// ---- Global editor state ----
// AP = "all parts": the parsed masters.db tables (arrays of row objects, e.g. AP.pts,
// AP.items, AP.skls). Null until masters.db is loaded; most code guards on it.
let AP = null;

// "<section>.<id>" -> localized English text, filled from master_text (lang='int').
// resolveName() looks names up here.
let LOCDAT_INDEX = {};

// SAVE = the editor's working copy in a friendly "legacy" shape (soul.chrs with nested
// inventories, SAVE.cl storage box, etc.). Every tab edits this object.
let SAVE = null;

// Per-tab UI state for the research sub-tabs (not part of the save).
let RESEARCH_SUBTAB_STATE = {};

// RAW_SAV_ROOT = the untouched parsed JSON of the loaded .sav (the game's real shape).
// It is never edited; buildRawSavRootFromSave() clones it and merges SAVE back in.
// RAW_SAV_MAIN_UID = the account uid (string) whose data lives under the per-uid keys.
let RAW_SAV_ROOT = null;

let RAW_SAV_MAIN_UID = null;

// Bag capacity of each fighter as loaded, keyed by cid. Used so a fighter's
// death bag slot list is only padded when the fighter actually needs more room.
let ORIG_BAG_CAP = {};

// Lookup tables built by tryBuildIndices(): id -> master row with a resolved display name
// and a .category tag. NAME_INDEX is the flat searchable list used by searchNames().
let PT_INDEX = {}, ITEM_INDEX = {}, SKL_INDEX = {}, MSR_INDEX = {}, BST_INDEX = {};

let NAME_INDEX = [];

// Index into SAVE.soul.chrs of the fighter tab currently shown.
let activeCharIdx = 0;

// ---- Add-item form defaults ----
// Plain objects that mirror the inputs of the "add" forms; bindFormState() keeps them in sync
// so the values survive re-renders. SB_FORM / FI_FORM are the two inventory add forms
// (qty, level, unrevealed flag, cooked flag for mushrooms/beasts: state 0=raw, 1=grilled).
const SB_FORM = {
  qty: 1,
  lvl: 0,
  unrevealed: false,
  cooked: false
};

const FI_FORM = {
  qty: 1,
  lvl: 0,
  unrevealed: false,
  cooked: false
};

// Defaults for the Rebuild/Bag-style form (Death Bag contents, part level, search/amount numbers).
const RB_FORM = {
  includePs: false,
  bagRarity: 'GOLD',
  bagContent: '',
  bagQty: 1,
  ptLvl: 0,
  searchNum: 1,
  amountNum: 1e3,
  unrevealed: false
};

/**
 * Wire DOM inputs to plain form-state objects.
 * @param {Array<[string, object, string]>} bindings [elementId, stateObject, key] triples.
 * Side effects: adds input+change listeners that copy el.checked (checkbox) or el.value into obj[key].
 * Missing elements are skipped silently.
 */
function bindFormState(bindings) {
  for (const [id, obj, key] of bindings) {
    const el = document.getElementById(id);
    if (!el) continue;
    const sync = () => {
      obj[key] = el.type === 'checkbox' ? el.checked : el.value;
    };
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
  }
}

// Starter data (new user, playlog, research, etc.) embedded in the page as JSON, used by
// startSave() to seed fields a loaded save does not provide.
const TEMPLATES = JSON.parse(document.getElementById('templates-data').textContent);

// Equipment sites on a fighter: which EQSITE_* slot, its label, and which part type(s)
// (master_part.type) may be equipped there. Head and Legs accept two types each.
const SLOT_TYPES = [ {
  site: 'EQSITE_ARML',
  label: 'Weapon (L)',
  ptType: 'PTTP_ARM'
}, {
  site: 'EQSITE_ARMR',
  label: 'Weapon (R)',
  ptType: 'PTTP_ARM'
}, {
  site: 'EQSITE_HEAD',
  label: 'Head',
  ptType: [ 'PTTP_HEAD', 'PTTP_MASK' ]
}, {
  site: 'EQSITE_BODY',
  label: 'Body',
  ptType: 'PTTP_BODY'
}, {
  site: 'EQSITE_LEGS',
  label: 'Legs',
  ptType: [ 'PTTP_LEGS', 'PTTP_PANTS' ]
} ];

// ---- Limits derived from masters.db (with safe fallbacks) ----
// caps from the game: master_const_int BLOODNIUM_POINT_MAX; Recycle Points from
// the vending machine text VENDER.TXT_RP_MS ("MAX: 999999999", extra is lost)
/** Max Bloodnium: master_const_int BLOODNIUM_POINT_MAX, falling back to 999999. */
function bloodniumMax() { const v = constIntOf('BLOODNIUM_POINT_MAX', 999999); return v > 0 ? v : 999999; }
/** [saveKey, label, maxValue] for the two currency fields shown in the editor. */
function currencyFields() { return [ [ 'bloodnium_point', 'Bloodnium', bloodniumMax() ], [ 'recycle_point', 'Recycle Points', 999999999 ] ]; }

// (see note above) default hanger counts indexed by Freezer level; used when master_freezer is unavailable.
// hangers per Freezer level: masters.db master_freezer (number = level, count = hangers); the list is the fallback
const FREEZER_CAPACITY_DEFAULT = [ 0, 3, 4, 5, 6, 7, 8, 9, 10 ];
/** Highest Freezer level defined in master_freezer (default list length - 1). */
function freezerLevels() { const r = arr(AP && AP.freezer).filter(x => Number(x.number) > 0); return r.length ? Math.max(...r.map(x => Number(x.number))) : FREEZER_CAPACITY_DEFAULT.length - 1; }
/** Number of fighter hangers at a given Freezer level (master_freezer.count, else default list). */
function freezerCapacity(lvl) { const r = arr(AP && AP.freezer).find(x => Number(x.number) === Number(lvl)); return r ? Number(r.count) : FREEZER_CAPACITY_DEFAULT[lvl] || 0; }

// ---- Part-research "stamps" ----
// Researching eligible parts adds a stamp bonus per category (weapon attack type, head, body, legs).
// Category keys, in display order:
const RESEARCH_STAMP_TYPES = [ 'SLASH', 'SHOOT', 'HIT', 'HEAD', 'BODY', 'LEGS' ];

// Display labels for the stamp categories above.
const STAMP_LABELS = {
  SLASH: 'Slash',
  SHOOT: 'Shoot',
  HIT: 'Hit',
  HEAD: 'Head',
  BODY: 'Body',
  LEGS: 'Legs'
};

/** Bonus added per researched part, per stamp category, from master_const_float PART_RESEARCH_STAMP_ADD_RATE_<TYPE> (0 if missing). */
function stampRatePerCategory() {
  const rates = {};
  for (const type of RESEARCH_STAMP_TYPES) {
    const row = (AP.constFloat || []).find(r => r.id === 'PART_RESEARCH_STAMP_ADD_RATE_' + type);
    rates[type] = row ? row.value : 0;
  }
  return rates;
}

/**
 * Which stamp category a master part counts toward, or null.
 * Arms map via master_part_atkattr (SLASH/SHOOT/HIT); head/body/legs map directly.
 * @param {object} p a PT_INDEX/master_part record
 */
function stampCategoryFor(p) {
  if (!p) return null;
  if (p.type === 'PTTP_ARM') {
    const row = (AP.atkattr || []).find(a => a.id === p.id && [ 'ATKATTR_SLASH', 'ATKATTR_SHOOT', 'ATKATTR_HIT' ].includes(a.attr));
    return row ? row.attr.replace('ATKATTR_', '') : null;
  }
  if (p.type === 'PTTP_HEAD') return 'HEAD';
  if (p.type === 'PTTP_BODY') return 'BODY';
  if (p.type === 'PTTP_LEGS') return 'LEGS';
  return null;
}

// Cache of part ids that count for stamps; reset to null whenever masters.db is (re)loaded.
let STAMP_ELIGIBLE_SET = null;

/**
 * Build the set of part ids eligible for stamp totals: stamp parts whose research is open, not
 * platform-restricted (platform 1 = PS-only unless the save is a PS save), not blocklisted, and
 * actually obtainable (a real blueprint item exists or an upgrade chain reaches the part).
 * @returns {Set<string>} part ids
 */
function buildStampEligibleSet() {
  const blueprintIds = new Set((AP.items || []).filter(it => it.itemtype === 'ITTP_RMAP').map(it => it.itemId));
  const nextptidTargets = new Set((AP.pts || []).map(p => p.nextptid).filter(Boolean));
  const openResearch = new Set((AP.partresearch || []).filter(r => r.is_open).map(r => r.ptid));
  const eligible = new Set;
  for (const p of AP.pts || []) {
    if (!p.is_stamp) continue;
    if (!openResearch.has(p.id)) continue;
    if ((p.platform === 1 && !isPsSave()) || RESEARCH_BLOCKLIST.has(p.id)) continue;
    const hasBlueprint = blueprintIds.has('ITMP_' + p.id.slice(3));
    const reachableByUpgrade = nextptidTargets.has(p.id);
    if (hasBlueprint || reachableByUpgrade) eligible.add(p.id);
  }
  return eligible;
}

/**
 * Total stamp bonus per category for the currently loaded save: sums the per-category rate for every
 * FINISHED entry in SAVE.user_research that is stamp-eligible, rounded to 1 decimal.
 * @returns {{SLASH:number,SHOOT:number,HIT:number,HEAD:number,BODY:number,LEGS:number}}
 */
function computeStampTotals() {
  if (!STAMP_ELIGIBLE_SET) STAMP_ELIGIBLE_SET = buildStampEligibleSet();
  const rates = stampRatePerCategory();
  const researchedPtids = new Set(SAVE.user_research.filter(r => r.research_type === 'FINISHED').map(r => r.ptid));
  const totals = {
    SLASH: 0,
    SHOOT: 0,
    HIT: 0,
    HEAD: 0,
    BODY: 0,
    LEGS: 0
  };
  for (const ptid of researchedPtids) {
    if (!STAMP_ELIGIBLE_SET.has(ptid)) continue;
    const cat = stampCategoryFor(PT_INDEX[ptid]);
    if (cat && totals[cat] != null) totals[cat] += rates[cat];
  }
  for (const type of RESEARCH_STAMP_TYPES) totals[type] = Math.round(totals[type] * 10) / 10;
  return totals;
}

/** Sanitize a fighter name: strip control chars and < > " \\, trim, cap at 32 chars. */
function cleanFighterName(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>"\\]/g, '').trim().slice(0, 32); }
/** Highest body grade in master_body_detail (fallback 6). */
function gradeMax() { const g = arr(AP && AP.bodydetail).map(r => Number(r.grade)).filter(n => n > 0); return g.length ? Math.max(...g) : 6; }
/** Highest rank point cap in master_tdm_rank (fallback 10000). */
function tdmPointMax() { const t = arr(AP && AP.tdmrank).map(r => Number(r.point_max)).filter(n => n > 0); return t.length ? Math.max(...t) : 10000; }
/** Look up the Tokyo Death Metro rank row for a point total (highest point_min <= pt). Takes AP explicitly. */
function tdmRankForPoints(pt, AP) {
  const table = (AP.tdmrank || []).slice().sort((a, b) => a.point_min - b.point_min);
  let best = table[0];
  for (const r of table) {
    if (pt >= r.point_min) best = r;
  }
  return best;
}

/** Insert a space before a trailing roman-numeral suffix in a rank name ("Gold" + numeral). */
function formatTdmRank(name) {
  if (!name) return name;
  return name.replace(/([a-z])([\u2160-\u2188]+)$/i, '$1 $2');
}

/**
 * Resolve a team id to its display name: first master_team (AP.teams), then SAVE.teams
 * (entries may be flat or wrapped as {team:{...}}). Returns null if unknown.
 */
function teamName(tid) {
  if (tid == null) return null;
  if (AP && AP.teams) {
    const t = AP.teams.find(t => String(t.tid) === String(tid));
    if (t && t.name) return t.name;
  }
  if (!SAVE || !SAVE.teams) return null;
  const entry = SAVE.teams.find(t => String(t.tid) === String(tid) || t.team && String(t.team.tid) === String(tid));
  return entry && (entry.name || entry.team && entry.team.name) || null;
}

// ---- Kill Coin Bank / SPLithium tank capacity ----
// The Kill Coin Bank (safe_level) has its own table, master_safe_level; the SPLithium tank (spirit_tank_level) uses
// master_spirit_tank_level. The stock tables hold the same limits, but a modded masters.db can change either one.
/** Pick the level table for a bank: master_safe_level for 'safe_level', otherwise master_spirit_tank_level. */
function bankRowsFor(levelField) {
  const safe = AP && arr(AP.safelevel), tank = AP && arr(AP.spirittank);
  return (levelField || 'safe_level') === 'safe_level' && safe && safe.length ? safe : tank || [];
}
/** Highest level in the chosen bank table (fallback 50). */
function bankMaxLevel(levelField) {
  const rows = bankRowsFor(levelField);
  return rows.length ? Math.max(...rows.map(r => r.level)) : 50;
}

/** Coin/SPLithium capacity (row.limit) at a level, clamped to 1..max level; 0 if no table. */
function bankCapacityForLevel(level, levelField) {
  const rows = bankRowsFor(levelField);
  if (!rows.length) return 0;
  const l = Math.min(Math.max(level, 1), bankMaxLevel(levelField));
  const row = rows.find(r => r.level === l);
  return row ? row.limit : 0;
}

// Smallest Storage Box size (also the number of empty slots a brand-new SAVE.cl starts with).
const STORAGE_BOX_MIN = 30;

// Storage Box (the game calls it the coin locker, save key cl): masters.db master_const_int COINLOCKER_EXPAND_LIMIT_COUNT (2000) is its
// largest capacity and COINLOCKER_EXPAND_COUNT (10) the step; read live so a modded masters.db is followed
const STORAGE_BOX_MAX_DEFAULT = 2e3;
function storageBoxStep() { const v = constIntOf('COINLOCKER_EXPAND_COUNT', 10); return v > 0 ? v : 10; }
function storageBoxMax() { const v = constIntOf('COINLOCKER_EXPAND_LIMIT_COUNT', STORAGE_BOX_MAX_DEFAULT); return v >= STORAGE_BOX_MIN ? v : STORAGE_BOX_MAX_DEFAULT; }

// ---- Small utilities ----
/** Coerce to array: returns x if it is an Array, else [] (the game stores empty collections as {}). */
const arr = x => Array.isArray(x) ? x : [];

/** Normalize a string for searching: lowercase, drop everything but a-z0-9. */
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Show a transient message in #toast for ~2.6s; isError adds the error style. */
function toast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    t.className = 'toast';
  }, 2600);
}

/** Concatenate an array of Uint8Arrays into one new Uint8Array. */
function u8concat(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

