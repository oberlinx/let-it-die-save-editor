// (banner below describes UI pack 2: sticky nav, change dots, jump to problem, recent saves, masters.db check, tips)
// ===========================================================================
// UI PACK 2 (2026-10-08): sticky nav, changed-tab dots, jump to problem, recent saves, masters.db mismatch check, help tips
// ===========================================================================

// ---- sticky tab bar: keep the header height in a CSS variable so the nav can stick right under it ----
// uiTrackHeader(): publish the sticky header height as CSS variable --hdrh so the tab bar sticks under it.
function uiTrackHeader() {
  const h = document.querySelector('header'); if (!h) return;
  const set = () => document.documentElement.style.setProperty('--hdrh', (getComputedStyle(h).position === 'sticky' ? h.offsetHeight : 0) + 'px');
  set(); window.addEventListener('resize', set);
  if (window.ResizeObserver) new ResizeObserver(set).observe(h);
}

// ---- changed-tab dots ----
// Review section title -> tab id, used to put a "changed" dot on tabs.
const UI_SECTION_TAB = {
  'Account': 'account', 'Weapon Mastery': 'account', 'Fighters': 'fighters', 'Armor Skins (unlocked by R&D at +4)': 'fighters', 'Decal stock': 'decals', 'Research': 'research',
  'Stamp Rally': 'rally', 'Collection': 'collection', 'Jackals': 'jackals', 'Stews': 'stews', 'Location': 'location', 'Boss floor lock': 'location', 'Defense': 'defense',
  'Reward Box': 'rewards', 'Storage Box': 'storage', 'Waiting Room': 'hub'
};
// uiDirtyTabs() -> Set of tab ids with changes (from review sections and pending operations).
function uiDirtyTabs() {
  const set = new Set();
  for (const s of UI.changes || []) {
    if (!s.lines.length) continue;
    if (s.title === 'Account') { for (const l of s.lines) set.add(/^(Express|VIP|30-Day|1-Day)/.test(l) ? 'vip' : 'account'); continue; }
    const t = UI_SECTION_TAB[s.title]; if (t) set.add(t);
  }
  try {
    const r = RAW_SAV_ROOT;
    if (r) {
      if (FLOOR_MOVE.root === r && FLOOR_MOVE.target) set.add('location');
      if (BOSS_LOCK.root === r && BOSS_LOCK.mode) set.add('location');
      if (LUCKY.root === r && LUCKY.seed) set.add('location');
      if (RUN_END.root === r && RUN_END.on) set.add('location');
      if (REWIND.root === r && REWIND.on) set.add('location');
      if (FREE_CONT.root === r && FREE_CONT.on) set.add('vip');
    }
  } catch (e) { /* ignore */ }
  return set;
}
// uiApplyDots(): mark tab and group buttons as changed.
function uiApplyDots() {
  const d = SAVE && RAW_SAV_ROOT ? uiDirtyTabs() : new Set();
  document.querySelectorAll('[data-tab-btn]').forEach(b => { const on = d.has(b.dataset.tabBtn); b.classList.toggle('dirty', on); if (on) b.title = 'Changed since you loaded the save'; else if (b.title === 'Changed since you loaded the save') b.removeAttribute('title'); });
  document.querySelectorAll('.grpbtn').forEach(b => { const g = TAB_GROUPS.find(x => x.id === b.dataset.grp); const on = !!g && g.tabs.some(t => d.has(t)); b.classList.toggle('dirty', on); });
}

// ---- jump to problem ----
// uiJumpProblem(): cycle through Save check problems/warnings, opening the panel on the relevant tab and flashing the row.
function uiJumpProblem() {
  const it = (HEALTH && HEALTH.items) || [];
  const idx = []; it.forEach((x, i) => { if (x.level === 'problem' || x.level === 'warning') idx.push(i); });
  if (!idx.length) { toast('Save check: nothing to fix'); return; }
  UI.jumpAt = ((UI.jumpAt == null ? -1 : UI.jumpAt) + 1) % idx.length;
  const i = idx[UI.jumpAt], item = it[i];
  HEALTH.open = true;
  const panel = document.getElementById('health-panel'); if (panel) panel.open = true;
  if (item.tab) { const b = document.querySelector(`[data-tab-btn="${item.tab}"]`); if (b && activeTab !== item.tab) b.click(); }
  setTimeout(() => {
    const row = document.querySelectorAll('#health-panel .healthRow')[i]; if (!row) return;
    window.scrollTo({ top: 0 });
    row.classList.add('flashHit'); setTimeout(() => row.classList.remove('flashHit'), 2300);
  }, 90);
}

