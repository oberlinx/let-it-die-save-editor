// ==== masters.db loading (sql.js) ====
// Lazily loaded sql.js module (WASM SQLite); the script is fetched from cdnjs on first use.
let SQL_JS_MODULE = null;

// Base URL for sql-wasm.js and its .wasm file.
const SQLJS_CDN_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/';

/**
 * Load (once) and return the sql.js module. Injects a <script> tag if initSqlJs is not defined,
 * then calls initSqlJs with locateFile pointing at the CDN. Async; rejects with a friendly network error.
 */
async function ensureSqlJs() {
  if (SQL_JS_MODULE) return SQL_JS_MODULE;
  if (typeof initSqlJs === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SQLJS_CDN_BASE + 'sql-wasm.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load sql.js from cdnjs.cloudflare.com -- check your internet connection (this one-time library fetch needs it; nothing else in this tool does)'));
      document.head.appendChild(s);
    });
  }
  SQL_JS_MODULE = await initSqlJs({
    locateFile: file => SQLJS_CDN_BASE + file
  });
  return SQL_JS_MODULE;
}

// ---- Remember masters.db in the browser (IndexedDB) so it loads by itself next time ----
// IndexedDB location of the remembered file: database 'lid-editor', object store 'files', key 'masters.db'.
// --- remember masters.db in the browser (IndexedDB) so it loads by itself next time ---
const MASTERS_IDB = { db: 'lid-editor', store: 'files', key: 'masters.db' };
/** Open the IndexedDB database (creating the object store on first use). Promise of IDBDatabase. */
function mastersIdbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MASTERS_IDB.db, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(MASTERS_IDB.store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
/**
 * One IndexedDB operation on the masters record.
 * @param {'get'|'put'|'delete'} mode
 * @param {*} [value] stored for 'put' (an {name,saved,bytes} object)
 * Always closes the connection afterwards.
 */
async function mastersIdb(mode, value) {
  const idb = await mastersIdbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(MASTERS_IDB.store, mode === 'get' ? 'readonly' : 'readwrite');
      const st = tx.objectStore(MASTERS_IDB.store);
      const req = mode === 'get' ? st.get(MASTERS_IDB.key) : mode === 'put' ? st.put(value, MASTERS_IDB.key) : st.delete(MASTERS_IDB.key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally { idb.close(); }
}
/** Update the masters.db chip label, tooltip and "forget" button to show whether a copy is remembered (info = stored record or null). */
function setMastersRemembered(info) {
  const chip = document.getElementById('chip-masters');
  const lbl = document.getElementById('masters-label');
  const forget = document.getElementById('btn-forget-masters');
  if (lbl) lbl.textContent = info ? `1. masters.db (remembered${info.name ? ': ' + info.name : ''})` : '1. Load masters.db';
  if (forget) forget.style.display = info ? '' : 'none';
  if (chip) chip.title = info ? `Loaded automatically from this browser. Saved ${new Date(info.saved).toLocaleString()}. Click to load a different masters.db (e.g. after a game update).` : '';
}

// User picks a masters.db: load it, then try to remember it in IndexedDB (failure is non-fatal).
document.getElementById('file-masters').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const buf = await readFileAsArrayBuffer(f);
  const ok = await loadMastersBuffer(buf);
  if (ok) {
    try {
      const info = { name: f.name, saved: Date.now(), bytes: buf };
      await mastersIdb('put', info);
      setMastersRemembered(info);
    } catch (err) {
      console.warn('Could not remember masters.db in this browser:', err);
    }
  }
});

// "Forget" button: delete the remembered copy so it is not auto-loaded next time.
document.getElementById('btn-forget-masters').addEventListener('click', async e => {
  e.preventDefault();
  e.stopPropagation();
  try { await mastersIdb('delete'); } catch (err) { console.warn(err); }
  setMastersRemembered(null);
  toast('This browser will no longer load masters.db automatically');
});

