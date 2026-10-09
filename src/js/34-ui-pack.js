// (banner below describes the UI pack: navigation, search, status/changes, themes, tour)
// ===========================================================================
// UI PACK (2026-10-08): tab groups, search, status bar, changes drawer, shortcuts, "Max everything safe",
// remembered tab / fighter / theme, range hints, themes, drag-and-drop.
// Nothing here changes the save by itself: every edit still goes through the existing handlers.
// ===========================================================================
// Shared UI state: signature/cache of the change list (inSig/curSig/dlSig), the original SAVE snapshot (origObj, used for Undo), debounce timer, per-group last tab, search selection, and misc flags.
// dlSig = signature of the changes at the last download, so "downloaded" can be told from "unsaved".
const UI = { inSig: '', group: 'account', changes: null, curSig: '', dlSig: null, origRoot: null, origObj: null, timer: 0, lastTab: {}, ready: false, restoring: false, qsSel: 0, qsHits: [] };
// HTML-escape helper for text interpolated into innerHTML.
const UI_ESC = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// localStorage wrappers that never throw (storage may be blocked).
function uiLsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
function uiLsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } }

// ---- 4. tab groups ------------------------------------------------------
// Tab groups (the four top-level sections) and which tab ids belong to each; tabs not listed fall into "tools".
const TAB_GROUPS = [
  { id: 'account', label: 'Account', tabs: [ 'account', 'vip', 'dates', 'stats', 'collection', 'rewards', 'storage' ] },
  { id: 'fighters', label: 'Fighters', tabs: [ 'fighters', 'layouts', 'decals', 'research', 'stews', 'quests', 'graves' ] },
  { id: 'run', label: 'Run & Floors', tabs: [ 'location', 'run', 'rally', 'defense', 'hub', 'bags', 'boxes', 'jackals' ] },
  { id: 'tools', label: 'Tools', tabs: [ 'photos', 'compare', 'raw', 'jdiff' ] }
];
// uiGroupOf(tab) -> group id.
function uiGroupOf(tab) { const g = TAB_GROUPS.find(x => x.tabs.includes(tab)); return g ? g.id : 'tools'; }
// uiVisibleTabIds() -> tab ids currently shown (respecting TABS[].when), ordered by group.
function uiVisibleTabIds() { const vis = new Set(TABS.filter(t => !t.when || t.when()).map(t => t.id)); const out = []; for (const g of TAB_GROUPS) for (const id of g.tabs) if (vis.has(id)) out.push(id); for (const id of vis) if (!out.includes(id)) out.push(id); return out; }
// uiTabbarHtml() -> HTML for the group buttons and the tab row (rendered by the main renderer).
function uiTabbarHtml() {
  const vis = TABS.filter(t => !t.when || t.when()), byId = new Map(vis.map(t => [ t.id, t ]));
  const cur = uiGroupOf(activeTab);
  const ordered = uiVisibleTabIds().map(id => byId.get(id));
  return `<div class="stickyNav"><div class="grpbar" role="tablist" aria-label="Sections">${TAB_GROUPS.map((g, i) => `<button class="grpbtn ${g.id === cur ? 'active' : ''}" data-grp="${g.id}" title="${g.label} (key ${i + 1})">${g.label}</button>`).join('')}</div>
    <div class="tabbar">${ordered.map(t => `<button class="tabbtn ${activeTab === t.id ? 'active' : ''} ${uiGroupOf(t.id) === cur ? 'ingroup' : ''}" data-group="${uiGroupOf(t.id)}" data-tab-btn="${t.id}">${t.label}</button>`).join('')}</div></div>`;
}
// uiSyncTabs(): after a tab change, highlight the right group and remember the last tab per group.
function uiSyncTabs() {
  const g = uiGroupOf(activeTab);
  UI.group = g; UI.lastTab[g] = activeTab;
  document.querySelectorAll('.grpbtn').forEach(b => b.classList.toggle('active', b.dataset.grp === g));
  document.querySelectorAll('.tabbtn[data-tab-btn]').forEach(b => b.classList.toggle('ingroup', b.dataset.group === g));
}
// uiTabChanged(): called on tab switch; persists the tab in localStorage.
function uiTabChanged() { uiSyncTabs(); uiLsSet('lid.tab', activeTab); }
// uiGoGroup(id): switch to a group's last-used (or first visible) tab by clicking its button.
function uiGoGroup(id) {
  const g = TAB_GROUPS.find(x => x.id === id); if (!g) return;
  const vis = uiVisibleTabIds().filter(t => g.tabs.includes(t));
  const want = UI.lastTab[id] && vis.includes(UI.lastTab[id]) ? UI.lastTab[id] : vis[0];
  const b = want && document.querySelector(`[data-tab-btn="${want}"]`); if (b) b.click();
}
// uiStepTab(d): move to the next/previous visible tab (wraps).
function uiStepTab(d) {
  const ids = uiVisibleTabIds(), i = ids.indexOf(activeTab), n = ids[(i + d + ids.length) % ids.length];
  const b = document.querySelector(`[data-tab-btn="${n}"]`); if (b) { b.click(); b.focus({ preventScroll: true }); }
}
// uiWireTabs(): attach group and arrow-key handlers (re-run after each render).
function uiWireTabs() {
  document.querySelectorAll('.grpbtn').forEach(b => b.addEventListener('click', () => uiGoGroup(b.dataset.grp)));
  document.querySelectorAll('.tabbtn[data-tab-btn]').forEach(b => b.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); uiStepTab(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); uiStepTab(-1); }
  }));
}

