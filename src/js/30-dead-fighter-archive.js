// ==== Dead Fighter Archive tab constants ====
// UI state for the archive list: who = 'mine' | 'others' | 'all', text search, page index, open row (record did).
const GRAVE_FORM = { who: 'mine', search: '', page: 0, open: null };
// Rows per page.
const GRAVE_PAGE = 100;
// Memoizes graveRows() for the current raw root (the archive can be large).
let GRAVE_CACHE = { root: null, rows: null };

// The raw diedchara object (read from RAW_SAV_ROOT, never the friendly SAVE copy).
function graveRoot() { return RAW_SAV_ROOT && RAW_SAV_ROOT.diedchara; }

// Readable floor label for a floor id: stage prefix, floor number and resolved name; falls back to the raw id.
function graveFloor(flrid) {
  const f = (AP && AP.floorInfo || []).find(x => x.id === flrid);
  if (!f) return flrid || '?';
  const where = resolveName(f.name);
  return `${f.stgpfx || f.stgid || ''} ${f.sname ? f.sname + 'F' : ''}${where ? ' · ' + where : ''}`.trim();
}

// Flattens diedchara.dchrarcs[uid] lists into display rows {e, uid, mine, player, fighter, cls, where, team}, newest first.
// Own entries (uid === main uid) are matched to fighter names; other uids are the offline game's simulated players.
// Cached in GRAVE_CACHE.
function graveRows() {
  const dc = graveRoot();
  if (!dc) return [];
  if (GRAVE_CACHE.root === dc && GRAVE_CACHE.rows) return GRAVE_CACHE.rows;
  const me = String(RAW_SAV_MAIN_UID);
  const myNames = {};
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) myNames[c.cid] = c.name;
  const rawChrs = RAW_SAV_ROOT.soul && RAW_SAV_ROOT.soul.chr && RAW_SAV_ROOT.soul.chr.chrs && RAW_SAV_ROOT.soul.chr.chrs[me];
  for (const c of arr(rawChrs)) if (!myNames[c.cid]) myNames[c.cid] = c.name;
  const players = {};
  for (const u of arr(RAW_SAV_ROOT.dummy && RAW_SAV_ROOT.dummy.user)) players[String(u.uid)] = u.name;
  const myName = (RAW_SAV_ROOT.user && RAW_SAV_ROOT.user.nm) || 'You';
  const rows = [];
  for (const [uid, list] of Object.entries(dc.dchrarcs || {})) {
    for (const e of arr(list)) {
      const mine = uid === me;
      rows.push({
        e, uid, mine,
        player: mine ? myName : (players[uid] || `Player ${uid}`),
        fighter: mine ? (myNames[e.cid] || 'Fighter no longer in your freezer') : '',
        cls: CLASS_NAMES[e.type] || e.type || '?',
        where: graveFloor(e.flrid),
        team: teamName(e.tid) || (e.tid ? `Team ${e.tid}` : '')
      });
    }
  }
  rows.sort((a, b) => (b.e.created || 0) - (a.e.created || 0));
  GRAVE_CACHE = { root: dc, rows };
  return rows;
}

// Detail HTML for one record: stats (bodylvls), gear (pspts + eqpts site) and decals (eqskls), all keyed by uid then did.
// The game only keeps these for some fighters; otherwise a 'summary only' message is shown.
function graveDetails(r) {
  const dc = graveRoot(), uid = r.uid, did = r.e.did;
  const stats = arr(dc.bodylvls && dc.bodylvls[uid]).find(b => b.did === did);
  const pts = arr(dc.pspts && dc.pspts[uid] && dc.pspts[uid][did]);
  const eq = arr(dc.eqpts && dc.eqpts[uid] && dc.eqpts[uid][did]);
  const skl = arr(dc.eqskls && dc.eqskls[uid] && dc.eqskls[uid][did]);
  const siteOf = {};
  for (const x of eq) siteOf[x.eid] = String(x.site || '').replace(/^EQSITE_/, '');
  let h = '<div class="graveDetail">';
  h += `<div class="dtRel">Record ${escapeHtml(did || '')} · fighter ${escapeHtml(r.e.cid || '')}</div>`;
  if (stats) h += `<div><b>Level ${stats.lvl}</b> · HP ${stats.hp} · STR ${stats.str} · DEX ${stats.dex} · VIT ${stats.vit} · STM ${stats.stm} · LUK ${stats.luk} · decal slots +${stats.skill || 0} · bag +${stats.bag || 0}</div>`;
  if (pts.length) h += `<div><b>Gear:</b> ${pts.map(p => { const rec = PT_INDEX[p.ptid]; return `${escapeHtml(rec ? rec.name : p.ptid)}${rec ? ' +' + displayFromRaw(rec, p.lvl) : ''}${siteOf[p.eid] ? ` <span class="dtRel">(${escapeHtml(siteOf[p.eid])})</span>` : ''}`; }).join(', ')}</div>`;
  if (skl.length) h += `<div><b>Decals:</b> ${skl.slice().sort((a, b) => (a.slot || 0) - (b.slot || 0)).map(s => escapeHtml((SKL_INDEX[s.sklid] || {}).name || s.sklid)).join(', ')}</div>`;
  if (!stats && !pts.length && !skl.length) h += '<div class="dtRel">The game only kept the summary for this fighter.</div>';
  return h + '</div>';
}

