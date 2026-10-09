// ==== Names, blueprints and search index ====
// Parts that have no obtainable blueprint item in the game (special/unique parts).
const NO_BLUEPRINT_PTIDS = new Set([ 'PT_ARM_WP000_001', 'PT_ARM_WP011_0B1', 'PT_ARM_WP001_0B1', 'PT_ARM_WP023_001', 'PT_ARM_WP025_0A4', 'PT_MIL_HEAD_1001', 'PT_MIL_TOPS_1001', 'PT_MIL_BTM_1001', 'PT_MIL_HEAD_1002', 'PT_MIL_TOPS_1002', 'PT_MIL_BTM_1002' ]);

// Cache of blueprint item ids (ITMP_*) that are real, obtainable blueprints; reset on masters.db load.
let REAL_BLUEPRINT_SET = null;

/**
 * Build the set of genuine blueprint item ids: ITTP_RMAP items named ITMP_<x> (not the ...U variants)
 * whose part exists with a localized name, is not an upgrade-chain target, and is not blocklisted.
 */
function buildRealBlueprintSet() {
  const out = new Set;
  const nextTargets = new Set((AP.pts || []).map(p => p.nextptid).filter(Boolean));
  const ptById = {};
  for (const p of AP.pts || []) ptById[p.id] = p;
  for (const it of AP.items || []) {
    if (it.itemtype !== 'ITTP_RMAP' || !it.itemId.startsWith('ITMP_') || it.itemId.endsWith('U')) continue;
    const ptid = 'PT_' + it.itemId.slice(5);
    const p = ptById[ptid];
    if (!p || !resolveName(p.name)) continue;
    if (nextTargets.has(ptid)) continue;
    if (NO_BLUEPRINT_PTIDS.has(ptid) || BLUEPRINT_BLOCKLIST.has(ptid)) continue;
    out.add(it.itemId);
  }
  return out;
}

/** Is this item id (with or without the trailing U variant marker) a real blueprint? Builds the cache lazily. */
function isRealBlueprint(itemId) {
  if (!REAL_BLUEPRINT_SET) REAL_BLUEPRINT_SET = buildRealBlueprintSet();
  return REAL_BLUEPRINT_SET.has(String(itemId).replace(/U$/, ''));
}

/** True when a part cannot be obtained via a blueprint (listed explicitly or not obtainable at all). */
function hasNoBlueprint(ptid) {
  return NO_BLUEPRINT_PTIDS.has(ptid) || !isPartObtainable(ptid);
}

/** Look up a text key (e.g. a master name column) in the localized text table; null if absent. */
function resolveName(nameKey) {
  return nameKey && LOCDAT_INDEX[nameKey] || null;
}

/**
 * Build PT/ITEM/SKL/MSR/BST_INDEX and NAME_INDEX from AP + LOCDAT_INDEX.
 * Each record is a copy of the master row with the display name resolved (falling back to the id),
 * id and category set ('pt','item','skl','msr','bst'). Mushrooms and beasts also get cookedName
 * (the grilled/cooked name). Real blueprints are added to the search list as category 'bp' using the
 * part's name; raw ITMP_ items are not searchable as normal items. Also fills FLOOR_NAME_CACHE.
 * No-op until both masters.db and its texts are loaded. Called after every masters.db load.
 */
function tryBuildIndices() {
  if (!AP || !Object.keys(LOCDAT_INDEX).length) return;
  PT_INDEX = {};
  ITEM_INDEX = {};
  SKL_INDEX = {};
  MSR_INDEX = {};
  BST_INDEX = {};
  NAME_INDEX = [];
  for (const p of AP.pts || []) {
    const rec = Object.assign({}, p);
    rec.name = resolveName(p.name) || p.id;
    rec.id = p.id;
    rec.category = 'pt';
    PT_INDEX[p.id] = rec;
    NAME_INDEX.push({
      norm: norm(rec.name),
      name: rec.name,
      id: p.id,
      category: 'pt',
      ptType: p.type
    });
  }
  for (const it of AP.items || []) {
    const rec = Object.assign({}, it);
    let name = resolveName(it.name) || it.itemId;
    if (it.itemId.startsWith('ITMP_') && (!name || name === 'RMAP')) name = it.itemId;
    rec.name = name;
    rec.id = it.itemId;
    rec.category = 'item';
    ITEM_INDEX[it.itemId] = rec;
    if (!it.itemId.startsWith('ITMP_')) NAME_INDEX.push({
      norm: norm(name),
      name: name,
      id: it.itemId,
      category: 'item'
    });
    if (it.itemId.startsWith('ITMP_') && !it.itemId.endsWith('U') && isRealBlueprint(it.itemId)) {
      const ptRec = PT_INDEX[it.itemId.replace(/^ITMP_/, 'PT_')];
      const bpName = ptRec ? ptRec.name : name;
      NAME_INDEX.push({
        norm: norm(bpName),
        name: bpName,
        id: it.itemId,
        category: 'bp'
      });
    }
  }
  for (const s of AP.skls || []) {
    const rec = Object.assign({}, s);
    rec.name = resolveName(s.name) || s.id;
    rec.id = s.id;
    rec.category = 'skl';
    SKL_INDEX[s.id] = rec;
    NAME_INDEX.push({
      norm: norm(rec.name),
      name: rec.name,
      id: s.id,
      category: 'skl'
    });
  }
  for (const m of AP.msrs || []) {
    const rec = Object.assign({}, m);
    rec.name = resolveName(m.c_name) || m.id;
    rec.cookedName = resolveName(m.r_name) || rec.name;
    rec.id = m.id;
    rec.category = 'msr';
    MSR_INDEX[m.id] = rec;
    NAME_INDEX.push({
      norm: norm(rec.name),
      name: rec.name,
      id: m.id,
      category: 'msr'
    });
  }
  for (const b of AP.bsts || []) {
    const rec = Object.assign({}, b);
    rec.name = resolveName(b.name) || b.id;
    rec.cookedName = resolveName(b.bname) || rec.name;
    rec.id = b.id;
    rec.category = 'bst';
    BST_INDEX[b.id] = rec;
    NAME_INDEX.push({
      norm: norm(rec.name),
      name: rec.name,
      id: b.id,
      category: 'bst'
    });
  }
  for (const fa of AP.flrareas || []) {
    if (!FLOOR_NAME_CACHE[fa.flrid]) FLOOR_NAME_CACHE[fa.flrid] = resolveName(fa.name) || fa.flrid;
  }
  toast(`Ready: ${Object.keys(PT_INDEX).length} parts, ${Object.keys(ITEM_INDEX).length} items, ${Object.keys(SKL_INDEX).length} skills, ${Object.keys(MSR_INDEX).length} mushrooms, ${Object.keys(BST_INDEX).length} beasts indexed`);
}