// ==== Search (Ctrl+K) ====
// ---- 1. search ------------------------------------------------------------
// Extra search keywords per tab so queries like "bloodnium" find the right tab even if the label does not contain it.
const UI_KEYWORDS = {
  account: 'kill coins money spirit splithium bloodnium recycle points tdm rank bank level tank weapon mastery funshot research stamp currency max everything',
  fighters: 'fighter freezer grade level limit break stats hp str dex vit stm luk gas mask class model gear inventory parts weapons armor skins hanger name delete recover add max all',
  layouts: 'layout loadout build preset decal equip',
  research: 'research blueprint blueprints parts weapons armor level chokufunsha funshot',
  decals: 'decal decals skill stock slots',
  stews: 'stew stews rarity seed queue cook',
  bags: 'mystery bag lost bag bags',
  boxes: 'death box deathbox boxes',
  hub: 'waiting room hub custom',
  defense: 'defense defender fort alarm whistle kidnap guard',
  photos: 'screenshots photos pictures images export',
  graves: 'dead fighters graves archive',
  dates: 'dates time clock timers expire',
  storage: 'storage box coin locker capacity items slots',
  rewards: 'reward box rewards present presents mail gifts',
  quests: 'quests orders completed taken cleared progress',
  rally: 'stamp rally floors stamps bonus',
  location: 'location floor travel move boss lock rewind run end screamer pit paused go back',
  run: 'current run crash end run death bag',
  collection: 'collection mushroom beast book magazines skins barbs catalogue',
  jackals: 'jackals jackal rewards',
  stats: 'stats statistics play log counters',
  vip: 'vip express pass membership free continues renewal',
  compare: 'compare second save clone copy fighters between saves',
  raw: 'raw data json tree edit',
  jdiff: 'json compare diff advanced'
};
// uiSearchEntries() -> searchable entries: every visible tab, plus short labels/headings/buttons scraped from the rendered tab panels (kind 'item').
function uiSearchEntries() {
  const out = [], seen = new Set();
  for (const id of uiVisibleTabIds()) {
    const t = TABS.find(x => x.id === id), g = TAB_GROUPS.find(x => x.tabs.includes(id));
    out.push({ tab: id, text: t.label, in: g ? g.label : '', kw: UI_KEYWORDS[id] || '', kind: 'tab' }); seen.add(id + '|' + t.label);
  }
  document.querySelectorAll('[data-tab-panel]').forEach(p => {
    const tab = p.dataset.tabPanel; if (!document.querySelector(`[data-tab-btn="${tab}"]`)) return;
    const tl = (TABS.find(x => x.id === tab) || {}).label || tab;
    p.querySelectorAll('label, h2, .eyebrow, summary, button').forEach(el => {
      if (el.closest('table') || el.closest('#chg-drawer')) return;
      let tx = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!tx || tx.length > 64 || tx.length < 3) return;
      const k = tab + '|' + tx; if (seen.has(k)) return; seen.add(k);
      out.push({ tab, text: tx, in: tl, kw: '', kind: 'item' });
    });
  });
  return out;
}
// uiSearchRun(q) -> up to 12 best entries. Every whitespace-separated token must match; exact > prefix > substring scoring, tabs get a bonus.
function uiSearchRun(q) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const toks = q.split(/\s+/);
  const res = [];
  for (const e of uiSearchEntries()) {
    const hay = (e.text + ' ' + e.kw + ' ' + e.in).toLowerCase(), tx = e.text.toLowerCase();
    if (!toks.every(t => hay.includes(t))) continue;
    let s = 0;
    if (tx === q) s += 100; else if (tx.startsWith(q)) s += 60; else if (tx.includes(q)) s += 40; else s += 10;
    if (e.kind === 'tab') s += 15;
    res.push([ s, e ]);
  }
  res.sort((a, b) => b[0] - a[0]);
  return res.slice(0, 12).map(x => x[1]);
}
// uiQsRender(): draw the dropdown of results under the search box.
function uiQsRender() {
  const drop = document.getElementById('qs-drop'), q = document.getElementById('qs').value;
  if (!q.trim()) { drop.style.display = 'none'; return; }
  UI.qsHits = SAVE ? uiSearchRun(q) : [];
  UI.qsSel = Math.min(UI.qsSel, Math.max(0, UI.qsHits.length - 1));
  drop.innerHTML = !SAVE ? '<div class="qsnone">Load masters.db and a save first.</div>'
    : UI.qsHits.length ? UI.qsHits.map((h, i) => `<div class="qsrow ${i === UI.qsSel ? 'sel' : ''}" data-qs="${i}"><span>${UI_ESC(h.text)}</span><span class="qsin">${h.kind === 'tab' ? 'tab' : ''}${h.kind === 'tab' || !h.in ? '' : ''}${h.kind === 'item' ? 'in ' + UI_ESC(h.in) : ''}</span></div>`).join('')
    : '<div class="qsnone">Nothing matches.</div>';
  drop.style.display = 'block';
  drop.querySelectorAll('[data-qs]').forEach(r => r.addEventListener('mousedown', e => { e.preventDefault(); uiQsPick(Number(r.dataset.qs)); }));
}
// uiQsPick(i): choose a result: clear the box and navigate.
function uiQsPick(i) {
  const h = UI.qsHits[i]; if (!h) return;
  const inp = document.getElementById('qs'); inp.value = ''; inp.blur();
  document.getElementById('qs-drop').style.display = 'none';
  uiGoto(h.tab, h.kind === 'item' ? h.text : '');
}
// uiGoto(tab, text): switch tab, then scroll to and flash the matching element (or scroll to top for a tab hit).
function uiGoto(tab, text) {
  const b = document.querySelector(`[data-tab-btn="${tab}"]`);
  if (b && activeTab !== tab) b.click();
  if (text) setTimeout(() => uiFlash(tab, text), 90);
  else window.scrollTo(0, 0);
}
// uiFlash(tab, text): find the element with that text in the tab, open parent <details>, scroll, highlight and focus its input.
function uiFlash(tab, text) {
  const p = document.querySelector(`[data-tab-panel="${tab}"]`); if (!p) return;
  const el = [ ...p.querySelectorAll('label, h2, .eyebrow, summary, button') ].find(e => (e.textContent || '').replace(/\s+/g, ' ').trim() === text);
  if (!el) return;
  for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('flashHit'); setTimeout(() => el.classList.remove('flashHit'), 2300);
  const inp = el.tagName === 'LABEL' && el.parentElement && el.parentElement.querySelector('input, select');
  if (inp && inp.focus) inp.focus({ preventScroll: true });
}
// uiWireSearch(): keyboard handling (arrows, Enter, Escape) for the search box.
function uiWireSearch() {
  const inp = document.getElementById('qs'), drop = document.getElementById('qs-drop');
  inp.addEventListener('input', () => { UI.qsSel = 0; uiQsRender(); });
  inp.addEventListener('focus', () => { if (inp.value.trim()) uiQsRender(); });
  inp.addEventListener('blur', () => { setTimeout(() => { drop.style.display = 'none'; }, 120); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); UI.qsSel = Math.min(UI.qsSel + 1, UI.qsHits.length - 1); uiQsRender(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); UI.qsSel = Math.max(UI.qsSel - 1, 0); uiQsRender(); }
    else if (e.key === 'Enter') { e.preventDefault(); uiQsPick(UI.qsSel); }
    else if (e.key === 'Escape') { inp.value = ''; inp.blur(); drop.style.display = 'none'; }
  });
}