// ==== Recent saves (IndexedDB) ====
// ---- recent saves (kept only in this browser) ----
// Recent-saves store: separate DB, at most 4 files, each at most 40 MB, with an opt-out preference key.
const REC_IDB = { db: 'lid-editor-recent', store: 'files' }, REC_MAX = 4, REC_MAX_BYTES = 40 * 1048576, REC_PREF = 'lid.recent.on';
// recOn()/recOpenDb()/recTx(): preference and the same promise-wrapped IndexedDB transaction pattern as the history store.
function recOn() { return uiLsGet(REC_PREF) !== '0'; }
function recOpenDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('this browser has no IndexedDB')); return; }
    const req = indexedDB.open(REC_IDB.db, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(REC_IDB.store, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
async function recTx(mode, fn) {
  const idb = await recOpenDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(REC_IDB.store, mode); let out;
      Promise.resolve(fn(tx.objectStore(REC_IDB.store), v => { out = v; })).catch(reject);
      tx.oncomplete = () => resolve(out); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('aborted'));
    });
  } finally { idb.close(); }
}
// Recent-saves CRUD helpers (list newest first, get, delete, clear).
const recList = () => recTx('readonly', (st, done) => { const r = st.getAll(); r.onsuccess = () => done((r.result || []).sort((a, b) => b.when - a.when)); });
const recGet = id => recTx('readonly', (st, done) => { const r = st.get(id); r.onsuccess = () => done(r.result || null); });
const recDelete = id => recTx('readwrite', st => { st.delete(id); });
const recClear = () => recTx('readwrite', st => { st.clear(); });
// recRecord(): remember the loaded save file (skipped when too large, or when it was itself opened from history/recent). An identical file just gets its timestamp refreshed.
async function recRecord() {
  if (!recOn() || !ORIG_SAVE.file || !RAW_SAV_ROOT) return;
  const f = ORIG_SAVE.file;
  if (f.size > REC_MAX_BYTES || /^(history|recent):/.test(f.__src || '')) return;
  try {
    const account = (RAW_SAV_ROOT.user && RAW_SAV_ROOT.user.nm) || '';
    const base = { name: f.name, size: f.size, mtime: f.lastModified || 0, account, fighters: histFighters(), platform: isPsSave() ? 'PS' : 'PC', when: Date.now() };
    const all = await recList();
    const same = all.find(e => e.name === f.name && e.size === f.size && e.mtime === base.mtime && e.account === account);
    if (same) { await recTx('readwrite', st => { st.put(Object.assign({}, same, { when: base.when })); }); return; }
    const data = new Blob([ await f.arrayBuffer() ]);
    await recTx('readwrite', st => { st.add(Object.assign({ data }, base)); });
    for (const e of (await recList()).slice(REC_MAX)) await recDelete(e.id);
  } catch (err) { console.warn('Recent saves:', err); }
}
// uiOpenRecent(): overlay to reopen a remembered save (requires masters.db loaded; confirms if there are unsaved edits).
async function uiOpenRecent() {
  uiCloseOverlay();
  const ov = document.createElement('div'); ov.className = 'uiOverlay'; ov.id = 'ui-overlay';
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) uiCloseOverlay(); });
  let list = [], err = '';
  try { list = await recList(); } catch (e) { err = e.message; }
  const row = e => `<div class="listRow" style="flex-wrap:wrap; gap:6px; align-items:flex-start;"><div style="flex:1; min-width:240px;"><div><b>${UI_ESC(e.name)}</b></div>
      <div class="id">${UI_ESC(new Date(e.when).toLocaleString())} · ${UI_ESC(e.account || '—')} · ${e.platform || ''} · ${e.fighters} fighter${e.fighters === 1 ? '' : 's'} · ${histSize(e.size || 0)}</div></div>
      <div class="toolbar" style="margin:0;"><button class="subtle" data-rec-open="${e.id}">Open in editor</button><button class="subtle" data-rec-del="${e.id}" title="Remove from this list">✕</button></div></div>`;
  ov.innerHTML = `<section class="block"><div class="block-head"><div><div class="eyebrow">Kept in this browser</div><h2>Recent saves</h2></div><div class="id">${list.length} of ${REC_MAX}</div></div><div class="block-body">
    <div class="capNote" style="margin-top:0;">The last ${REC_MAX} saves you loaded, as you loaded them, so you can reopen one without finding the file again. They stay only in this browser and nothing is uploaded.</div>
    <label style="cursor:pointer; display:inline-block; margin:4px 0 8px;"><input type="checkbox" id="rec-on" ${recOn() ? 'checked' : ''} style="width:auto; margin-right:6px;">Remember the saves I load</label>
    ${err ? `<div class="capNote">Recent saves aren't available in this browser (${UI_ESC(err)}). Private windows often block them.</div>` : ''}
    <div class="listBlock" style="max-height:50vh; overflow:auto;">${list.length ? list.map(row).join('') : '<div style="padding:10px; color:var(--text-faint); font-size:12px;">Nothing yet. Saves you load appear here.</div>'}</div>
    <div class="toolbar" style="margin-top:10px;">${list.length ? '<button class="subtle" id="rec-clear">Forget all</button>' : ''}<button class="subtle" id="rec-close">Close</button></div></div></section>`;
  document.getElementById('rec-close').addEventListener('click', uiCloseOverlay);
  document.getElementById('rec-on').addEventListener('change', e => { uiLsSet(REC_PREF, e.target.checked ? '1' : '0'); toast(e.target.checked ? 'Loaded saves will be remembered' : 'Loaded saves will no longer be remembered (the list stays until you forget it)'); });
  const clr = document.getElementById('rec-clear');
  if (clr) clr.addEventListener('click', async () => { if (!confirm('Forget every recent save? Your files are not affected.')) return; try { await recClear(); } catch (e) { /* ignore */ } uiOpenRecent(); });
  ov.querySelectorAll('[data-rec-del]').forEach(b => b.addEventListener('click', async () => { try { await recDelete(Number(b.dataset.recDel)); } catch (e) { /* ignore */ } uiOpenRecent(); }));
  ov.querySelectorAll('[data-rec-open]').forEach(b => b.addEventListener('click', async () => {
    const e = list.find(x => x.id === Number(b.dataset.recOpen)); if (!e) return;
    if (!AP) { toast('Load masters.db first', true); return; }
    if (uiDirty() && !confirm('Open this save? It replaces the save you are editing; edits you have not downloaded are lost.')) return;
    const full = await recGet(e.id); if (!full || !full.data) { toast('That copy is gone', true); return; }
    uiCloseOverlay();
    const file = new File([ await full.data.arrayBuffer() ], e.name, { type: 'application/octet-stream', lastModified: e.mtime || Date.now() });
    file.__src = 'recent:' + e.id;
    await loadSaveFiles([ file ]);
  }));
}

// ==== masters.db mismatch check ====
// ---- masters.db mismatch: ids in the save that the loaded masters.db doesn't know ----
// uiMastersMismatch() -> { n, total, miss }: counts parts, decals and beasts used by the save that the loaded masters.db does not know.
function uiMastersMismatch() {
  const soul = (SAVE && SAVE.soul) || {}, miss = { parts: new Set(), decals: new Set(), beasts: new Set() }, seen = new Set();
  const part = id => { if (!id) return; seen.add('p' + id); if (!PT_INDEX[id]) miss.parts.add(id); };
  const decal = id => { if (!id) return; seen.add('d' + id); if (!SKL_INDEX[id]) miss.decals.add(id); };
  const beast = id => { if (!id) return; seen.add('b' + id); if (!BST_INDEX[id]) miss.beasts.add(id); };
  for (const c of arr(soul.chrs)) {
    if (!c || c.state === 'ENEMY' || c.state === 'DUMMY') continue;
    for (const p of arr(c.pspts)) part(p && p.ptid);
    for (const e of arr(c.eqskls)) decal(e && e.sklid);
    for (const b of arr(c.psbsts)) beast(b && b.bstid);
  }
  for (const s of arr(soul.psskls)) decal(s && s.id);
  for (const r of arr(SAVE.user_research)) part(r && r.ptid);
  const n = miss.parts.size + miss.decals.size + miss.beasts.size;
  return { n, total: seen.size, miss };
}
// uiMastersCheckItem() -> Save check message (HTML string) or null. Only reports when at least 5 ids and 2% of those used are unknown.
function uiMastersCheckItem() {
  const m = uiMastersMismatch();
  if (m.n < 5 || m.n / Math.max(1, m.total) < 0.02) return null;
  const sample = [ ...m.miss.parts, ...m.miss.decals, ...m.miss.beasts ].slice(0, 4).map(x => escapeHtml(x)).join(', ');
  return `The loaded masters.db doesn't know ${m.n} of the ${m.total} parts, decals and beasts this save uses (for example ${sample}). It is probably an older or different masters.db than the one this save was made with. Names, limits and Funshots may be wrong, and edits could write values the game doesn't accept. Load the masters.db from your game's current Content folder (a PlayStation save needs a PC masters.db from a matching game version).`;
}

