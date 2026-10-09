// ==== Waiting Room decorations (soul.hubcustom) ====
// ---------------------------------------------------------------------------
// WAITING ROOM customization (soul.hubcustom)
// Each decoration is {cstmid, flg}, a bit set (from real saves, incl. a fresh
// game where all 103 non-default decorations are 1 and the 10 defaults are 6):
//   1 = NOT owned, marked "new" in the shop   0 = not owned (seen)
//   2 = owned                                  4 = the one shown for that spot
// Defaults are 6 (owned + shown); bought decorations in use are 4. So owned =
// bit 2 or 4 (flg & 6). Unlocking writes 2 (confirmed working in game). master_hubcustomize gives the
// spot (site), order and name; platform 1 = World of Tanks items that were
// PlayStation-only.
// ---------------------------------------------------------------------------

// Decoration spots (site code, fallback name).
const HUB_SITES = [
  [ 'WAL', 'Wall' ], [ 'FLR', 'Floor' ], [ 'PLR', 'Pillar' ], [ 'FNT', 'Fountain' ], [ 'FLG', 'Flag' ],
  [ 'PST', 'Poster' ], [ 'OBJ', 'Giant Object' ], [ 'ILM', 'Neon' ], [ 'PLT', 'Potted Plant' ], [ 'ET0', 'RC Car' ]
];
// Localization keys for site names, resolved with resolveName('DECORATION.' + key).
const HUB_SITE_TEXT = { WAL: 'TXT_DECO_WALL', FLR: 'TXT_DECO_FLOOR', PLR: 'TXT_DECO_PILLAR', FNT: 'TXT_DECO_FOUNTAIN', FLG: 'TXT_DECO_FLAG', PST: 'TXT_DECO_POSTER', OBJ: 'TXT_DECO_DECORATION1', ILM: 'TXT_DECO_DECORATION2', PLT: 'TXT_DECO_DECORATION3', ET0: 'TXT_DECO_DECORATION4' };
// Per-save original snapshot (for Undo) and last log message.
let HUB_STATE = { root: null, original: null, lastMsg: '' };
// includePs: show PlayStation-only (World of Tanks) items.
const HUB_FORM = { includePs: false };

// True if the decoration flag has bit 2 or 4 set (owned).
const hubOwned = e => !!e && ((Number(e.flg) || 0) & 6) !== 0;
// Returns SAVE.soul.hubcustom (array of {cstmid, flg}) or null.
function hubData() {
  const s = SAVE && SAVE.soul;
  return s && Array.isArray(s.hubcustom) ? s.hubcustom : null;
}
// Snapshots hub data when a new save is loaded.
function hubSync() {
  if (HUB_STATE.root !== RAW_SAV_ROOT) {
    const h = hubData();
    HUB_STATE = { root: RAW_SAV_ROOT, original: h ? JSON.parse(JSON.stringify(h)) : null, lastMsg: '' };
  }
}
// Index of master_hubcustomize rows by id.
function hubMeta() {
  const m = {};
  for (const r of arr(AP && AP.hubCustom)) m[r.id] = r;
  return m;
}
// Localized spot name with fallback.
function hubSiteName(site) {
  const t = HUB_SITE_TEXT[site] && resolveName('DECORATION.' + HUB_SITE_TEXT[site]);
  const d = HUB_SITES.find(s => s[0] === site);
  return t || (d ? d[1] : site);
}