// ==== Status bar and unsaved-changes warning ====
// ---- 2. status bar + unsaved warning --------------------------------------
// Total number of change lines across review sections.
function uiChangeCount(sections) { return sections ? sections.reduce((n, s) => n + s.lines.length, 0) : 0; }
// uiComputeChanges() -> review sections for the current edits (SAVE vs the text loaded), or null if no comparable original. Builds the full download root, so it is relatively slow.
function uiComputeChanges() {
  if (!SAVE || !RAW_SAV_ROOT || !ORIG_SAVE.text || ORIG_SAVE.root !== RAW_SAV_ROOT) return null;
  const root = buildDownloadRoot();
  const rawA = JSON.parse(ORIG_SAVE.text), rawB = JSON.parse(JSON.stringify(root));
  return reviewDiff(reviewAdapt(JSON.parse(JSON.stringify(rawA))), reviewAdapt(rawB), rawA, rawB);
}
// uiSig(sections) -> string signature of the change lines, to tell whether anything changed since the last download.
function uiSig(sections) { return sections ? JSON.stringify(sections.map(s => s.lines)) : ''; }
// uiInputSig() -> JSON fingerprint of SAVE and all pending-operation state; the slow change list is rebuilt only when this moves. Returns a random string on failure so it always counts as different.
// cheap fingerprint of everything that can differ from the loaded save; the (slow) change list is only rebuilt when it moves
function uiInputSig() {
  try {
    return JSON.stringify([ SAVE, FLOOR_MOVE.root === RAW_SAV_ROOT && FLOOR_MOVE.target, BOSS_LOCK.root === RAW_SAV_ROOT && [ BOSS_LOCK.mode, BOSS_LOCK.which, BOSS_LOCK.extend, BOSS_LOCK.rewards ], RUN_END.root === RAW_SAV_ROOT && RUN_END.on,
      REWIND.root === RAW_SAV_ROOT && REWIND.on, FREE_CONT.root === RAW_SAV_ROOT && [ FREE_CONT.on, FREE_CONT.perDay ], STAMP_MARK.root === RAW_SAV_ROOT && STAMP_MARK.on, JKL.root === RAW_SAV_ROOT && JKL.edits,
      SHUTDOWN_RESET.root === RAW_SAV_ROOT && [ ...SHUTDOWN_RESET.cids ], FIGHTER_DELETES.root === RAW_SAV_ROOT && [ [ ...FIGHTER_DELETES.cids ], [ ...FIGHTER_DELETES.eids ] ], FIGHTER_RECOVERS.root === RAW_SAV_ROOT && [ ...FIGHTER_RECOVERS.cids ],
      RALLY.root === RAW_SAV_ROOT && [ RALLY.stamps, RALLY.bonus ], RAW_VIEW.edAt, DATE_RULES, RAW_SAV_ROOT === UI.origRoot ]);
  } catch (e) { return String(Math.random()); }
}
// uiScheduleStatus(): debounce (900 ms) recomputing the change list after edits; called after every render.
function uiScheduleStatus() {
  const sig = uiInputSig();
  if (sig === UI.inSig && UI.changes !== null) return;
  clearTimeout(UI.timer);
  UI.pendingSig = true;
  UI.timer = setTimeout(() => {
    UI.pendingSig = false;
    const sg = uiInputSig();
    try { UI.changes = uiComputeChanges(); UI.curSig = uiSig(UI.changes); UI.inSig = sg; } catch (err) { console.warn('change count failed', err); UI.changes = null; UI.curSig = ''; }
    uiStatusUpdate();
  }, 900);
}
// uiDirty() -> true when there are edits not yet downloaded (also true if an edit is newer than the last count). Used by beforeunload and by "open another save" confirmations.
function uiDirty() {
  if (!SAVE || !RAW_SAV_ROOT) return false;
  // an edit made in the last second may not be counted yet: compare the live fingerprint with the one the count was made from
  if (UI.pendingSig) { try { if (uiInputSig() !== UI.inSig) return true; } catch (e) { return true; } }
  const n = uiChangeCount(UI.changes); return n > 0 && UI.curSig !== UI.dlSig;
}
// uiStatusUpdate(): refresh the bottom bar: file name, change count / downloaded state and Save check summary.
function uiStatusUpdate() {
  const bar = document.getElementById('statusbar'); if (!bar) return;
  if (!SAVE || !RAW_SAV_ROOT) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const n = uiChangeCount(UI.changes), pend = UI.changes !== null;
  const it = (HEALTH && HEALTH.items) || [];
  const np = it.filter(x => x.level === 'problem').length, nw = it.filter(x => x.level === 'warning').length;
  document.getElementById('sb-file').textContent = ORIG_SAVE.name || 'save';
  document.getElementById('sb-file').title = ORIG_SAVE.name || '';
  const st = document.getElementById('sb-state');
  st.className = !pend ? 'sbclean' : !n ? 'sbclean' : UI.curSig === UI.dlSig ? 'sbok' : 'sbdirty';
  st.textContent = !pend ? 'Checking changes…' : !n ? 'No changes yet' : UI.curSig === UI.dlSig ? `✓ ${n} change${n === 1 ? '' : 's'}, downloaded` : `● ${n} unsaved change${n === 1 ? '' : 's'}`;
  const ck = document.getElementById('sb-check');
  ck.className = 'linkbtn ' + (np ? 'sbprob' : nw ? 'sbdirty' : 'sbok');
  uiStatusDots(); ck.disabled = !(np || nw); ck.style.cursor = (np || nw) ? 'pointer' : 'default';
  ck.textContent = np ? `Save check: ${np} problem${np === 1 ? '' : 's'}` : nw ? `Save check: ${nw} warning${nw === 1 ? '' : 's'}` : 'Save check: OK';
}
// Safe wrapper for uiApplyDots.
function uiStatusDots() { try { uiApplyDots(); } catch (e) { console.warn(e); } }
// Warn before closing the tab when there are unsaved changes.
window.addEventListener('beforeunload', e => { if (uiDirty()) { e.preventDefault(); e.returnValue = ''; return ''; } });