// ==== Help tips ====
// ---- help tips on the less obvious settings ----
// Tooltip texts per tab keyed by the start of a label/heading; values may be functions so limits from masters.db are read lazily.
const UI_TIPS = {
  account: { 'TDM Points': () => `Tokyo Death Metro points. Your TDM rank is worked out from these. Highest allowed: ${tdmPointMax().toLocaleString()} (from masters.db).`,
    'Bank Level': 'How much the bank can hold. The held amount can not go above the cap for this level; the game drops anything over it.',
    'Bloodnium': 'The highest value the game allows is shown in brackets (from masters.db).',
    'Weapon Mastery': 'Setting a level also sets the mastery points behind it, which is what the game reads.' },
  vip: { 'Express Pass': 'None, 1-Day or 30-Day. Changing it also sets the matching pass type, and the VIP level when that matched.',
    'Auto-renew': 'Whether the game renews the pass itself when it runs out.',
    'Expires': 'The date the pass ends. The game can not store dates after 2037, so the editor only accepts 2020 to 2037.',
    'Free Continues': 'How many free continues the continue screen offers each day. Confirmed in game.' },
  dates: { 'Use this PC': 'Every date in the save is compared with this time to spot dates in the future, past 2038 or overflowed.' },
  fighters: { 'Limit Break': 'Raises the ceiling for stats, decal slots, Death Bag and rage. Each class has its own limit break levels (from masters.db).',
    'Grade': 'Fighter grade (from masters.db). Grade and Limit Break together set how high stats and slots can go.',
    'Level (from stats)': 'Worked out from the stat levels, so it can not be set directly.',
    'Decal Slots': 'How many decals the fighter can wear. The range is the lowest and highest possible for this grade and limit break.',
    'Death Bag': 'Slots for items carried in a run. The range is the limit for this fighter\'s grade and limit break.',
    'Rage Bars': 'How many rage bars the fighter has. The range comes from masters.db.' },
  research: { 'Research Stamp': 'Each researched part adds its Funshot once (Slash and Shoot +0.4, Hit +0.8, Head, Body and Legs +0.2). Amounts come from masters.db.',
    'Include PS-only': 'Parts that only exist on PlayStation. Leave off for a PC save unless your masters.db is modded to include them.' },
  decals: { 'Include PS-only': 'Decals that only exist on PlayStation. Leave off for a PC save unless your masters.db is modded to include them.' },
  stews: { 'Seed (optional': 'The same seed gives the same rolls every time. Leave it blank for random rolls.',
    'Queue length': 'How many pulls the stew queue holds. Blank keeps the current length.' },
  location: { 'Show rewards': 'Shows what each floor\'s chests will hold. Off by default so you can stay surprised.',
    'End the run (confirmed': 'Ends the run when you download: the fighter goes back to the Waiting Room. Confirmed in game.',
    'Boss floor lock': 'Plans the boss floors ahead of the fighter so they are the kind you pick. Applied when you download.',
    'Go back to the last boss floor': 'For a run that crashed on a normal floor: puts the fighter back on the last boss floor. Confirmed in game on regular Heaven.' },
  rewards: { 'Reward Box': () => `Rewards sent here arrive in the game's reward box. The game starts to complain above ${constIntOf('PRESENT_BOX_LIMIT', 50)} entries (from masters.db).` },
  storage: { 'Capacity': () => `Storage Box slots, added in steps of ${storageBoxStep()} up to ${storageBoxMax().toLocaleString()} (from masters.db).` },
  defense: { 'Alarm': 'The Tokyo Death Metro defense alarm: how long it runs and which defender carries it.' },
  rally: { 'Stamp Rally': 'Each floor is not stamped, perfect, or off by 1 to 16 (how far the stamp landed from perfect, as the game stores it).' },
  bags: { 'Lost Bags': 'Mystery bags from Tokyo Death Metro. Each rarity has its own reward pool; you can set a slot or reroll from the game\'s odds.' },
  boxes: { 'Death Boxes': 'Boxes waiting to be opened. Open one now, change or reroll its reward, or add and remove boxes.' },
  jackals: { 'Jackals': 'Each Jackal carries one reward. The game re-rolls all of them whenever a new floor is generated, so edits only hold on the floor you save on.' },
  graves: { 'Dead Fighter Archive': 'View only: dead fighters, yours and other players\'.' },
  photos: { 'Screenshots': 'View and export only. They can not be deleted because the game refers to them.' },
  compare: { 'Compare & Copy': 'Load a second save, see what differs, and copy ticked parts into the save you are editing.' },
  raw: { 'Raw data': 'Read-only view of the whole save the way the game stores it. For advanced users.' },
  jdiff: { 'JSON compare': 'Read-only, field by field comparison of two saves the way the game stores them. For advanced users.' }
};
// uiAddTips(): append a "?" tip bubble to matching labels once.
function uiAddTips() {
  for (const tab in UI_TIPS) {
    const panel = document.querySelector(`[data-tab-panel="${tab}"]`); if (!panel) continue;
    const keys = Object.keys(UI_TIPS[tab]);
    panel.querySelectorAll('label, h2, .eyebrow, summary').forEach(el => {
      if (el.dataset.tipDone || el.closest('table')) return;
      const tx = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const k = keys.find(x => tx.startsWith(x.toLowerCase())); if (!k) return;
      el.dataset.tipDone = '1';
      let t = UI_TIPS[tab][k]; try { if (typeof t === 'function') t = t(); } catch (e) { return; }
      if (!t) return;
      const s = document.createElement('span'); s.className = 'tip'; s.tabIndex = 0; s.setAttribute('role', 'note'); s.setAttribute('data-tip', t); s.setAttribute('aria-label', t); s.textContent = '?';
      el.appendChild(s);
    });
  }
}