// On startup: if a remembered masters.db exists in IndexedDB, load it automatically.
(async () => {
  let info = null;
  try { info = await mastersIdb('get'); } catch (err) { console.warn('IndexedDB unavailable, masters.db will not be remembered:', err); }
  if (!info || !info.bytes) return;
  setMastersRemembered(info);
  const ok = await loadMastersBuffer(info.bytes);
  if (ok) toast('masters.db loaded automatically. Now load your save.');
})();

/**
 * Open masters.db bytes with sql.js and populate the global AP tables plus LOCDAT_INDEX.
 * Required tables are read with SELECT *; optional tables (quest text, rewards, stamps, jackals,
 * magazines, ...) are loaded in a try/catch loop and become [] if missing in a modded/older db.
 * Also reads the stew (skill gacha) odds, resets lazily built caches, and calls tryBuildIndices().
 * @param {ArrayBuffer|Uint8Array} buf the SQLite file
 * @returns {Promise<boolean>} true on success (errors are shown via toast); the db handle is always closed
 */
async function loadMastersBuffer(buf) {
  let db = null;
  try {
    toast('Loading sql.js (one-time fetch from cdnjs)...');
    const SQLmod = await ensureSqlJs();
    db = new SQLmod.Database(new Uint8Array(buf));
    // run a query and return rows as plain objects keyed by column name
    function all(sql) {
      const res = db.exec(sql);
      if (!res.length) return [];
      const {columns: columns, values: values} = res[0];
      return values.map(row => {
        const o = {};
        for (let i = 0; i < columns.length; i++) o[columns[i]] = row[i];
        return o;
      });
    }
    // localized texts: key "<section>.<id>" -> English string
    LOCDAT_INDEX = {};
    for (const row of all(`SELECT sct, id, txt FROM master_text WHERE lang='int'`)) {
      LOCDAT_INDEX[`${row.sct}.${row.id}`] = row.txt;
    }
    // AP: core tables; items also get an itemId alias for the lowercase itemid column
    AP = {
      pts: all('SELECT * FROM master_part'),
      items: all('SELECT * FROM master_item').map(r => Object.assign({}, r, {
        itemId: r.itemid
      })),
      skls: all('SELECT * FROM master_skill'),
      msrs: all('SELECT * FROM master_mushroom'),
      bsts: all('SELECT * FROM master_beast'),
      tdmrank: all('SELECT * FROM master_tdm_rank'),
      ptarmtps: all('SELECT * FROM master_ptarm_type'),
      partresearch: all('SELECT * FROM master_part_research'),
      flrareas: all('SELECT id AS flrid, name FROM master_floor'),
      bodylvlsts: all('SELECT * FROM master_bodylvl_status_value'),
      quests: all('SELECT * FROM master_quest'),
      teams: all('SELECT * FROM master_team'),
      spirittank: all('SELECT * FROM master_spirit_tank_level'),
      safelevel: all('SELECT * FROM master_safe_level'),
      bodylvlexp: all('SELECT * FROM master_bodylvl_exp'),
      constInt: all('SELECT * FROM master_const_int'),
      constFloat: all('SELECT * FROM master_const_float'),
      atkattr: all('SELECT * FROM master_part_atkattr'),
      bodydetail: all('SELECT * FROM master_body_detail')
    };
    // optional tables: tolerate absence
    for (const [key, sql] of [['questParamText', 'SELECT qid, no, val FROM master_quest_param_text'], ['questParamDesc', 'SELECT qid, no, val FROM master_quest_param_desc_text'], ['rewards', 'SELECT * FROM master_reward'], ['expertLvl', 'SELECT ptarmtp, lvl, abp FROM master_expert_lvl_reward'], ['stampBonus', 'SELECT * FROM master_stamp_bonus'], ['stampFloors', 'SELECT * FROM master_stamp'], ['hvnFloors', "SELECT id, areaid, no, mbsmin, mbsmax, mbslvlmin, mbslvlmax FROM master_floor WHERE stgid = 'S_HVN'"], ['jackals', 'SELECT * FROM master_jackal'], ['magazines', 'SELECT * FROM master_magazine'], ['magazineBonus', 'SELECT * FROM master_magazine_bonus'], ['hvnBossDrops', "SELECT d.flrid, d.areaid, d.refareaid, d.type, d.grp, d.freq FROM master_floor_drop_gen d JOIN master_floor f ON f.id = d.flrid AND f.areaid = d.areaid WHERE f.stgid = 'S_HVN' AND f.mbsmax > 0 AND (d.type IN ('PTGENTP_TRBOX_L', 'PTGENTP_TRBOX_SPXL_RARE', 'PTGENTP_SPXL', 'PTGENTP_TRZAKO') OR d.type LIKE 'PTGENTP_MBOSS%')"], ['questCats', 'SELECT * FROM master_quest_category'], ['bagGen', 'SELECT * FROM master_mysterybag_content_gen'], ['bagGenOdds', "SELECT * FROM master_mysterybag_content_gen_odds WHERE odds_id = (SELECT odds_id FROM master_mysterybag_content_odds ORDER BY expires DESC LIMIT 1)"], ['boxGen', 'SELECT * FROM master_deathbox_content_gen'], ['hubCustom', 'SELECT * FROM master_hubcustomize'], ['floorInfo', 'SELECT id, sname, stgid, stgpfx, name FROM master_floor'], ['freezer', 'SELECT * FROM master_freezer'], ['bodies', 'SELECT id, gender FROM master_body'], ['gasmasks', 'SELECT id, gender FROM master_gasmask'], ['fortWhistle', 'SELECT * FROM master_fort_whistle'], ['hvnBossAreas', 'SELECT flrid, refareaid, freq FROM master_ref_boss_area_setting'], ['hvnBossKis', "SELECT areaid, kis FROM master_area_setting_unit WHERE stgid = 'S_HVN' AND unit = 'HEAVEN_BOSS'"]]) {
      try { AP[key] = all(sql); } catch (err) { AP[key] = []; console.warn(`${key} not available in this masters.db:`, err); }
    }
    // Stew (skill gacha) odds: the table id may be redirected through master_skillgacha.odds_id
    AP.stewOdds = [];
    AP.stewOddsId = STEW_GACHA_ID;
    try {
      const g = all(`SELECT odds_id FROM master_skillgacha WHERE id='${STEW_GACHA_ID}'`);
      if (g.length && g[0].odds_id) AP.stewOddsId = String(g[0].odds_id);
      AP.stewOdds = all(`SELECT sklid, odds FROM master_skillgacha_odds WHERE id='${AP.stewOddsId.replace(/'/g, "''")}' AND odds>0`).map(r => ({ sklid: r.sklid, odds: Number(r.odds) }));
    } catch (err) {
      console.warn('Stew odds not available in this masters.db:', err);
    }
    // invalidate caches derived from the previous masters.db
    STAMP_ELIGIBLE_SET = null;
    OBTAINABLE_SET = null;
    ALLOWED_RESEARCH_SET = null;
    PREV_PT_MAP = null;
    REAL_BLUEPRINT_SET = null;
    markChip('chip-masters', true);
    toast(`masters.db loaded: ${AP.pts.length} parts, ${AP.items.length} items, ${AP.skls.length} skills, ${AP.msrs.length} mushrooms, ${AP.bsts.length} beasts, ${AP.teams.length} teams, ${Object.keys(LOCDAT_INDEX).length} text keys`);
    tryBuildIndices();
    return true;
  } catch (err) {
    toast('Failed to load masters.db: ' + err.message, true);
    return false;
  } finally {
    if (db) db.close();
  }
}