// ==== Changes drawer and Undo ====
// ---- 3. changes drawer ------------------------------------------------------
// uiPending() -> operations that only apply at download time (floor move, boss lock, run end, rewind, free continues), each with a cancel() that resets its state object.
function uiPending() {
  const out = [], r = RAW_SAV_ROOT; if (!r) return out;
  if (FLOOR_MOVE.root === r && FLOOR_MOVE.target) out.push({ text: `Move to floor ${hvnFloor(FLOOR_MOVE.target) ? hvnFloorLabel(hvnFloor(FLOOR_MOVE.target)) : FLOOR_MOVE.target}`, cancel: () => { FLOOR_MOVE.target = ''; FLOOR_MOVE.armed = false; FLOOR_MOVE.msg = ''; FLOOR_MOVE.rolls = null; } });
  if (BOSS_LOCK.root === r && BOSS_LOCK.mode) out.push({ text: `Boss floor lock: ${(BLK_MODES[BOSS_LOCK.mode] || {}).label || BOSS_LOCK.mode}`, cancel: () => { BOSS_LOCK.mode = ''; BOSS_LOCK.which = ''; BOSS_LOCK.plan = null; } });
  if (RUN_END.root === r && RUN_END.on) out.push({ text: 'End the run (fighter goes home)', cancel: () => { RUN_END.on = false; } });
  if (REWIND.root === r && REWIND.on) out.push({ text: 'Rewind the run', cancel: () => { REWIND.on = false; } });
  if (FREE_CONT.root === r && FREE_CONT.on) out.push({ text: `Free continues (${FREE_CONT.perDay} a day)`, cancel: () => { FREE_CONT.on = false; } });
  return out;
}
// uiReverts() -> Map(review line text -> undo function), built by diffing the original snapshot (UI.origObj) against SAVE.
// Covers scalar soul values, VIP, decal stock, mastery, and whole fighters (key "@fighter:<name>", only when the name is unique among changed fighters). Keys must match reviewDiff line text exactly.
// lines that can be undone: text of the line (exactly as the review writes it) -> function that puts the value back
function uiReverts() {
  const map = new Map();
  if (!UI.origObj || !SAVE) return map;
  const A = UI.origObj, aS = A.soul || {}, bS = SAVE.soul || {}, back = fn => () => fn();
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  for (const k of new Set(Object.keys(aS).concat(Object.keys(bS)))) {
    if ([ 'chrs', 'chrslots', 'psskls', 'hubcustom', 'mstlvl', 'vip', 'modified', 'uid', 'crntcid' ].includes(k)) continue;
    const a = aS[k], b = bS[k];
    if ((a && typeof a === 'object') || (b && typeof b === 'object') || a === b) continue;
    if (k === 'tdm_rank') continue; // follows the points
    map.set(`${REVIEW_SOUL_LABELS[k] || reviewKeyLabel(k)}: ${reviewVal(k, a)} → ${reviewVal(k, b)}`, back(() => {
      if (a === undefined) delete SAVE.soul[k]; else SAVE.soul[k] = a;
      if (k === 'tdm_point') { if (aS.tdm_rank === undefined) delete SAVE.soul.tdm_rank; else SAVE.soul.tdm_rank = aS.tdm_rank; }
    }));
  }
  const va = aS.vip || {}, vb = bS.vip || {};
  const vipLabel = { vip_flag: 'Express member', vip_type: 'Express Pass kind', vip_pass_num: '30-Day passes held', oneday_vip_pass_num: '1-Day passes held', expired_time: 'VIP expires', automatic_renewal: 'VIP auto-renew' };
  for (const k of new Set(Object.keys(va).concat(Object.keys(vb)))) if (!same(va[k], vb[k])) map.set(`${vipLabel[k] || 'VIP ' + k}: ${reviewVal(k, va[k])} → ${reviewVal(k, vb[k])}`, back(() => { SAVE.soul.vip = SAVE.soul.vip || {}; if (va[k] === undefined) delete SAVE.soul.vip[k]; else SAVE.soul.vip[k] = clone(va[k]); }));
  // decal stock
  const ka = {}, kb = {};
  for (const s of arr(aS.psskls)) ka[s.id] = s.cnt || 0;
  for (const s of arr(bS.psskls)) kb[s.id] = s.cnt || 0;
  for (const id of new Set(Object.keys(ka).concat(Object.keys(kb)))) if ((ka[id] || 0) !== (kb[id] || 0)) map.set(`${reviewDecalName(id)}: ${ka[id] || 0} → ${kb[id] || 0}`, back(() => {
    SAVE.soul.psskls = arr(SAVE.soul.psskls); const e = SAVE.soul.psskls.find(s => s.id === id), oe = arr(aS.psskls).find(s => s.id === id);
    if (e && oe) e.cnt = oe.cnt; else if (e && !oe) SAVE.soul.psskls.splice(SAVE.soul.psskls.indexOf(e), 1); else if (!e && oe) SAVE.soul.psskls.push(clone(oe));
  }));
  // weapon mastery
  const ma = {}, mb = {};
  for (const m of arr(aS.mstlvl)) ma[m.ptarmtp] = m.lvl;
  for (const m of arr(bS.mstlvl)) mb[m.ptarmtp] = m.lvl;
  const mstName = id => { const r = arr(AP && AP.ptarmtps).find(x => x.id === id); return (r && resolveName(r.name)) || id; };
  for (const id of new Set(Object.keys(ma).concat(Object.keys(mb)))) if ((ma[id] || 1) !== (mb[id] || 1)) map.set(`${mstName(id)}: Lv ${ma[id] || 1} → Lv ${mb[id] || 1}`, back(() => {
    SAVE.soul.mstlvl = arr(SAVE.soul.mstlvl); const i = SAVE.soul.mstlvl.findIndex(m => m.ptarmtp === id), oe = arr(aS.mstlvl).find(m => m.ptarmtp === id);
    if (oe) { if (i >= 0) SAVE.soul.mstlvl[i] = clone(oe); else SAVE.soul.mstlvl.push(clone(oe)); } else if (i >= 0) SAVE.soul.mstlvl.splice(i, 1);
  }));
  // fighters (whole fighter put back as it was loaded); only when the name is unique among changed fighters
  const byA = new Map(arr(aS.chrs).map(c => [ c.cid, c ])), byB = new Map(arr(bS.chrs).map(c => [ c.cid, c ]));
  const changed = [];
  for (const [ cid, b ] of byB) { const a = byA.get(cid); if (a && !same(a, b)) changed.push(b); }
  for (const b of changed) {
    if (changed.filter(x => x.name === b.name).length !== 1) continue;
    map.set(`@fighter:${b.name || '?'}`, back(() => { const i = arr(SAVE.soul.chrs).findIndex(c => c && c.cid === b.cid); if (i >= 0) SAVE.soul.chrs[i] = clone(byA.get(b.cid)); }));
  }
  return map;
}
// uiAfterUndo(msg): re-run Save check, re-render everything, refresh the drawer and toast.
function uiAfterUndo(msg) { try { runSaveCheck(); } catch (e) { /* ignore */ } renderAll(); uiOpenChanges(true); toast(msg); }
// uiCloseChanges(): hide the drawer.
function uiCloseChanges() { const d = document.getElementById('chg-drawer'); if (d) d.style.display = 'none'; }
// uiOpenChanges(keep): (re)compute the change list and render the drawer with Undo buttons and cancel buttons for pending operations.
function uiOpenChanges(keep) {
  const d = document.getElementById('chg-drawer'); if (!d) return;
  if (!SAVE || !RAW_SAV_ROOT) { toast('Load a save first', true); return; }
  let sections = null, why = '';
  try { sections = uiComputeChanges(); UI.changes = sections; UI.curSig = uiSig(sections); UI.inSig = uiInputSig(); uiStatusUpdate(); } catch (err) { why = err.message; }
  const rev = uiReverts(), pend = uiPending(), n = uiChangeCount(sections);
  const secHtml = sections === null ? `<div class="capNote">The change list couldn't be made (${UI_ESC(why)}).</div>`
    : !sections.length ? '<div class="capNote" style="margin:0;">No changes since you loaded this save.</div>'
    : sections.map((s, si) => `<details ${s.lines.length <= 14 ? 'open' : ''} style="margin-bottom:8px;"><summary style="cursor:pointer;"><b>${UI_ESC(s.title)}</b> <span class="id">(${s.lines.length})</span></summary>
      <ul style="margin:6px 0 0 18px; padding:0; font-size:12px; line-height:1.6; list-style:disc;">${s.lines.map((l, li) => {
        let key = rev.has(l) ? l : null;
        if (!key && s.title === 'Fighters') { const nm = l.split(': ')[0]; if (rev.has('@fighter:' + nm)) key = '@fighter:' + nm; }
        return `<li><span class="ltxt">${UI_ESC(l)}</span>${key ? `<button class="subtle undoBtn" data-undo="${si}:${li}" title="Put this back the way it was when you loaded the save">Undo</button>` : ''}</li>`;
      }).join('')}</ul></details>`).join('');
  d.innerHTML = `<div class="dhead"><h2>Changes <span class="id">(${n})</span></h2><button class="subtle" id="chg-close">Close</button></div>
    <div class="dbody">
      ${pend.length ? `<div class="pend"><b style="font-size:12px;">Applied when you download</b>${pend.map((p, i) => `<div class="prow"><span>${UI_ESC(p.text)}</span><button class="subtle undoBtn" data-cancel="${i}">Cancel</button></div>`).join('')}</div>` : ''}
      <div class="capNote" style="margin-top:0;">Everything here differs from the save as you loaded it${ORIG_SAVE.name ? ` (${UI_ESC(ORIG_SAVE.name)})` : ''}. <b>Undo</b> puts that one value (or that one fighter) back. Lines without an Undo button are changed on their own tab, or use <b>Start over</b> below. Changes that depend on each other (for example a floor move) are cancelled in the box above.</div>
      ${secHtml}
    </div>
    <div class="dfoot"><button class="action" id="chg-dl">⬇ Review &amp; download</button>${ORIG_SAVE.file ? '<button class="subtle" id="chg-reset" title="Throw away every edit and load the file again">Start over from the loaded file</button>' : ''}</div>`;
  d.style.display = 'flex';
  document.getElementById('chg-close').addEventListener('click', uiCloseChanges);
  document.getElementById('chg-dl').addEventListener('click', () => { uiCloseChanges(); reviewAndDownload('sav'); });
  const rs = document.getElementById('chg-reset');
  if (rs) rs.addEventListener('click', () => {
    if (!confirm('Throw away every edit and load the file again?')) return;
    uiCloseChanges(); loadSaveFiles([ ORIG_SAVE.file ]);
  });
  d.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => { const p = pend[Number(b.dataset.cancel)]; p.cancel(); uiAfterUndo('Cancelled: ' + p.text); }));
  d.querySelectorAll('[data-undo]').forEach(b => b.addEventListener('click', () => {
    const [ si, li ] = b.dataset.undo.split(':').map(Number), l = sections[si].lines[li];
    let key = rev.has(l) ? l : null;
    if (!key && sections[si].title === 'Fighters') key = '@fighter:' + l.split(': ')[0];
    const fn = key && rev.get(key); if (!fn) return;
    try { fn(); } catch (err) { toast('Undo failed: ' + err.message, true); return; }
    uiAfterUndo('Put back: ' + (key.startsWith('@fighter:') ? key.slice(9) : l.split(':')[0]));
  }));
}