// HTML shell for the Dead Fighter Archive tab (view only); filled by renderGraves().
function blockGraves() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Graveyard</div><h2>Dead Fighter Archive</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Every fighter that died, yours and other players', as the game recorded it. View only: nothing here changes your save.</div>
      <div id="grave-body"></div>
    </div>
  </section>`;
}

// Renders summary stats, filter/search/pagination and the (expandable) table. ENEMY state is displayed as 'Died'
// and CLEAR_ARCHIVE as 'Cleared'. Read-only.
function renderGraves() {
  const host = document.getElementById('grave-body');
  if (!host || !SAVE) return;
  const dc = graveRoot();
  if (!dc || !dc.dchrarcs) { host.innerHTML = '<div style="padding:10px; color:var(--text-faint); font-size:12px;">This save has no dead fighter archive.</div>'; return; }
  const all = graveRows();
  const mine = all.filter(r => r.mine);
  const playersN = new Set(all.filter(r => !r.mine).map(r => r.uid)).size;
  let size = 0;
  try { size = JSON.stringify(dc).length; } catch (e) {}
  const s = norm(GRAVE_FORM.search);
  const list = all.filter(r => GRAVE_FORM.who === 'all' || (GRAVE_FORM.who === 'mine') === r.mine)
    .filter(r => !s || norm(`${r.fighter} ${r.player} ${r.cls} ${r.where} ${r.team}`).includes(s));
  const pages = Math.max(1, Math.ceil(list.length / GRAVE_PAGE));
  GRAVE_FORM.page = Math.min(GRAVE_FORM.page, pages - 1);
  const pageRows = list.slice(GRAVE_FORM.page * GRAVE_PAGE, (GRAVE_FORM.page + 1) * GRAVE_PAGE);
  const byStage = {};
  for (const r of mine) { const k = r.where.split(' ')[0] || '?'; byStage[k] = (byStage[k] || 0) + 1; }

  let h = `<div class="stewStats">
    <div class="stewStat"><div class="k">Your dead fighters</div><div class="v">${mine.length}</div><div class="s">${Object.entries(byStage).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${escapeHtml(k)} ${v}`).join(' · ')}</div></div>
    <div class="stewStat"><div class="k">Other players'</div><div class="v">${(all.length - mine.length).toLocaleString()}</div><div class="s">from ${playersN} players</div></div>
    <div class="stewStat"><div class="k">Archive size</div><div class="v">${(size / 1048576).toFixed(1)} MB</div><div class="s">of your save's data</div></div>
  </div>`;
  h += `<div class="toolbar">
    <select id="grave-who" style="background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:6px 8px; font-family:var(--mono); font-size:12px;">
      ${[['mine', `Yours (${mine.length})`], ['others', `Other players (${all.length - mine.length})`], ['all', `All (${all.length})`]].map(([k, l]) => `<option value="${k}" ${GRAVE_FORM.who === k ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <input type="text" id="grave-search" placeholder="Search name, player, class, floor..." value="${escapeHtml(GRAVE_FORM.search)}" style="flex:1; max-width:320px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">
    <span class="count">${list.length.toLocaleString()} shown${pages > 1 ? ` · page ${GRAVE_FORM.page + 1} of ${pages}` : ''}</span>
  </div>`;
  h += '<table class="stewTable graveTable"><thead><tr><th>Died</th><th>Fighter</th><th>Class</th><th>Where</th><th>Kill Coins</th><th>Status</th></tr></thead><tbody>';
  h += pageRows.map(r => {
    const e = r.e, open = GRAVE_FORM.open === e.did;
    const status = e.state === 'ENEMY' ? 'Died' : e.state === 'CLEAR_ARCHIVE' ? 'Cleared' : (e.state || '');
    return `<tr class="graveRow" data-grave="${escapeHtml(e.did || '')}" style="cursor:pointer;">
      <td>${dtIsDateValue(e.created) ? escapeHtml(dtFmt(e.created)) : '?'}</td>
      <td>${r.mine ? `<b>${escapeHtml(r.fighter)}</b>` : escapeHtml(r.player)}${r.team ? `<div class="dtRel">${escapeHtml(r.team)}</div>` : ''}</td>
      <td>${escapeHtml(r.cls)}<div class="dtRel">grade ${e.grade != null ? e.grade : '?'}${e.limit_break ? ` · LB ${e.limit_break}` : ''}${e.rank ? ` · rank ${e.rank}` : ''}</div></td>
      <td>${escapeHtml(r.where)}</td>
      <td>${Number(e.money || 0).toLocaleString()}</td>
      <td title="${escapeHtml(e.state || '')}">${escapeHtml(status)}</td></tr>
      ${open ? `<tr><td colspan="6" style="background:var(--bg);">${graveDetails(r)}</td></tr>` : ''}`;
  }).join('') || '<tr><td colspan="6" style="color:var(--text-faint);">No matches.</td></tr>';
  h += '</tbody></table>';
  if (pages > 1) h += `<div class="toolbar" style="justify-content:center;"><button class="subtle" id="grave-prev" ${GRAVE_FORM.page ? '' : 'disabled'}>◂ Newer</button><span class="count" style="margin:0;">page ${GRAVE_FORM.page + 1} of ${pages}</span><button class="subtle" id="grave-next" ${GRAVE_FORM.page < pages - 1 ? '' : 'disabled'}>Older ▸</button></div>`;
  h += '<div class="capNote">Status is what the save records: ENEMY is shown as "Died" and CLEAR_ARCHIVE as "Cleared". The game never updates these records, so a fighter you later recovered still shows here. Fighters who are dead right now are marked ☠ on the Fighters tab, where you can recover them. Click a row for stats, gear and decals when the game kept them.</div>';
  host.innerHTML = h;

  document.getElementById('grave-who').addEventListener('change', e => { GRAVE_FORM.who = e.target.value; GRAVE_FORM.page = 0; renderGraves(); });
  document.getElementById('grave-search').addEventListener('change', e => { GRAVE_FORM.search = e.target.value; GRAVE_FORM.page = 0; renderGraves(); });
  const prev = document.getElementById('grave-prev'), next = document.getElementById('grave-next');
  if (prev) prev.addEventListener('click', () => { GRAVE_FORM.page--; renderGraves(); });
  if (next) next.addEventListener('click', () => { GRAVE_FORM.page++; renderGraves(); });
  host.querySelectorAll('[data-grave]').forEach(tr => tr.addEventListener('click', () => {
    GRAVE_FORM.open = GRAVE_FORM.open === tr.dataset.grave ? null : tr.dataset.grave;
    renderGraves();
  }));
}

// Tab hook: render the archive only when its tab is active.
function wireGraves() { if (activeTab === 'graves') renderGraves(); }

// ---------------------------------------------------------------------------
// COMPARE two saves. Load a second save (B) next to the one being edited (A),
// see what differs, and copy selected parts of B into A: account values,
// fighters (with their gear, bag and decals), research, decal stock, Waiting
// Room decorations, Reward Box items and Storage items. You also choose which
// account the downloaded save belongs to: A's (default) or B's, in which case
// every uid-keyed part of the save is re-keyed to B's uid and B's account
// identity (name, Steam ID, ...) is used.
// B is only read; nothing in B is ever written.
// ---------------------------------------------------------------------------