// Save file input: load the chosen file(s).
document.getElementById('file-save').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  e.target.value = '';
  await loadSaveFiles(files);
});
/**
 * Load one or more save files (picker or a kept download copy) into the editor.
 *
 * Needs masters.db first. Each file is either a BRG .sav or a decompressed .json dump; both go through
 * adaptFullDumpToLegacyShape. When several files are given, the most common account id is treated as
 * the main account; files from other accounts are ignored for soul/overlay data when possible. The first
 * matching file with a soul is used, then startSave() seeds SAVE and overlay keys (user, cl, research,
 * prison, teams, ...) are copied in from the files. Finally sets RAW_SAV_ROOT, enables the download
 * buttons, snapshots the original for the review diff, runs the health check and renders.
 * Errors surface via toast; unreadable files are skipped and reported.
 * @param {File[]} files
 */
// Load one or more save files (from the file picker, or a copy kept in Download history).
async function loadSaveFiles(files) {
  if (!files.length) return;
  if (!AP) {
    toast('Load masters.db first, then load your save', true);
    return;
  }
  try {
    // read and adapt each file
    const parsed = [];
    const readErrors = [];
    let repairedChars = 0;
    for (const f of files) {
      try {
        const buf = await readFileAsArrayBuffer(f);
        const bytes = new Uint8Array(buf);
        if (isBrgSav(bytes)) {
          parseBrgSav.lastRepairCount = 0;
          const root = await parseBrgSav(bytes);
          repairedChars += parseBrgSav.lastRepairCount || 0;
          parsed.push({
            file: f,
            obj: adaptFullDumpToLegacyShape(root)
          });
        } else {
          const root = parseSaveJsonText(new TextDecoder('utf-8').decode(bytes));
          repairedChars += parseSaveJsonText.lastRepairCount || 0;
          if (!looksLikeFullDump(root)) throw new Error('not a LET IT DIE save -- expected a .sav or the .json made by decompressing one');
          parsed.push({
            file: f,
            obj: adaptFullDumpToLegacyShape(root)
          });
        }
      } catch (err) {
        console.warn(`Skipped ${f.name}, could not read as a save file:`, err);
        // plain-language reason instead of a raw parser / decompression error
        const why = /not a LET IT DIE save/.test(err.message) ? err.message
          : f.size === 0 ? 'the file is empty'
          : isBrgSav(new Uint8Array(await readFileAsArrayBuffer(f).catch(() => new ArrayBuffer(0))).slice(0, 16)) ? 'the save file looks damaged and could not be unpacked (the technical reason is in the browser console)'
          : 'not a LET IT DIE save (expected brggame.sav, or the .json made by decompressing one)';
        readErrors.push(`${f.name}: ${why}`);
      }
    }
    // account id of a parsed file, used to detect files from a different account
    function fileAccountId(obj) {
      if (!obj) return null;
      return obj.accountId != null ? String(obj.accountId) : obj.user && obj.user.acid != null ? String(obj.user.acid) : null;
    }
    // pick the account id that occurs most often as "main"
    const idCounts = {};
    for (const {obj: obj} of parsed) {
      const id = fileAccountId(obj);
      if (id != null) idCounts[id] = (idCounts[id] || 0) + 1;
    }
    let mainId = null, mainCount = 0;
    for (const id in idCounts) {
      if (idCounts[id] > mainCount) {
        mainId = id;
        mainCount = idCounts[id];
      }
    }
    function matchesMain(obj) {
      const id = fileAccountId(obj);
      return id == null || mainId == null || id === mainId;
    }
    const mismatched = parsed.filter(({obj: obj}) => !matchesMain(obj)).map(({file: file}) => file.name);
    // choose the soul source: prefer a main-account file, then any file
    let soul = null, soulSource = null;
    for (const {file: file, obj: obj} of parsed) {
      if (!matchesMain(obj)) continue;
      if (obj && obj.soul) {
        soul = obj.soul;
        soulSource = file.name;
        break;
      }
      if (obj && obj.user && obj.user.soul) {
        soul = obj.user.soul;
        soulSource = file.name;
        break;
      }
    }
    if (!soul) {
      for (const {file: file, obj: obj} of parsed) {
        if (obj && obj.soul) {
          soul = obj.soul;
          soulSource = file.name;
          break;
        }
        if (obj && obj.user && obj.user.soul) {
          soul = obj.user.soul;
          soulSource = file.name;
          break;
        }
      }
    }
    if (!soul && readErrors.length) {
      toast('Could not read save -- ' + readErrors.join(' | '), true);
      return;
    }
    if (!soul) {
      toast('None of the selected files have a "soul" (either top-level, or nested under "user") -- soul is required', true);
      return;
    }
    if (repairedChars) console.warn(`Loaded with ${repairedChars} corrupt character(s) escaped in string fields`);
    // seed SAVE from the soul, then remember each fighter's original Death Bag capacity (see ORIG_BAG_CAP)
    startSave(soul);
    DATE_RULES = [];
    ORIG_BAG_CAP = {};
    for (const c of arr(soul.chrs)) if (c && c.cid) ORIG_BAG_CAP[c.cid] = deathBagCapacity(c);
    const soulEntry = parsed.find(({file: file}) => file.name === soulSource);
    if (soulEntry && soulEntry.obj && soulEntry.obj.__rawSavRoot) {
      RAW_SAV_ROOT = soulEntry.obj.__rawSavRoot;
      RAW_SAV_MAIN_UID = soulEntry.obj.__rawSavMainUid;
      applyPlatformDefaults();
      reviewSnapshot(soulEntry.file);
      document.getElementById('btn-download-sav').disabled = false;
      document.getElementById('btn-download-json').disabled = false;
      document.getElementById('btn-report').disabled = false;
    }
    // keys other than soul that are copied from the loaded files into SAVE
    const overlayKeys = [ 'user', 'cl', 'all_quests', 'playlog', 'hitchart', 'loading_announces', 'user_config_menu', 'user_research', 'presents', 'prison', 'fortsetting', 'dests', 'teams' ];
    const found = {};
    for (const {obj: obj} of parsed) {
      if (!matchesMain(obj)) continue;
      for (const key of overlayKeys) {
        if (found[key] === undefined && obj && obj[key] !== undefined) found[key] = obj[key];
      }
    }
    for (const {obj: obj} of parsed) {
      for (const key of overlayKeys) {
        if (found[key] === undefined && obj && obj[key] !== undefined) found[key] = obj[key];
      }
    }
    // overlay those keys, then normalize collections to arrays
    let loadedExtra = 0;
    for (const key of overlayKeys) {
      if (found[key] !== undefined) {
        SAVE[key] = found[key];
        loadedExtra++;
      }
    }
    if (SAVE.user && SAVE.user.soul !== undefined) delete SAVE.user.soul;
    SAVE.user_research = arr(SAVE.user_research);
    SAVE.all_quests = arr(SAVE.all_quests);
    SAVE.presents = arr(SAVE.presents);
    SAVE.prison = arr(SAVE.prison);
    SAVE.fortsetting = arr(SAVE.fortsetting);
    SAVE.dests = SAVE.dests || {};
    SAVE.dests.revenge = arr(SAVE.dests.revenge);
    SAVE.teams = arr(SAVE.teams);
    SAVE.cl = SAVE.cl || {};
    SAVE.cl.slots = arr(SAVE.cl.slots);
    SAVE.cl.pts = arr(SAVE.cl.pts);
    SAVE.cl.msrs = arr(SAVE.cl.msrs);
    SAVE.cl.bsts = arr(SAVE.cl.bsts);
    SAVE.cl.items = arr(SAVE.cl.items);
    // snapshot research state for later change detection, then run the health check and draw the UI
    try { RESEARCH_GAME_SKIP = researchGameSkips(SAVE.user_research); } catch (err) { RESEARCH_GAME_SKIP = new Map(); }
    RESEARCH_KNOWN = researchKnownSnapshot(SAVE.user_research);
    HEALTH_LOAD = { repairedChars: repairedChars };
    HEALTH.open = null;
    try { runSaveCheck(); } catch (err) { console.warn('Save check failed:', err); }
    renderAll();
    markChip('chip-save', true);
    toast(`Loaded ${soulSource}`);
  } catch (err) {
    toast('Failed to load save: ' + err.message, true);
  }
}