// ==== Keyboard shortcuts and help overlays ====
// ---- 5. keyboard shortcuts ----------------------------------------------------
// uiTyping(e): true when the key event comes from a text-entry element (single-key shortcuts are then ignored).
function uiTyping(e) { const t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
// uiHelp(): show the keyboard shortcut table.
function uiHelp() {
  uiCloseOverlay();
  const ov = document.createElement('div'); ov.className = 'uiOverlay'; ov.id = 'ui-overlay';
  ov.innerHTML = `<section class="block"><div class="block-head"><div><div class="eyebrow">Help</div><h2>Keyboard shortcuts</h2></div></div><div class="block-body">
    <table class="kbdTable">
      <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Review changes and download the .sav</td></tr>
      <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>/</kbd></td><td>Search tabs and settings</td></tr>
      <tr><td><kbd>[</kbd> and <kbd>]</kbd></td><td>Previous / next tab</td></tr>
      <tr><td><kbd>1</kbd> – <kbd>4</kbd></td><td>Jump to Account, Fighters, Run &amp; Floors, Tools</td></tr>
      <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Move between tabs while a tab button is selected</td></tr>
      <tr><td><kbd>C</kbd></td><td>Open the list of changes</td></tr>
      <tr><td><kbd>?</kbd></td><td>This help</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Close a window or the search</td></tr>
    </table>
    <div class="capNote">Single-key shortcuts only work when you are not typing in a box. You can also drop a .sav, .json or masters.db file anywhere on the page.</div>
    <div class="toolbar" style="margin-top:10px;"><button class="subtle" id="ui-ov-close">Close</button></div></div></section>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) uiCloseOverlay(); });
  document.getElementById('ui-ov-close').addEventListener('click', uiCloseOverlay);
}

// uiOpenPsGuide(): static how-to overlay for editing a PS4/PS5 save (copy to USB, decrypt, edit here, re-encrypt, copy back). Pure content.
function uiOpenPsGuide() {
  uiCloseOverlay();
  const ov = document.createElement('div'); ov.className = 'uiOverlay'; ov.id = 'ui-overlay';
  ov.innerHTML = `<section class="block wide"><div class="block-head"><div><div class="eyebrow">PlayStation</div><h2>Edit your PS4 / PS5 save, step by step</h2></div></div><div class="block-body">
    <div class="psIntro">LET IT DIE Offline Edition is a <b>PS4 game</b>; a PS5 plays it through backwards compatibility. Its save counts as a <b>PS4 save</b> on both consoles, which is why copying it to a USB drive works (Sony does not allow PS5-native saves on USB). The save transfer from the online game ends on <b>30 November 2026</b>.</div>
    <div class="psGuide">
    <p><b>You need:</b> a USB drive formatted <b>FAT32 or exFAT</b> (not set up as "extended storage"), a computer, and a PC <code>masters.db</code> from a game version that matches your save. No PlayStation Plus subscription is needed.</p>
    <h3>Part 1: Copy your save from the console to USB</h3>
    <ol>
      <li>Plug the USB drive into the console.</li>
      <li>Go to <b>Settings &gt; Saved Data and Game/App Settings &gt; Saved Data (PS4)</b>.</li>
      <li><b>PS4:</b> choose <i>Upload or Delete from Console Storage</i>, then <i>Copy to USB Drive</i>.<br><b>PS5:</b> choose <i>Console Storage</i>, then the <i>Copy to USB Drive</i> tab.</li>
      <li>Pick LET IT DIE, tick the save and press <b>Copy</b>.</li>
      <li>Plug the drive into your computer. You will see a <code>PS4</code> folder. <b>Copy that whole folder somewhere safe. This is your backup. Never edit or overwrite it.</b></li>
    </ol>
    <h3>Part 2: Decrypt it</h3>
    <ol>
      <li>Go to <a href="https://garlicsaves.com" target="_blank" rel="noopener">garlicsaves.com</a>, <b>create a free account</b> and log in. Decrypting does <b>not</b> need a profile; you set one up in Part 4.</li>
      <li>Open <b>Decrypt</b> from the menu on the left. Drop in the two files from your USB copy, <code>savedata.bin</code> and its matching <code>savedata</code> file (the page says "<i>.bin + matching save file, or a .zip</i>"), or a zip that holds them. Leave <b>Include sce_sys folder</b> <b>ticked</b>, because Encrypt needs it later, and leave <b>Ignore second-layer checks</b> unticked. Click <b>Start Decrypt</b>.</li>
      <li>Download the result when it finishes. It is your decrypted save: <code>brggame.sav</code> plus an <code>sce_sys</code> folder. <b>Keep both together.</b></li>
    </ol>
    <h3>Part 3: Edit it</h3>
    <ol>
      <li>Load the PC <code>masters.db</code> here, then the decrypted <code>brggame.sav</code>. "PS" shows by the file name when the editor detects a PlayStation save.</li>
      <li>Make your changes. The status bar at the bottom counts your unsaved changes, and <b>Changes</b> lists them with an Undo for each.</li>
      <li>Click <b>Download .sav</b>. Read the review window and the Save check before you accept. The editor also keeps the original in <b>Download history</b>.</li>
      <li>The download is named like <code>brggame_2026-10-08_063000.sav</code>. <b>Rename it to <code>brggame.sav</code></b> and put it in the folder from Part 2, replacing the old one. The folder must contain <code>brggame.sav</code> in its root and the <code>sce_sys</code> folder.</li>
      <li>Zip that folder (select <code>brggame.sav</code> and <code>sce_sys</code>, then zip them) so both are in the root of the zip.</li>
    </ol>
    <h3>Part 4: Re-encrypt and copy back</h3>
    <ol>
            <li>If you haven't yet, set up your profile. On the <b>Dashboard</b>, under <b>PS4 Profiles</b>, add your PSN account (once only):
        <ul><li><b>Profile name:</b> your PSN online name.</li>
        <li><b>Account ID:</b> the 16-character name of the folder on your USB drive. It is the folder inside <code>PS4/SAVEDATA/</code>, the one above <code>CUSA03769</code>. Copy it exactly. The site's <i>How do I find my Account ID?</i> link shows more.</li></ul>
        Click <b>Add Profile</b>.</li>
      <li>Open <b>Encrypt</b> and <b>choose your profile</b>, then drop in the zip. It reads the save name and size from the zip by itself. <b>Leave "PS5 save" unticked</b>, because this is a PS4 game. Click <b>Encrypt</b>.</li>
      <li>You get a zip named like <code>LET_IT_DIE_CUSA03769_enc.zip</code>. Garlic puts your own account back into the folder it builds.</li>
      <li>Extract it to the <b>root of the USB drive</b>, not into a folder. Afterwards the drive shows:
<pre>PS4/
  SAVEDATA/
    &lt;your account folder&gt;/
      CUSA03769/
        savedata
        savedata.bin</pre></li>
      <li>Plug the drive into the console. Go to <b>Settings &gt; Saved Data and Game/App Settings &gt; Saved Data (PS4)</b>, choose the USB drive, then <b>Copy to Console Storage</b>. Tick the LET IT DIE save and confirm the overwrite.</li>
      <li>Start the game and check your fighters <b>before</b> you delete your backup.</li>
    </ol>
    <h3>If something goes wrong</h3>
    <ul>
      <li><b>The save isn't listed on the console.</b> The folders are in the wrong place on the drive. Check that <code>PS4</code> is at the top, not inside another folder.</li>
      <li><b>Garlic says the zip is wrong.</b> The zip must hold <code>brggame.sav</code> and <code>sce_sys</code> directly, not inside another folder.</li>
      <li><b>The game rejects or resets the save.</b> Restore your backup from Part 1 the same way (Part 4, step 4), then try again from the original files.</li>
      <li><b>The editor warns about masters.db.</b> Load a masters.db that matches your game version.</li>
      <li><b>Parts or decals look wrong.</b> Some only exist on PlayStation. Tick <i>Include PS-only</i> on the Research and Decals tabs.</li>
      <li><b>Anything else.</b> Open the Save check at the top of the editor and send what it says when you ask for help.</li>
    </ul>
    </div>

    <div class="toolbar" style="margin-top:10px;"><button class="subtle" id="ui-ov-close">Close</button></div></div></section>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) uiCloseOverlay(); });
  document.getElementById('ui-ov-close').addEventListener('click', uiCloseOverlay);
}
// uiCloseOverlay(): remove the generic UI overlay.
function uiCloseOverlay() { const o = document.getElementById('ui-overlay'); if (o) o.remove(); }
// Global shortcuts: Ctrl+S download, Ctrl+K/"/" search, Esc closes overlays, [ ] step tabs, 1-4 jump group, C changes, ? help.
document.addEventListener('keydown', e => {
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 's' || k === 'S')) {
    e.preventDefault();
    const b = document.getElementById('btn-download-sav'); if (b && !b.disabled) b.click(); else toast('Load a save first', true);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'K')) { e.preventDefault(); document.getElementById('qs').focus(); document.getElementById('qs').select(); return; }
  if (k === 'Escape') {
    if (document.getElementById('ui-overlay')) { uiCloseOverlay(); return; }
    const d = document.getElementById('chg-drawer'); if (d && d.style.display !== 'none' && d.style.display !== '') { uiCloseChanges(); return; }
    return;
  }
  if (uiTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.getElementById('review-overlay') || document.getElementById('ui-overlay') || document.getElementById('ui-tour')) return;
  if (k === '/') { e.preventDefault(); document.getElementById('qs').focus(); return; }
  if (k === '?') { uiHelp(); return; }
  if (!SAVE) return;
  if (k === ']') uiStepTab(1); else if (k === '[') uiStepTab(-1);
  else if (k >= '1' && k <= '4') uiGoGroup(TAB_GROUPS[Number(k) - 1].id);
  else if (k === 'c' || k === 'C') uiOpenChanges();
});