// ==== First-run tour ====
// ---- first-run tour -------------------------------------------------------------------------------
// localStorage key set to 'done' when the tour was finished or skipped.
const TOUR_KEY = 'lid.tour';
// Tour steps: CSS selector to highlight (null = centered), title, text and optional fallback shown when the target is hidden.
const TOUR_STEPS = [
  { sel: '#chip-masters', title: 'Load masters.db', text: "Start here. Load the masters.db from your game's Content folder. It tells the editor what the game allows, so edits stay in range. PlayStation saves need a PC masters.db." },
  { sel: '#chip-save', title: 'Load your save', text: 'Then load your save, or drag a .sav anywhere on the page. PlayStation saves must be decrypted first; the 🎮 button next to it explains how.' },
  { sel: '.stickyNav', title: 'The tabs', text: 'Four sections hold the tabs: Account, Fighters, Run & Floors and Tools. A dot on a tab means you changed something there.', fallback: 'They appear here once a save is loaded.' },
  { sel: '#qs', title: 'Search', text: "Press Ctrl+K and type what you're after, such as 'bloodnium' or 'storage', and it takes you straight to it." },
  { sel: '#statusbar', title: 'Status bar', text: 'This counts your unsaved changes and shows the Save check. Changes lists every edit with an Undo for each, and the Save check button jumps to the next problem.', fallback: 'It appears at the bottom once a save is loaded.' },
  { sel: '#btn-download-sav', title: 'Download safely', text: 'Download shows a full review of what changed before anything is saved. The editor keeps a copy of your original, so you can always go back. Keep your own backup too.' },
  { sel: null, title: "That's it", text: 'Press ? any time for shortcuts, or hover the small ? circles for help on odd settings. You can replay this tour from the header.' }
];
// Tour state: current step index and whether it is showing.
const TOUR = { i: 0, on: false };
// uiTourVisible(el): element exists and is actually rendered.
function uiTourVisible(el) { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden'; }
// uiTourShow(): render the current step with a highlight hole and a card placed near the target, kept on screen.
function uiTourShow() {
  const step = TOUR_STEPS[TOUR.i]; if (!step) return uiTourEnd(true);
  let root = document.getElementById('ui-tour');
  if (!root) { root = document.createElement('div'); root.id = 'ui-tour'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Quick tour'); document.body.appendChild(root); }
  const el = step.sel ? document.querySelector(step.sel) : null, vis = uiTourVisible(el);
  if (vis) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const last = TOUR.i === TOUR_STEPS.length - 1, n = TOUR_STEPS.length;
  const text = UI_ESC(step.text) + (!vis && step.fallback ? ' <i>(' + UI_ESC(step.fallback) + ')</i>' : '');
  root.innerHTML = '<div class="tourShade"></div><div class="tourHole"></div><div class="tourCard" tabindex="-1"><div class="tourStep">' + (TOUR.i + 1) + ' of ' + n + '</div><h3>' + UI_ESC(step.title) + '</h3><p>' + text + '</p><div class="tourBtns"><button class="subtle" id="tour-skip">' + (last ? 'Close' : 'Skip') + '</button><span style="flex:1"></span>' + (TOUR.i ? '<button class="subtle" id="tour-back">Back</button>' : '') + '<button class="action" id="tour-next">' + (last ? 'Done' : 'Next') + '</button></div></div>';
  const hole = root.querySelector('.tourHole'), card = root.querySelector('.tourCard');
  if (vis) { const r = el.getBoundingClientRect(); hole.style.cssText = 'display:block; left:' + (r.left - 6) + 'px; top:' + (r.top - 6) + 'px; width:' + (r.width + 12) + 'px; height:' + (r.height + 12) + 'px;'; root.querySelector('.tourShade').style.display = 'none'; }
  else { hole.style.display = 'none'; }
  // place the card below the target (or above if no room), kept on screen; centered when there is no target
  const cw = Math.min(340, innerWidth - 24); card.style.width = cw + 'px';
  const ch = card.offsetHeight;
  let left, top;
  if (vis) { const r = el.getBoundingClientRect(); left = Math.max(12, Math.min(r.left, innerWidth - cw - 12)); top = r.bottom + 14; if (top + ch > innerHeight - 12) top = Math.max(12, r.top - ch - 14); if (top < 12 || (top + ch > innerHeight - 12)) top = Math.max(12, innerHeight - ch - 12); }
  else { left = Math.max(12, (innerWidth - cw) / 2); top = Math.max(12, (innerHeight - ch) / 2); }
  card.style.left = left + 'px'; card.style.top = top + 'px';
  document.getElementById('tour-next').addEventListener('click', () => { if (last) uiTourEnd(true); else { TOUR.i++; uiTourShow(); } });
  const bk = document.getElementById('tour-back'); if (bk) bk.addEventListener('click', () => { TOUR.i--; uiTourShow(); });
  document.getElementById('tour-skip').addEventListener('click', () => uiTourEnd(true));
  document.getElementById('tour-next').focus({ preventScroll: true });
}
// uiTourStart()/uiTourEnd(markDone): begin or close the tour; closing optionally records that it was seen.
function uiTourStart() { uiCloseOverlay(); TOUR.i = 0; TOUR.on = true; uiTourShow(); }
function uiTourEnd(markDone) { TOUR.on = false; const r = document.getElementById('ui-tour'); if (r) r.remove(); if (markDone) uiLsSet(TOUR_KEY, 'done'); }
// Reposition the tour on resize.
window.addEventListener('resize', () => { if (TOUR.on) uiTourShow(); });
// Tour keyboard handling (capture phase): Esc closes, arrows step, Tab stays inside the card, other single keys are swallowed.
document.addEventListener('keydown', e => {
  if (!document.getElementById('ui-tour')) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); uiTourEnd(true); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); const b = document.getElementById('tour-next'); if (b) b.click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); const b = document.getElementById('tour-back'); if (b) b.click(); }
  else if (e.key === 'Tab') { /* keep focus inside the card */ const f = [...document.querySelectorAll('#ui-tour button')]; if (!f.length) return; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
}, true);
// uiTourAuto(): start the tour once for first-time desktop visitors only (not on touch devices, not automated browsers, not when a save is already loaded).
function uiTourAuto() {
  if (uiLsGet(TOUR_KEY) === 'done') return;
  if (navigator.webdriver) return; // automated browsers (tests) are not first-time visitors
  if (!window.matchMedia || window.matchMedia('(max-width: 640px), (pointer: coarse)').matches) return;
  setTimeout(() => { if (uiLsGet(TOUR_KEY) !== 'done' && !document.getElementById('ui-overlay') && !document.getElementById('review-overlay') && !SAVE) uiTourStart(); }, 700);
}