/**
 * Search NAME_INDEX by name: prefix matches first, then substring matches, each sorted by shorter name.
 * @param {string} query free text (normalized with norm())
 * @param {string} [category] restrict to 'pt','item','bp','skl','msr','bst'
 * @param {number} [limit=30]
 * @param {string|string[]} [ptType] restrict parts to these master_part.type values
 */
function searchNames(query, category, limit, ptType) {
  const q = norm(query);
  if (!q) return [];
  const ptTypeArr = ptType ? Array.isArray(ptType) ? ptType : [ ptType ] : null;
  const starts = [], contains = [];
  for (const e of NAME_INDEX) {
    if (category && e.category !== category) continue;
    if (ptTypeArr && !ptTypeArr.includes(e.ptType)) continue;
    if (e.norm.startsWith(q)) starts.push(e); else if (e.norm.includes(q)) contains.push(e);
  }
  starts.sort((a, b) => a.name.length - b.name.length);
  contains.sort((a, b) => a.name.length - b.name.length);
  return starts.concat(contains).slice(0, limit || 30);
}

/**
 * Upgrade chain a part belongs to: walks nextptid links backwards to the first part, then forwards
 * collecting ids (50-step guards against cycles). Returns an ordered array of part ids.
 */
function chainOf(ptid) {
  const allIds = Object.keys(PT_INDEX);
  let root = ptid, guard = 0;
  while (guard++ < 50) {
    const parent = allIds.find(id => PT_INDEX[id].nextptid === root);
    if (!parent) break;
    root = parent;
  }
  const chain = [ root ];
  let cur = root;
  guard = 0;
  while (PT_INDEX[cur] && PT_INDEX[cur].nextptid && guard++ < 50) {
    cur = PT_INDEX[cur].nextptid;
    chain.push(cur);
  }
  return chain;
}

// ==== Starting a new editing session ====
/**
 * Initialize SAVE around a freshly loaded soul and prepare the UI.
 *
 * Normalizes soul collections to arrays (the game writes {} for empty ones), creates SAVE with default
 * overlay data from TEMPLATES (replaced afterwards by loadSaveFiles), guarantees at least one fighter,
 * infers freezer_level from the fighter count when missing, and picks the current fighter
 * (crntcid; the game stores none, the fighter with state USE is the one being played).
 * Also resets RAW_SAV_ROOT (loadSaveFiles sets it again), shows the app and disables download buttons
 * until a raw root exists. Ends with renderAll().
 * @param {object} soul adapted soul object (mutated in place)
 */