// Static HTML for the Waiting Room tab.
function blockHub() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Remodel</div><h2>Waiting Room</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Unlock Waiting Room decorations and choose which one each spot shows. One decoration per spot is in use. World of Tanks items were PlayStation-only and are hidden unless you tick the box.</div>
      <div id="hub-body"></div>
    </div>
  </section>`;
}

// Renders decorations grouped by spot with Unlock / Use / Lock buttons. Items missing from the save are
// shown as locked "virtual" entries and appended to soul.hubcustom only when changed (ensure()).
// "Use" clears bit 4 on the spot's previous item so only one is shown per spot.
function renderHub() {
  const host = document.getElementById('hub-body');
  if (!host || !SAVE) return;
  hubSync();
  const list = hubData();
  if (!list) { host.innerHTML = '<div class="warnNote">This save has no Waiting Room data (soul.hubcustom).</div>'; return; }
  const meta = hubMeta();
  // decorations the game knows about but the save has no entry for yet are
  // shown as locked; they're only added to the save if you unlock or use one
  const byId = {};
  for (const e of list) byId[e.cstmid] = e;
  const virtual = Object.keys(meta).filter(id => !byId[id]).map(id => ({ cstmid: id, flg: 0 }));
  for (const e of virtual) byId[e.cstmid] = e;
  const all = list.concat(virtual);
  const ensure = e => { if (!list.includes(e)) list.push(e); return e; };
  const changed = JSON.stringify(list) !== JSON.stringify(HUB_STATE.original);
  const siteOf = e => (meta[e.cstmid] && meta[e.cstmid].site) || e.cstmid.split('_')[2];
  const visible = e => HUB_FORM.includePs || !(meta[e.cstmid] && meta[e.cstmid].platform === 1) || hubOwned(e);
  const owned = all.filter(hubOwned).length;
  const lockedVisible = all.filter(e => !hubOwned(e) && visible(e)).length;
  let h = '';
  if (changed) h += `<div class="warnNote" style="display:flex; gap:10px; align-items:center; border-color:var(--good); color:var(--good-bright);"><div style="flex:1;">Waiting Room changed. Download the .sav to keep it.</div><button class="subtle" id="hub-undo">Undo all Waiting Room changes</button></div>`;
  if (HUB_STATE.lastMsg) h += `<pre class="stewLog">${escapeHtml(HUB_STATE.lastMsg)}</pre>`;
  h += `<div class="toolbar"><span style="font-size:12px;">${owned} of ${all.length} decorations owned</span>
    <label class="stewHlOnly"><input type="checkbox" id="hub-ps" ${HUB_FORM.includePs ? 'checked' : ''}> Include PlayStation-only (World of Tanks)</label>
    <span style="flex:1;"></span><button class="action" id="hub-unlock-all" ${lockedVisible ? '' : 'disabled'}>Unlock all shown (${lockedVisible})</button></div>`;
  const sites = HUB_SITES.map(s => s[0]).concat([ ...new Set(all.map(siteOf)) ].filter(s => !HUB_SITES.some(x => x[0] === s)));
  for (const site of sites) {
    const items = all.filter(e => siteOf(e) === site && visible(e)).sort((a, b) => ((meta[a.cstmid] || {}).sort || 0) - ((meta[b.cstmid] || {}).sort || 0));
    if (!items.length) continue;
    const inUse = items.find(e => e.flg & 4);
    h += `<div class="subDetails" style="padding:10px; margin-bottom:10px;">
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:6px;"><b style="font-size:14px;">${escapeHtml(hubSiteName(site))}</b><span class="id">showing: ${escapeHtml(inUse ? (resolveName((meta[inUse.cstmid] || {}).name) || inUse.cstmid) : 'nothing')}</span><span style="flex:1;"></span><span class="id">${items.filter(hubOwned).length} / ${items.length} owned</span></div>
      <div class="listBlock" style="max-height:none;">`;
    h += items.map(e => {
      const m = meta[e.cstmid] || {};
      const nm = resolveName(m.name) || e.cstmid;
      const use = !!(e.flg & 4);
      const isDefault = /_NONE$/.test(e.cstmid);
      return `<div class="listRow"><div class="name">${escapeHtml(nm)} ${m.platform === 1 ? '<span class="badge">PS only</span>' : ''}</div>
        ${use ? '<span class="badge current">IN USE</span>' : hubOwned(e) ? '<span class="badge">owned</span>' : '<span class="badge" style="opacity:0.5;">locked</span>'}
        <span class="id" style="width:28px; text-align:right;" title="raw flag">${e.flg}</span>
        ${hubOwned(e) ? '' : `<button class="subtle" data-hub-unlock="${e.cstmid}">Unlock</button>`}
        ${use ? '' : `<button class="subtle" data-hub-use="${e.cstmid}">Use</button>`}
        ${hubOwned(e) && !use && !isDefault ? `<button class="subtle" data-hub-lock="${e.cstmid}">Lock</button>` : ''}
      </div>`;
    }).join('');
    h += '</div></div>';
  }
  host.innerHTML = h;

  const name = id => resolveName((meta[id] || {}).name) || id;
  const redo = msg => { HUB_STATE.lastMsg = msg || ''; renderHub(); if (msg) toast(msg.split('\n')[0]); };
  const undo = document.getElementById('hub-undo');
  if (undo) undo.addEventListener('click', () => {
    list.length = 0;
    for (const e of JSON.parse(JSON.stringify(HUB_STATE.original))) list.push(e);
    redo('Waiting Room restored to how it was when you loaded the save.');
  });
  document.getElementById('hub-ps').addEventListener('change', e => { HUB_FORM.includePs = e.target.checked; renderHub(); });
  document.getElementById('hub-unlock-all').addEventListener('click', () => {
    let n = 0;
    for (const e of all) if (!hubOwned(e) && visible(e)) { ensure(e).flg = 2; n++; }
    redo(`Unlocked ${n} decoration${n === 1 ? '' : 's'}.`);
  });
  host.querySelectorAll('[data-hub-unlock]').forEach(b => b.addEventListener('click', () => {
    ensure(byId[b.dataset.hubUnlock]).flg = 2;
    redo(`Unlocked ${name(b.dataset.hubUnlock)}.`);
  }));
  host.querySelectorAll('[data-hub-use]').forEach(b => b.addEventListener('click', () => {
    const e = ensure(byId[b.dataset.hubUse]);
    const site = siteOf(e);
    for (const o of list) if (o !== e && siteOf(o) === site && (o.flg & 4)) o.flg = (o.flg & ~4) || 2;
    e.flg = (hubOwned(e) ? (e.flg & 6) : 2) | 4;
    redo(`${hubSiteName(site)} now shows ${name(e.cstmid)}.`);
  }));
  host.querySelectorAll('[data-hub-lock]').forEach(b => b.addEventListener('click', () => {
    byId[b.dataset.hubLock].flg = 0;
    redo(`Locked ${name(b.dataset.hubLock)}.`);
  }));
}

// Tab wiring.
function wireHub() { if (activeTab === 'hub') renderHub(); }

// ==== Screenshots (view/export only) ====
// ---------------------------------------------------------------------------
// SCREENSHOTS (soul.screenshot) - Kiwako's commemorative photos, one per large
// stamp (boss 1-4), stored inside the save as base64 PNGs (256x256). The game
// refers to them, so this tab is view/export only and never changes the save.
// ---------------------------------------------------------------------------

// Ordinal words indexed by boss number 1..4.
const PHOTO_ORDINAL = [ '', 'first', 'second', 'third', 'fourth' ];

// Returns soul.screenshot array (or []).
function photoList() {
  const s = SAVE && SAVE.soul;
  return s && Array.isArray(s.screenshot) ? s.screenshot : [];
}
// Decodes a base64 string into a Uint8Array.
function photoBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// ==== Photos tab (Kiwako's commemorative photos, view/export only) ====
// Display title for a photo record: boss id is mapped through PHOTO_ORDINAL to "Your Nth large stamp".
// @param p {{boss:string, photo:string, created:number}} a photo entry from photoList()
function photoTitle(p) {
  const o = PHOTO_ORDINAL[p.boss];
  return o ? `Your ${o} large stamp` : `Photo ${p.boss}`;
}
// Download file name for a photo: LET_IT_DIE_photo_<boss>_<YYYY-MM-DD>.png ('undated' if p.created is not a sane unix time).
function photoFileName(p) {
  const d = dtIsDateValue(p.created) ? new Date(p.created * 1000) : null;
  const ds = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : 'undated';
  return `LET_IT_DIE_photo_${p.boss}_${ds}.png`;
}
// Decodes the photo's base64 PNG (photoBytes) and triggers a browser download. Read-only; the save is untouched.
function photoExport(p) {
  triggerDownload(photoBytes(p.photo), photoFileName(p), 'image/png');
}

// HTML shell for the Photos tab; the grid itself is filled in later by renderPhotos() into #photo-body.
function blockPhotos() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Kiwako's photos</div><h2>Screenshots</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Kiwako takes a commemorative photo each time you earn a large stamp, and the game keeps it inside your save. You can view and export them here. They can't be deleted or changed, because the game refers to them; nothing on this tab changes your save.</div>
      <div id="photo-body"></div>
    </div>
  </section>`;
}