// ==== Max everything safe ====
// ---- 6. Max everything safe -----------------------------------------------------
// uiMaxRows() -> rows { label, on, apply() } for the "Max everything safe" dialog. Limits come from masters.db (bank levels/capacities, currency caps, TDM max). Fighter maxing is off by default.
function uiMaxRows() {
  const s = SAVE.soul, rows = [], num = v => Number(v).toLocaleString();
  for (const [ label, levelField, valueField ] of [ [ 'Kill Coins', 'safe_level', 'free_money' ], [ 'SPLithium', 'spirit_tank_level', 'spirit' ] ]) {
    const maxLvl = bankMaxLevel(levelField), cap = bankCapacityForLevel(maxLvl, levelField), lvl = s[levelField] != null ? s[levelField] : 1, held = s[valueField] || 0;
    if (lvl < maxLvl || held < cap) rows.push({ label: `${label}: bank level ${lvl} → ${maxLvl}, held ${num(held)} → ${num(cap)}`, on: true, apply() {
      // Banks also store a *_limit field next to the level on some saves; keep it in step when present.
      s[levelField] = maxLvl; const lk = levelField.replace('_level', '_limit'); if (lk in s) s[lk] = cap; s[valueField] = cap; } });
  }
  for (const [ f, label, cap ] of currencyFields()) {
    if (cap && (s[f] || 0) < cap) rows.push({ label: `${label}: ${num(s[f] || 0)} → ${num(cap)}`, on: true, apply() { s[f] = cap; } });
  }
  { const mx = tdmPointMax(); if ((s.tdm_point || 0) < mx) rows.push({ label: `TDM Points: ${num(s.tdm_point || 0)} → ${num(mx)}`, on: true, apply() { s.tdm_point = mx; const r = tdmRankForPoints(mx, AP); if (r) s.tdm_rank = r.id; } }); }
  rows.push({ label: 'Weapon Mastery: every category to its top level', on: true, apply() { const b = document.getElementById('mst-max-all'); if (b) b.click(); } });
  const nf = arr(s.chrs).filter(c => c && c.state !== 'ENEMY' && c.state !== 'DUMMY').length;
  rows.push({ label: `All fighters (${nf}): Grade ${gradeMax()}, top Limit Break, all stats, slots, Death Bag and Rage. Fighters that are dead, kidnapped or in a run are skipped.`, on: false, apply() { maxAllFighters(); } });
  return rows;
}
// uiOpenMax(): show the dialog and apply the ticked rows, then re-run Save check and re-render.
function uiOpenMax() {
  if (!SAVE) { toast('Load a save first', true); return; }
  uiCloseOverlay();
  const rows = uiMaxRows();
  const ov = document.createElement('div'); ov.className = 'uiOverlay'; ov.id = 'ui-overlay';
  ov.innerHTML = `<section class="block"><div class="block-head"><div><div class="eyebrow">Account</div><h2>Max everything safe</h2></div></div><div class="block-body">
    <div class="capNote" style="margin-top:0;">Raises these to the game's own limits and no further (limits come from masters.db). Untick anything you want to leave. Nothing changes until you press Apply, and you can undo each value afterwards in <b>Changes</b>.</div>
    ${rows.map((r, i) => `<label class="maxRow"><input type="checkbox" data-maxrow="${i}" ${r.on ? 'checked' : ''}><span>${UI_ESC(r.label)}</span></label>`).join('')}
    <div class="toolbar" style="margin-top:12px;"><button class="action" id="max-apply">Apply</button><button class="subtle" id="max-cancel">Cancel</button></div></div></section>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) uiCloseOverlay(); });
  document.getElementById('max-cancel').addEventListener('click', uiCloseOverlay);
  document.getElementById('max-apply').addEventListener('click', () => {
    let n = 0;
    ov.querySelectorAll('[data-maxrow]').forEach(c => { if (c.checked) { try { rows[Number(c.dataset.maxrow)].apply(); n++; } catch (err) { toast('Failed: ' + err.message, true); } } });
    uiCloseOverlay();
    try { runSaveCheck(); } catch (e) { /* ignore */ }
    renderAll();
    toast(n ? `Maxed ${n} thing${n === 1 ? '' : 's'}` : 'Nothing selected');
  });
}

// ==== Remembered tab / fighter ====
// ---- 7. remembered tab / fighter ----------------------------------------------------
// uiRestoreLast(): after a save loads, go back to the last tab and fighter (cid) used, stored in localStorage.
function uiRestoreLast() {
  const t = uiLsGet('lid.tab');
  if (t && uiVisibleTabIds().includes(t) && t !== activeTab) { const b = document.querySelector(`[data-tab-btn="${t}"]`); if (b) b.click(); }
  const cid = uiLsGet('lid.chr');
  if (cid && SAVE && SAVE.soul) { const i = arr(SAVE.soul.chrs).findIndex(c => c && c.cid === cid); if (i >= 0 && i !== activeCharIdx) { activeCharIdx = i; renderAll(); } }
}
// uiRememberChar(): remember the selected fighter's cid.
function uiRememberChar() { try { const c = SAVE && SAVE.soul && SAVE.soul.chrs[activeCharIdx]; if (c && c.cid) uiLsSet('lid.chr', c.cid); } catch (e) { /* ignore */ } }

// ==== Range hints ====
// ---- 8. range hints --------------------------------------------------------------------
// Allowed-range text for specific inputs by element id.
const UI_RANGE_TEXT = { 'rb-num': '1 to 999,999', 'chr-name': 'Up to 32 characters', 'stew-seed': 'Whole number 0 to 4,294,967,295, or blank', 'tdm-point': null };
// uiHintFor(el) -> range text for an input, from the table above, data attributes or its min/max/step.
function uiHintFor(el) {
  if (el.id && UI_RANGE_TEXT[el.id] !== undefined && UI_RANGE_TEXT[el.id] !== null) return UI_RANGE_TEXT[el.id];
  if (el.dataset.stamp) return '0 to 99,999';
  if (el.dataset.vip) return '0 to 99,999';
  if (el.dataset.currency) { const m = el.getAttribute('data-max'); return m ? `0 to ${Number(m).toLocaleString()}` : '0 or more'; }
  if (el.dataset.qOrd !== undefined || el.dataset.qClr !== undefined) return '0 to 999,999';
  if (el.type === 'number') {
    const mn = el.getAttribute('min'), mx = el.getAttribute('max'), st = el.getAttribute('step');
    if (mn !== null && mx !== null) return `${Number(mn).toLocaleString()} to ${Number(mx).toLocaleString()}${st && st !== '1' && st !== 'any' && Number(st) > 1 ? `, steps of ${Number(st)}` : ''}`;
  }
  return '';
}
// uiRangeHints(): add an "Allowed:" line (or tooltip) once per numeric input.
function uiRangeHints() {
  document.querySelectorAll('#app input[type="number"], #app input[type="text"][data-currency], #app #chr-name, #app #stew-seed, #app #rb-num').forEach(el => {
    if (el.dataset.rngDone) return; el.dataset.rngDone = '1';
    const h = uiHintFor(el); if (!h) return;
    const host = el.closest('.field');
    if (host && host.querySelectorAll('input, select').length === 1 && !host.querySelector('.rng')) { const d = document.createElement('div'); d.className = 'rng'; d.textContent = 'Allowed: ' + h; host.appendChild(d); }
    else el.title = 'Allowed: ' + h + (el.title ? '. ' + el.title : '');
  });
}

// ==== Theme ====
// ---- 9. theme --------------------------------------------------------------------------
// uiApplyTheme(t): set data-theme (light/dark) and the toggle button glyph.
function uiApplyTheme(t) {
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  const b = document.getElementById('btn-theme'); if (b) { b.textContent = t === 'light' ? '🌙' : '☀'; b.title = t === 'light' ? 'Switch to the dark theme' : 'Switch to the light theme'; }
}
// Contrast helpers (WCAG-style): parse rgb(), relative luminance, ratio, effective background colour.
// light theme: rarity and status colours are written inline for the dark theme; darken any that would be hard to read
function uiRgb(c) { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(',').map(x => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; }
function uiLum(c) { const f = x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b) + .05; }
function uiRatio(a, b) { const x = uiLum(a), y = uiLum(b); return Math.max(x, y) / Math.min(x, y); }
function uiBgOf(el) { for (let e = el; e; e = e.parentElement) { const c = uiRgb(getComputedStyle(e).backgroundColor); if (c && c.a >= .5) return c; } return uiRgb(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255 }; }
// uiFixLight(): in the light theme darken inline-coloured text that would have poor contrast (target ratio 4.5), once per element.
function uiFixLight() {
  if (document.documentElement.getAttribute('data-theme') !== 'light') return;
  document.querySelectorAll('#app [style*="color"], #app .stewRarBadge').forEach(el => {
    if (el.dataset.lfix) return; el.dataset.lfix = '1';
    const fg = uiRgb(getComputedStyle(el).color), bg = uiBgOf(el); if (!fg || !bg) return;
    let c = { r: fg.r, g: fg.g, b: fg.b }, n = 0;
    while (uiRatio(c, bg) < 4.5 && n < 8 && uiLum(bg) > .3) { c = { r: c.r * .8, g: c.g * .8, b: c.b * .8 }; n++; }
    if (n) el.style.color = `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  });
}
// Debounce timer for uiFixLight.
let UI_FIX_T = 0;
// uiObserveTheme(): re-run uiFixLight after the app re-renders (light theme only).
function uiObserveTheme() {
  const app = document.getElementById('app');
  new MutationObserver(() => { if (document.documentElement.getAttribute('data-theme') !== 'light') return; clearTimeout(UI_FIX_T); UI_FIX_T = setTimeout(uiFixLight, 120); }).observe(app, { childList: true, subtree: true });
}
// uiToggleTheme(): flip theme, persist it, re-render.
function uiToggleTheme() { const t = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; uiApplyTheme(t); uiLsSet('lid.theme', t); if (SAVE) renderAll(); uiFixLight(); }