function startSave(soul) {
  soul.chrs = arr(soul.chrs);
  soul.dchrs = arr(soul.dchrs);
  soul.psskls = arr(soul.psskls);
  soul.quests = arr(soul.quests);
  soul.jointeams = arr(soul.jointeams);
  soul.mail = arr(soul.mail);
  soul.waiting = arr(soul.waiting);
  // empty VIP record when the save has none
  soul.vip = soul.vip || {
    vip_flag: 0,
    vip_type: 0,
    vip_pass_num: 0,
    oneday_vip_pass_num: 0,
    expired_time: 0,
    automatic_renewal: 0,
    friendship: 0
  };
  for (const c of soul.chrs) {
    c.pspts = arr(c.pspts);
    c.eqpts = arr(c.eqpts);
    c.eqskls = arr(c.eqskls);
  }
  for (const c of soul.dchrs) {
    c.pspts = arr(c.pspts);
    c.eqpts = arr(c.eqpts);
    c.eqskls = arr(c.eqskls);
    c.psmsrs = arr(c.psmsrs);
    c.psbsts = arr(c.psbsts);
    c.psitems = arr(c.psitems);
  }
  // SAVE shell: overlay keys start from TEMPLATES defaults; Storage Box starts with 30 empty slots ('-1' = no item)
  SAVE = {
    soul: soul,
    user: TEMPLATES.user_start && TEMPLATES.user_start.user || {},
    cl: {
      slots: Array.from({
        length: STORAGE_BOX_MIN
      }, (_, i) => ({
        slot: i,
        eptid: '-1',
        emsrid: '-1',
        ebstid: '-1',
        eitemid: '-1'
      })),
      pts: [],
      msrs: [],
      bsts: [],
      items: []
    },
    all_quests: arr(TEMPLATES.all_quests_start && TEMPLATES.all_quests_start.all_quests),
    playlog: arr(TEMPLATES.playlog_start && TEMPLATES.playlog_start.playlog),
    hitchart: TEMPLATES.hitchart_start && TEMPLATES.hitchart_start.hitchart || {},
    loading_announces: TEMPLATES.loading_announces_start && TEMPLATES.loading_announces_start.loading_announces || {},
    user_config_menu: TEMPLATES.user_config_menu_start && TEMPLATES.user_config_menu_start.user_config_menu || {},
    user_research: arr(TEMPLATES.user_research_start && TEMPLATES.user_research_start.user_research),
    presents: [],
    prison: [],
    fortsetting: [],
    dests: {
      revenge: []
    },
    teams: []
  };
  // a brand-new account needs at least one fighter
  // A save with no fighters still gets one on-screen placeholder so the Fighters tab can draw, but it is
  // marked __placeholder and buildRawSavRootFromSave() never writes it: its minimal shape is not one the
  // game accepts, and an unedited save must download unchanged.
  if (!soul.chrs.length) soul.chrs.push(Object.assign(freshCharacter(), { __placeholder: true }));
  // freezer_level missing: pick the lowest level whose capacity fits the fighters
  if (soul.freezer_level == null) {
    let inferred = 1;
    for (let lvl = 1; lvl <= freezerLevels(); lvl++) {
      if (freezerCapacity(lvl) >= soul.chrs.length) {
        inferred = lvl;
        break;
      }
      inferred = lvl;
    }
    soul.freezer_level = inferred;
  }
  if (SAVE.user && SAVE.user.soul !== undefined) delete SAVE.user.soul;
  // The game stores no "current fighter" id: the fighter you play is the one with state USE (the starred tab).
  if (!soul.crntcid) soul.crntcid = (soul.chrs.find(c => c && c.state === 'USE') || soul.chrs[0]).cid;
  if (!SAVE.playlog.length) SAVE.playlog.push(freshPlaylog());
  activeCharIdx = Math.max(0, soul.chrs.findIndex(c => c && c.cid === soul.crntcid));
  // raw root is attached later by loadSaveFiles
  RAW_SAV_ROOT = null;
  RAW_SAV_MAIN_UID = null;
  // reveal the app, keep downloads disabled until a raw root exists
  document.getElementById('app-locked').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('btn-download-sav').disabled = true;
  document.getElementById('btn-download-json').disabled = true;
  document.getElementById('btn-report').disabled = true;
  renderAll();
}

// ==== Blank-record factories ====
//
// freshPlaylog(): returns a zeroed playlog entry (one per account uid, counters for play time,
// mushrooms/beasts found, weapons/armor/materials obtained, floors moved, etc.).
// Used when a save has no playlog row to edit. The uid is left '' for the caller to fill in.
function freshPlaylog() {
  return {
    uid: '',
    total_play_time: 0,
    total_money: 0,
    total_mushroom_cnt: 0,
    total_mushroom_kind: 0,
    total_beast_cnt: 0,
    total_beast_kind: 0,
    total_get_weapon_cnt: 0,
    total_get_armor_cnt: 0,
    total_get_material_cnt: 0,
    total_research_cnt: 0,
    total_skill_cnt: 0,
    bivouac: 0,
    return_cnt: 0,
    max_floor: 1,
    move_floor_cnt: 0,
    elevator_cnt: 0,
    escalator_cnt: 0
  };
}

// freshCharacter(): a minimal editor-side fighter stub with a random 'char-xxxx' cid.
// NOTE: this is NOT what the game stores. The real "new fighter" shape (UUID cid, body, gasmask,
// freezer hanger, etc.) is built by newFighterRecord() further down; this older stub lacks many
// fields the game needs to boot.
function freshCharacter() {
  return {
    cid: 'char-' + Math.random().toString(16).slice(2),
    name: 'New Fighter',
    lvl: 1,
    type: 'BAL',
    grade: 1,
    hp: 100,
    exp: 0,
    money: 0,
    spirit: 0,
    pspts: [],
    eqpts: [],
    eqskls: [],
    psmsrs: [],
    psbsts: [],
    psitems: []
  };
}

// Which view the Fighters tab is in ('roster' by default).
let charViewMode = 'roster';