// Renders the photo grid, per-photo View/Export buttons, 'Export all' (staggered 400 ms apart so the browser
// does not block multiple downloads) and a click-to-zoom modal. Photos are inline base64 PNGs, so the size shown
// is estimated as base64 length * 3/4. Never modifies SAVE.
function renderPhotos() {
  const host = document.getElementById('photo-body');
  if (!host || !SAVE) return;
  const list = photoList().filter(p => p && typeof p.photo === 'string' && p.photo.length);
  if (!list.length) { host.innerHTML = '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No photos in this save yet.</div>'; return; }
  const total = list.reduce((a, p) => a + Math.floor(p.photo.length * 3 / 4), 0);
  let h = `<div class="toolbar"><span style="font-size:12px;">${list.length} photo${list.length === 1 ? '' : 's'}, ${(total / 1024).toFixed(0)} KB</span><span style="flex:1;"></span><button class="action" id="photo-export-all">Export all as PNG</button></div>`;
  h += '<div class="photoGrid">';
  h += list.map((p, i) => `<figure class="photoCard">
      <img src="data:image/png;base64,${p.photo}" alt="${escapeHtml(photoTitle(p))}" data-photo-view="${i}">
      <figcaption><b>${escapeHtml(photoTitle(p))}</b><div class="dtRel">${dtIsDateValue(p.created) ? escapeHtml(dtFmt(p.created)) : 'no date'} · ${(p.photo.length * 3 / 4 / 1024).toFixed(0)} KB</div>
      <div style="display:flex; gap:6px; margin-top:6px;"><button class="subtle" data-photo-view="${i}">View</button><button class="subtle" data-photo-export="${i}">Export PNG</button></div></figcaption>
    </figure>`).join('');
  h += '</div><div class="photoModal" id="photo-modal" hidden><div class="photoModalInner"><img id="photo-modal-img" alt=""><div id="photo-modal-cap" style="margin-top:8px; font-size:12px;"></div><button class="subtle" id="photo-modal-close" style="margin-top:8px;">Close</button></div></div>';
  host.innerHTML = h;
  host.querySelectorAll('[data-photo-export]').forEach(b => b.addEventListener('click', () => {
    const p = list[Number(b.dataset.photoExport)];
    photoExport(p);
    toast(`Exported ${photoFileName(p)}`);
  }));
  document.getElementById('photo-export-all').addEventListener('click', () => {
    list.forEach((p, i) => setTimeout(() => photoExport(p), i * 400));
    toast(`Exporting ${list.length} photo${list.length === 1 ? '' : 's'}...`);
  });
  const modal = document.getElementById('photo-modal');
  const close = () => { modal.hidden = true; };
  host.querySelectorAll('[data-photo-view]').forEach(el => el.addEventListener('click', () => {
    const p = list[Number(el.dataset.photoView)];
    document.getElementById('photo-modal-img').src = `data:image/png;base64,${p.photo}`;
    document.getElementById('photo-modal-cap').textContent = `${photoTitle(p)}${dtIsDateValue(p.created) ? ' · ' + dtFmt(p.created) : ''}`;
    modal.hidden = false;
  }));
  document.getElementById('photo-modal-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

// Tab hook: re-render the Photos tab only when it is the active one.
function wirePhotos() { if (activeTab === 'photos') renderPhotos(); }

// ---------------------------------------------------------------------------
// SAVE CHECK - runs when a save is loaded (and on "Re-check") and lists known
// problems, each with a link to the tab that deals with it and, where the fix
// is safe and well understood, a one-click fix. Results are cached so the panel
// can be redrawn by renderAll without re-running the checks.
// ---------------------------------------------------------------------------

// Cached result of runSaveCheck(): {items:[{level,text,tab,fix,tabName}], ranAt, open (panel expanded?), lastMsg}.
// Cached so renderAll() can redraw the panel without re-running every check.
let HEALTH = { items: [], ranAt: 0, open: null };
// Counters filled in while loading a save (e.g. repairedChars = broken text characters fixed on load).
let HEALTH_LOAD = { repairedChars: 0 };
// ---- Individual safety checks. Each X() finds problems (read-only); a matching fixX() repairs them. ----
// Returns fighters whose stored decal slots / Death Bag / rage exceed what their type, grade and limit break allow.
// Each entry: {c: fighter, R: fighterRanges(..), lim: allowed bought amounts, has: stored amounts, over: [keys over]}.
// Fighters whose extra decal slots, Death Bag or rage (bodyuser skill / bag / rage, stored above the type's base)
// are more than their type, grade and limit break allow (master_body_detail). The game never writes these (every
// game-made fighter in the test saves is within its caps); they come from other editors or old editor versions,
// e.g. a Grade 6 Limit Break 0 Brawler saved with +9 slots, +4 bag, +9 rage. Reported, and fixed only when asked.
function fightersOverCap() {
  const out = [];
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) {
    // CONCILIATE fighters (taken from other players) keep the stats and upgrades of their own limit break while the
    // game stores them at Limit Break 0 (seen in game saves: 30-45 stats, +3 slots / +9 bag), so they're not checked
    if (!c || !c.bodylvl || c.state === 'ENEMY' || c.state === 'DUMMY' || c.state === 'CONCILIATE') continue;
    const R = fighterRanges(c.type || 'BAL', c.grade != null ? c.grade : 1, c.limit_break || 0);
    const lim = { skill: R.skillCap - R.skillBase, bag: R.bagCap - R.bagBase, rage: R.rageCap - R.rageBase };
    const has = { skill: Number(c.bodylvl.skill) || 0, bag: Number(c.bodylvl.bag) || 0, rage: Number(c.rage) || 0 };
    const over = Object.keys(lim).filter(k => has[k] > lim[k]);
    if (over.length) out.push({ c, R, lim, has, over });
  }
  return out;
}
// Clamps over-cap bought slots / bag / rage back to the limits and recomputes the level. Returns number of fighters fixed.
function fixFightersOverCap() {
  const list = fightersOverCap();
  for (const o of list) {
    if (o.has.skill > o.lim.skill) o.c.bodylvl.skill = o.lim.skill;
    if (o.has.bag > o.lim.bag) o.c.bodylvl.bag = o.lim.bag;
    if (o.has.rage > o.lim.rage) o.c.rage = o.lim.rage;
    recomputeLevel(o.c);
  }
  return list.length;
}