// ==== Drag and drop ====
// ---- 10. drag and drop ----------------------------------------------------------------------
// uiDropFiles(files): route dropped files. A masters.db is fed through the normal file input first, then (waiting up to 40 s for AP, the parsed masters data) the save is loaded via loadSaveFiles.
function uiDropFiles(files) {
  const list = Array.from(files || []); if (!list.length) return;
  const dbs = list.filter(f => /\.(db|sqlite3?)$/i.test(f.name)), saves = list.filter(f => /\.(sav|json)$/i.test(f.name));
  if (!dbs.length && !saves.length) { toast('Drop a masters.db or a .sav / .json save', true); return; }
  const go = async () => {
    if (dbs.length) {
      const dt = new DataTransfer(); dt.items.add(dbs[0]);
      const inp = document.getElementById('file-masters'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
      // wait for masters.db to finish before a save
      for (let i = 0; i < 400 && !AP; i++) await new Promise(r => setTimeout(r, 100));
    }
    if (saves.length) {
      if (!AP) { toast('Load masters.db first, then drop your save', true); return; }
      await loadSaveFiles(saves);
    }
  };
  go();
}
// uiWireDrop(): window-level drag handlers with a depth counter to show/hide the drop veil.
function uiWireDrop() {
  let depth = 0;
  const veil = document.getElementById('drop-veil');
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; veil.style.display = 'flex'; });
  window.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) veil.style.display = 'none'; });
  window.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; veil.style.display = 'none'; uiDropFiles(e.dataTransfer.files); });
}

