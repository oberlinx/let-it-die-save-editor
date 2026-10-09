// ==== Download history (IndexedDB) ====
// ---------------------------------------------------------------------------
// Download history: every download is also kept in this browser (IndexedDB, its own database), with the save
// as it was loaded the first time a download is made from it, so a bad edit can be rolled back even if the
// original file was replaced. The last HIST_MAX entries are kept. Nothing leaves the computer.
// ---------------------------------------------------------------------------
// IndexedDB database/store for kept downloads (separate from the recent-saves DB).
const HIST_IDB = { db: 'lid-editor-history', store: 'saves' };
// Maximum entries kept; the oldest are pruned in histPut.
const HIST_MAX = 12;
// localStorage key for the on/off preference (default on).
const HIST_PREF_KEY = 'lid.history.on';
// Tracks which loaded save already had its pristine "original" copy stored, so it is stored only once per load.
let HIST_LOADED = { root: null, kept: false };
// histOn()/histSetOn(): read/write the preference; storage failures (private mode) fall back to enabled / ignore.
function histOn() { try { return localStorage.getItem(HIST_PREF_KEY) !== '0'; } catch (err) { return true; } }
function histSetOn(on) { try { localStorage.setItem(HIST_PREF_KEY, on ? '1' : '0'); } catch (err) {} }
// histOpen() -> Promise<IDBDatabase>: open (and create on first use) the history database.
function histOpen() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('this browser has no IndexedDB')); return; }
    const req = indexedDB.open(HIST_IDB.db, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HIST_IDB.store, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
// histTx(mode, fn): run fn(store, setResult) in one transaction and resolve with the value passed to setResult once the transaction completes. Always closes the connection.
async function histTx(mode, fn) {
  const idb = await histOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(HIST_IDB.store, mode);
      let out;
      Promise.resolve(fn(tx.objectStore(HIST_IDB.store), v => { out = v; })).catch(reject);
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('aborted'));
    });
  } finally { idb.close(); }
}
// histList() -> entries newest first.
function histList() {
  return histTx('readonly', (st, done) => { const r = st.getAll(); r.onsuccess = () => done((r.result || []).sort((a, b) => b.id - a.id)); });
}
// histGet(id) / histDelete(id) / histClear(): single-record read, delete, and wipe.
function histGet(id) { return histTx('readonly', (st, done) => { const r = st.get(id); r.onsuccess = () => done(r.result || null); }); }
function histDelete(id) { return histTx('readwrite', st => { st.delete(id); }); }
function histClear() { return histTx('readwrite', st => { st.clear(); }); }
// histPut(entry): add an entry, then delete everything beyond the newest HIST_MAX.
async function histPut(entry) {
  await histTx('readwrite', st => { st.add(entry); });
  const all = await histList();
  for (const e of all.slice(HIST_MAX)) await histDelete(e.id);
}
// Number of real (non-dead, non-dummy) fighters, for the history list.
function histFighters() { return arr(SAVE && SAVE.soul && SAVE.soul.chrs).filter(c => c && c.state !== 'ENEMY' && c.state !== 'DUMMY').length; }
// histRecord(kind, fname, data, sections): store the downloaded bytes (Blob) plus a short change summary (max 40 lines).
// The first time a download is made from a given load, the original file is stored too (timestamped 1 ms earlier so it sorts before). Failures only toast; the download itself already happened.
// called after a download was written; data is exactly what was downloaded
async function histRecord(kind, fname, data, sections) {
  if (!histOn()) return;
  try {
    const account = (RAW_SAV_ROOT && RAW_SAV_ROOT.user && RAW_SAV_ROOT.user.nm) || '';
    const base = { account, source: ORIG_SAVE.name || '', fighters: histFighters(), platform: isPsSave() ? 'PS' : 'PC' };
    if (!(HIST_LOADED.root === RAW_SAV_ROOT && HIST_LOADED.kept) && ORIG_SAVE.root === RAW_SAV_ROOT) {
      let orig = null, oname = ORIG_SAVE.name || 'original.sav';
      if (ORIG_SAVE.file) orig = await ORIG_SAVE.file.arrayBuffer();
      else if (ORIG_SAVE.text) { orig = await buildBrgSav(JSON.parse(ORIG_SAVE.text)); oname = oname.replace(/\.json$/i, '') + '.sav'; }
      if (orig) await histPut(Object.assign({ when: Date.now() - 1, type: 'original', name: oname, kind: /\.json$/i.test(oname) ? 'json' : 'sav', changes: 0, lines: [], data: new Blob([ orig ]) }, base));
      HIST_LOADED = { root: RAW_SAV_ROOT, kept: true };
    }
    const lines = [];
    for (const s of sections || []) for (const l of s.lines) if (lines.length < 40) lines.push(`${s.title}: ${l}`);
    await histPut(Object.assign({ when: Date.now(), type: 'download', name: fname, kind, changes: (sections || []).reduce((k, s) => k + s.lines.length, 0), lines, data: new Blob([ data ]) }, base));
  } catch (err) {
    console.warn('Download history:', err);
    toast("The download worked, but it couldn't be kept in Download history (" + err.message + ')', true);
  }
}
// histSize(bytes) -> "1.2 MB" / "340 KB".
function histSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
// openHistory(): overlay listing kept downloads with Download again / Open in editor (re-loads through loadSaveFiles, requires masters.db) / delete / clear and the keep-copies toggle.
async function openHistory() {
  reviewClose();
  const ov = document.createElement('div');
  ov.id = 'review-overlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.7); display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; overflow:auto;';
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) reviewClose(); });
  document.addEventListener('keydown', reviewKey);
  let list = [], err = '';
  try { list = await histList(); } catch (e) { err = e.message; }
  const row = e => `<div class="listRow" style="flex-wrap:wrap; gap:6px; align-items:flex-start;">
      <div style="flex:1; min-width:260px;">
        <div><b>${escapeHtml(new Date(e.when).toLocaleString())}</b> · ${e.type === 'original' ? '<span class="badge">Original, as loaded</span>' : `<span class="badge">Download</span> ${e.changes} change${e.changes === 1 ? '' : 's'}`}</div>
        <div class="id">${escapeHtml(e.name)} · ${escapeHtml(e.account || '—')} · ${e.platform || ''} · ${e.fighters} fighter${e.fighters === 1 ? '' : 's'} · ${histSize((e.data && e.data.size) || 0)}${e.source && e.source !== e.name ? ` · from ${escapeHtml(e.source)}` : ''}</div>
        ${e.lines && e.lines.length ? `<details style="margin-top:4px;"><summary style="cursor:pointer; font-size:12px;">What changed</summary><ul style="margin:4px 0 0 18px; padding:0; font-size:12px; line-height:1.5;">${e.lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}${e.changes > e.lines.length ? `<li>… and ${e.changes - e.lines.length} more</li>` : ''}</ul></details>` : ''}
      </div>
      <div class="toolbar" style="margin:0;">
        <button class="subtle" data-hist-dl="${e.id}">Download again</button>
        <button class="subtle" data-hist-open="${e.id}">Open in editor</button>
        <button class="subtle" data-hist-del="${e.id}" title="Remove from this list">✕</button>
      </div>
    </div>`;
  ov.innerHTML = `<section class="block" style="max-width:900px; width:100%; margin:0;">
    <div class="block-head"><div><div class="eyebrow">Kept in this browser</div><h2>Download history</h2></div><div class="id">${list.length} of ${HIST_MAX}</div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Every save you download is also kept here, plus the save as you loaded it the first time you download from it, so you can go back if an edit goes wrong. The last ${HIST_MAX} are kept, only in this browser on this computer. <b>Download again</b> gives you the file to put back in the game; <b>Open in editor</b> loads it here.</div>
      <label style="cursor:pointer; display:inline-block; margin:4px 0 8px;"><input type="checkbox" id="hist-on" ${histOn() ? 'checked' : ''} style="width:auto; margin-right:6px;">Keep a copy of every download</label>
      ${err ? `<div class="capNote">Download history isn't available in this browser (${escapeHtml(err)}). Private windows often block it.</div>` : ''}
      <div class="listBlock" style="max-height:55vh; overflow:auto;">${list.length ? list.map(row).join('') : '<div style="padding:10px; color:var(--text-faint); font-size:12px;">Nothing yet. Downloads you make appear here.</div>'}</div>
      <div class="toolbar" style="margin-top:10px;">
        ${list.length ? '<button class="subtle" id="hist-clear">Clear history</button>' : ''}
        <button class="subtle" id="hist-close">Close</button>
      </div>
    </div>
  </section>`;
  const byId = id => list.find(e => e.id === Number(id));
  document.getElementById('hist-close').addEventListener('click', reviewClose);
  document.getElementById('hist-on').addEventListener('change', e => { histSetOn(e.target.checked); toast(e.target.checked ? 'Downloads will be kept in Download history' : 'Downloads will no longer be kept (the list stays until you clear it)'); });
  const clr = document.getElementById('hist-clear');
  if (clr) clr.addEventListener('click', async () => { if (!confirm('Remove every save kept in Download history? Your downloaded files are not affected.')) return; try { await histClear(); } catch (e) {} openHistory(); });
  ov.querySelectorAll('[data-hist-del]').forEach(b => b.addEventListener('click', async () => { const e = byId(b.dataset.histDel); if (!e || !confirm(`Remove ${e.name} (${new Date(e.when).toLocaleString()}) from Download history? Downloaded files are not affected.`)) return; try { await histDelete(e.id); } catch (x) {} openHistory(); }));
  ov.querySelectorAll('[data-hist-dl]').forEach(b => b.addEventListener('click', async () => {
    const e = byId(b.dataset.histDl); if (!e) return;
    const full = await histGet(e.id); if (!full || !full.data) { toast('That copy is gone', true); return; }
    const nm = e.type === 'original' ? `brggame_backup_${reviewStamp(new Date(e.when))}.${e.kind}` : e.name;
    triggerDownload(await full.data.arrayBuffer(), nm, e.kind === 'json' ? 'application/json' : 'application/octet-stream');
    toast(`Downloaded ${nm}. Rename it to your save's name (e.g. brggame.sav) to use it.`);
  }));
  ov.querySelectorAll('[data-hist-open]').forEach(b => b.addEventListener('click', async () => {
    const e = byId(b.dataset.histOpen); if (!e) return;
    if (!AP) { toast('Load masters.db first', true); return; }
    if (SAVE && !confirm('Open this copy in the editor? It replaces the save you are editing; edits you haven\'t downloaded are lost.')) return;
    const full = await histGet(e.id); if (!full || !full.data) { toast('That copy is gone', true); return; }
    reviewClose();
    { const hf = new File([ await full.data.arrayBuffer() ], e.name, { type: 'application/octet-stream' }); hf.__src = 'history:' + e.id; await loadSaveFiles([ hf ]); }
    // this copy is already in the history, so a download from it doesn't keep it again
    if (RAW_SAV_ROOT) HIST_LOADED = { root: RAW_SAV_ROOT, kept: true };
  }));
}

// triggerDownload(data, filename, mime): save bytes/text via a temporary object URL and hidden <a download> click; the URL is revoked after 1 s.
function triggerDownload(data, filename, mime) {
  const blob = new Blob([ data ], {
    type: mime
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}