// ==== Post-render hook ====
// ---- hook that runs after every renderAll -------------------------------------------------------
// uiAfterRender(): called after every renderAll. Wires tabs, hints and the Max button, snapshots SAVE as UI.origObj the first time a given RAW_SAV_ROOT is seen (this is the baseline for Undo), restores last tab/fighter, then refreshes tips, status and recent-saves record.
function uiAfterRender() {
  uiWireTabs();
  uiRangeHints();
  // Max-everything button on the Account tab
  const acc = document.querySelector('[data-tab-panel="account"] .block-body');
  if (acc && !document.getElementById('btn-max-safe')) {
    const w = document.createElement('div'); w.className = 'toolbar'; w.style.marginBottom = '12px';
    w.innerHTML = '<button class="action" id="btn-max-safe" title="Raise coins, currencies, TDM points, mastery (and optionally fighters) to the game\'s limits">⚡ Max everything safe…</button><span class="id">Shows what will change first; each value can be undone afterwards.</span>';
    acc.insertBefore(w, acc.firstChild);
    document.getElementById('btn-max-safe').addEventListener('click', uiOpenMax);
  }
  if (RAW_SAV_ROOT && UI.origRoot !== RAW_SAV_ROOT) {
    UI.origRoot = RAW_SAV_ROOT; UI.origObj = JSON.parse(JSON.stringify(SAVE)); UI.dlSig = null; UI.changes = null; UI.curSig = '';
    uiSyncTabs();
    if (!UI.restoring) { UI.restoring = true; try { uiRestoreLast(); } finally { UI.restoring = false; } }
  }
  uiRememberChar();
  uiFixLight();
  uiAddTips();
  uiStatusUpdate();
  uiScheduleStatus();
  if (UI.recRoot !== RAW_SAV_ROOT) { UI.recRoot = RAW_SAV_ROOT; if (RAW_SAV_ROOT) recRecord(); }
}

// ==== One-time wiring ====
// ---- one-time wiring --------------------------------------------------------------------------------------
// Startup wiring for the header buttons, search, drop and theme observer (runs once at script load).
(function uiInit() {
  uiApplyTheme(uiLsGet('lid.theme') === 'light' ? 'light' : 'dark');
  document.getElementById('btn-theme').addEventListener('click', uiToggleTheme);
  document.getElementById('btn-keys').addEventListener('click', uiHelp);
  document.getElementById('btn-recent').addEventListener('click', uiOpenRecent);
  document.getElementById('btn-psguide').addEventListener('click', uiOpenPsGuide);
  document.getElementById('btn-tour').addEventListener('click', uiTourStart);
  document.getElementById('sb-check').addEventListener('click', uiJumpProblem);
  uiTrackHeader();
  document.getElementById('sb-chg').addEventListener('click', () => uiOpenChanges());
  document.getElementById('sb-dl').addEventListener('click', () => { const b = document.getElementById('btn-download-sav'); if (b && !b.disabled) b.click(); });
  uiWireSearch();
  uiWireDrop();
  uiObserveTheme();
})();

