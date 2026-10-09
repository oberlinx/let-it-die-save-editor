// ==== Quests tab: state, metadata lookups ====
// ---------------------------------------------------------------------------
// QUESTS tab
// Offline saves keep quests in soul.quest:
//   ord  : quests currently taken   {qid, prgnow, prgmax, timer, expire, term, rwd, order}
//   user : history for every offline quest {qid, ordcnt (times taken), clrcnt (times cleared)}
//   dis/dfs/dss : per-quest extra data keyed by qid (left alone)
//   hash : game checksum of unknown input (left alone)
// SAVE.soul.quest is the same object the save is rebuilt from, so edits here
// ship with Download .sav.
// ---------------------------------------------------------------------------

// UI state for the Quests tab: active sub-tab (open), history filter/search, add-search, and whether locked quests are listed.
const QUEST_FORM = { histFilter: 'all', histSearch: '', addSearch: '', showLocked: false, open: 'active' };
// Per-save state: root it belongs to, a deep-copied snapshot of {ord,user} for 'Undo all', and the last status message.
let QUEST_STATE = { root: null, original: null, lastMsg: '' };

// questData(): returns SAVE.soul.quest (normalizing ord/user to arrays) or null if the save has no quest object.
// The game writes an empty list as {}, so arrays are forced here and converted back by questOrdForSave().
function questData() {
  const soul = SAVE && SAVE.soul;
  const q = soul && soul.quest;
  if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
  if (!Array.isArray(q.ord)) q.ord = [];
  if (!Array.isArray(q.user)) q.user = [];
  return q;
}

// The game writes an empty quest list as {} (a list with quests as [...]);
// the tab works on an array, so put {} back before a download.
// questOrdForSave(): put an empty ord back to {} (the game's shape) before download; called from the build pipeline (line ~11094).
function questOrdForSave() {
  const q = SAVE && SAVE.soul && SAVE.soul.quest;
  if (q && Array.isArray(q.ord) && !q.ord.length) q.ord = {};
}
// questSyncState(): re-snapshot the original quest data whenever a different save has been loaded.
function questSyncState() {
  if (QUEST_STATE.root !== RAW_SAV_ROOT) {
    const q = questData();
    QUEST_STATE = { root: RAW_SAV_ROOT, original: q ? JSON.parse(JSON.stringify({ ord: q.ord, user: q.user })) : null, lastMsg: '' };
  }
}

// Cache of quest-related masters.db lookups, keyed to the AP object it was built from.
let QUEST_META = null;
// questMeta(): {byId, pText, pDesc, rwd, cats} - quests by qid, name/description parameter arrays (indexed by `no`), rewards by rwdid, category names by catid.
function questMeta() {
  if (QUEST_META && QUEST_META.ap === AP) return QUEST_META;
  const byId = {}, pText = {}, pDesc = {}, rwd = {}, cats = {};
  for (const m of arr(AP && AP.quests)) byId[m.qid] = m;
  for (const r of arr(AP && AP.questParamText)) (pText[r.qid] = pText[r.qid] || [])[r.no] = r.val;
  for (const r of arr(AP && AP.questParamDesc)) (pDesc[r.qid] = pDesc[r.qid] || [])[r.no] = r.val;
  for (const r of arr(AP && AP.rewards)) rwd[r.rwdid] = r;
  for (const r of arr(AP && AP.questCats)) cats[r.catid] = resolveName(r.name) || r.catid.replace(/^QUESTCAT_/, '');
  QUEST_META = { ap: AP, byId, pText, pDesc, rwd, cats };
  return QUEST_META;
}

// questFill(text, params): substitutes #1, #2... placeholders in quest text with resolved parameter names; '##' is a literal '#'.
function questFill(text, params) {
  if (!text) return '';
  return text.replace(/#(\d+)/g, (m, n) => {
    const key = params && params[parseInt(n, 10)];
    if (!key) return m;
    return resolveName(key) || String(key).replace(/^[A-Z_]+\.TXT_/, '');
  }).replace(/##/g, '#'); // the game escapes a literal # as ##
}
// questName(qid): display name with params filled and whitespace collapsed; falls back to the raw qid.
function questName(qid) {
  const M = questMeta(), m = M.byId[qid];
  if (!m) return qid;
  const t = resolveName(m.name);
  return t ? questFill(t, M.pText[qid]).replace(/\s+/g, ' ').trim() : qid;
}
// questDesc(qid): display description (params filled), or '' if unknown.
function questDesc(qid) {
  const M = questMeta(), m = M.byId[qid];
  if (!m) return '';
  const t = resolveName(m.desc);
  return t ? questFill(t, M.pDesc[qid]).replace(/\s+/g, ' ').trim() : '';
}
// questReward(rwdid): human-readable reward (Kill Coins, decal, blueprint, item, part, etc. with a x-count suffix).
function questReward(rwdid) {
  if (!rwdid) return '';
  const r = questMeta().rwd[rwdid];
  if (!r) return rwdid;
  const n = r.num > 1 ? ` ×${Number(r.num).toLocaleString()}` : '';
  if (r.type === 'MONEY') return `${Number(r.num).toLocaleString()} Kill Coins`;
  const id = r.val0 || '';
  let nm = null;
  if (r.type === 'SKILL') nm = SKL_INDEX[id] && SKL_INDEX[id].name && `Decal: ${decalNameP(id)}`;
  else if (ITEM_INDEX[id]) {
    const it = ITEM_INDEX[id];
    const bp = id.startsWith('ITMP_') && PT_INDEX[id.replace(/^ITMP_/, 'PT_')];
    nm = bp ? `Blueprint: ${bp.name}` : it.name;
  } else if (PT_INDEX[id]) nm = PT_INDEX[id].name;
  else if (MSR_INDEX[id]) nm = MSR_INDEX[id].name;
  else if (BST_INDEX[id]) nm = BST_INDEX[id].name;
  return (nm || `${r.type} ${id}`) + n;
}
// questStars(qid): difficulty stars, derived from master quest lvl (lvl/2, at least 1).
function questStars(qid) {
  const m = questMeta().byId[qid];
  return m && m.lvl != null ? '★'.repeat(Math.max(1, Math.round(m.lvl / 2))) : '';
}
// questUserEntry(q, qid): the history record {qid, ordcnt, clrcnt} in q.user, or null.
function questUserEntry(q, qid) {
  return q.user.find(u => u.qid === qid) || null;
}
// questLocked(q, qid): '' when the quest can be taken, otherwise a reason string: prerequisite quest not cleared
// (cond_quest_id) and/or the deepest floor reached (playlog[0].base.max_floor) below cond_flr.
function questLocked(q, qid) {
  const m = questMeta().byId[qid];
  if (!m) return '';
  const why = [];
  if (m.cond_quest_id) {
    const u = questUserEntry(q, m.cond_quest_id);
    if (!u || !(u.clrcnt > 0)) why.push(`clear "${questName(m.cond_quest_id)}" first`);
  }
  const maxFlr = SAVE.playlog && SAVE.playlog[0] && SAVE.playlog[0].base && SAVE.playlog[0].base.max_floor;
  if (m.cond_flr > 0 && maxFlr != null && maxFlr < m.cond_flr) why.push(`needs floor ${m.cond_flr} (you've reached ${maxFlr})`);
  return why.join('; ');
}

// blockQuests(): section shell for the Quests tab; renderQuests() fills #q-body.
function blockQuests() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Progress</div><h2>Quests</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Edits your current quests and quest history. Taking, completing and dropping quests here have been tested in game: progress counts, rewards pay out, and the save's quest checksum ("hash") is left untouched without causing problems.</div>
      <div id="q-body"></div>
    </div>
  </section>`;
}

// renderQuests(): draws the three sub-tabs (current / take a quest / history) into #q-body from the live
// SAVE.soul.quest data, shows an 'Undo all' bar when changed, then calls wireQuestEvents.
function renderQuests() {
  const host = document.getElementById('q-body');
  if (!host || !SAVE) return;
  questSyncState();
  const q = questData();
  if (!q) { host.innerHTML = '<div class="warnNote">This save has no quest data (soul.quest). Load a .sav or the full .json dump.</div>'; return; }
  const M = questMeta();
  const changed = QUEST_STATE.original && JSON.stringify({ ord: q.ord, user: q.user }) !== JSON.stringify(QUEST_STATE.original);
  const tabs = [['active', `Current quests (${q.ord.length})`], ['add', 'Take a quest'], ['history', `Quest history (${q.user.length})`]];
  let h = '';
  if (changed) h += `<div class="warnNote" style="display:flex; gap:10px; align-items:center; border-color:var(--good); color:var(--good-bright);"><div style="flex:1;">Quests changed. Download the .sav to keep it.</div><button class="subtle" id="q-undo-all">Undo all quest changes</button></div>`;
  if (QUEST_STATE.lastMsg) h += `<pre class="stewLog">${escapeHtml(QUEST_STATE.lastMsg)}</pre>`;
  h += `<div class="subTabs">${tabs.map(([k, l]) => `<div class="subTab ${QUEST_FORM.open === k ? 'active' : ''}" data-q-tab="${k}">${l}</div>`).join('')}</div>`;

  if (QUEST_FORM.open === 'active') {
    if (q.ord.length > 3) h += `<div class="warnNote">You have ${q.ord.length} quests taken. Holding more than 3 at once is untested; check it on a copy of your save.</div>`;
    h += '<div class="listBlock" style="max-height:none;">';
    h += q.ord.map((o, i) => {
      const done = o.prgmax > 0 && o.prgnow >= o.prgmax;
      const pct = o.prgmax > 0 ? Math.min(100, Math.round(100 * (o.prgnow || 0) / o.prgmax)) : 0;
      return `<div class="listRow" style="flex-direction:column; align-items:stretch; padding:10px; gap:4px;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <div class="name"><b>${escapeHtml(questName(o.qid))}</b> <span style="color:var(--warn);">${questStars(o.qid)}</span> ${done ? '<span class="badge current">COMPLETE</span>' : ''}</div>
          <span class="id">${escapeHtml(o.qid)}</span>
        </div>
        <div style="font-size:11.5px; color:var(--text-dim);">${escapeHtml(questDesc(o.qid))}</div>
        <div style="font-size:11.5px;">Reward: ${escapeHtml(questReward(o.rwd))}</div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <div class="stewBar" style="width:160px;"><span style="width:${pct}%"></span></div>
          <span style="font-size:11.5px;">Progress</span>
          <input type="number" min="0" max="${o.prgmax}" value="${o.prgnow || 0}" data-q-prg="${i}" style="width:70px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:4px 6px; font-family:var(--mono);">
          <span style="font-size:11.5px;">/ ${o.prgmax}</span>
          <button class="action" data-q-complete="${i}" ${done ? 'disabled' : ''}>Complete</button>
          <button class="subtle" data-q-drop="${i}">Drop quest</button>
        </div>
      </div>`;
    }).join('') || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No quests taken. Use "Take a quest" to add one.</div>';
    h += '</div><div class="capNote">Complete sets progress to the goal, so the game should treat the quest as done the next time it checks. The reward is still collected in game.</div>';
  }

  if (QUEST_FORM.open === 'add') {
    const active = new Set(q.ord.map(o => o.qid));
    const s = norm(QUEST_FORM.addSearch);
    const list = q.user.filter(u => M.byId[u.qid] && !active.has(u.qid)).map(u => ({ u, lock: questLocked(q, u.qid), name: questName(u.qid) }))
      .filter(x => (QUEST_FORM.showLocked || !x.lock) && (!s || norm(x.name).includes(s) || norm(x.u.qid).includes(s) || norm(questDesc(x.u.qid)).includes(s)))
      .sort((a, b) => (M.byId[a.u.qid].no || 0) - (M.byId[b.u.qid].no || 0));
    h += `<div class="toolbar"><input type="text" id="q-add-search" placeholder="Search quests..." value="${escapeHtml(QUEST_FORM.addSearch)}" style="flex:1; max-width:320px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">
      <label class="stewHlOnly"><input type="checkbox" id="q-show-locked" ${QUEST_FORM.showLocked ? 'checked' : ''}> Include quests you haven't unlocked</label><span class="count">${list.length} shown</span></div>`;
    h += '<div class="listBlock" style="max-height:520px;">';
    h += list.map(x => {
      const m = M.byId[x.u.qid];
      const r = x.u.clrcnt > 0 ? m.rwd : (m.first_rwd || m.rwd);
      return `<div class="listRow" style="align-items:flex-start; padding:8px 10px;">
        <div class="name"><b>${escapeHtml(x.name)}</b> <span style="color:var(--warn);">${questStars(x.u.qid)}</span> ${x.u.clrcnt > 0 ? `<span class="badge">cleared ×${x.u.clrcnt}</span>` : '<span class="badge current">never cleared</span>'}
          <div style="font-size:11px; color:var(--text-dim);">${escapeHtml(questDesc(x.u.qid))}</div>
          <div style="font-size:11px;">Reward: ${escapeHtml(questReward(r))}${x.u.clrcnt > 0 ? '' : ' (first clear)'}</div>
          ${x.lock ? `<div style="font-size:11px; color:var(--warn);">Locked: ${escapeHtml(x.lock)}</div>` : ''}</div>
        <span class="id">${escapeHtml(x.u.qid)}</span>
        <button class="subtle" data-q-take="${escapeHtml(x.u.qid)}">Take</button>
      </div>`;
    }).join('') || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No quests match.</div>';
    h += '</div>';
  }

  if (QUEST_FORM.open === 'history') {
    const s = norm(QUEST_FORM.histSearch);
    const f = QUEST_FORM.histFilter;
    const list = q.user.map((u, i) => ({ u, i, name: questName(u.qid) }))
      .filter(x => f === 'all' || (f === 'cleared' && x.u.clrcnt > 0) || (f === 'taken' && x.u.ordcnt > 0 && !(x.u.clrcnt > 0)) || (f === 'never' && !(x.u.ordcnt > 0)))
      .filter(x => !s || norm(x.name).includes(s) || norm(x.u.qid).includes(s))
      .sort((a, b) => ((M.byId[a.u.qid] || {}).no || 0) - ((M.byId[b.u.qid] || {}).no || 0));
    const cnt = { cleared: q.user.filter(u => u.clrcnt > 0).length, never: q.user.filter(u => !(u.ordcnt > 0)).length };
    h += `<div class="toolbar"><select id="q-hist-filter" style="background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:6px 8px; font-family:var(--mono); font-size:12px;">
        ${[['all', `All (${q.user.length})`], ['cleared', `Cleared (${cnt.cleared})`], ['taken', 'Taken, not cleared'], ['never', `Never taken (${cnt.never})`]].map(([k, l]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <input type="text" id="q-hist-search" placeholder="Search..." value="${escapeHtml(QUEST_FORM.histSearch)}" style="flex:1; max-width:260px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">
      <button class="subtle" id="q-clear-shown" ${list.some(x => !(x.u.clrcnt > 0)) ? '' : 'disabled'}>Mark all shown as cleared</button>
      <span class="count">${list.length} shown</span></div>`;
    h += '<table class="stewTable"><thead><tr><th>Quest</th><th>Category</th><th>Times taken</th><th>Times cleared</th><th></th></tr></thead><tbody>';
    h += list.map(x => {
      const m = M.byId[x.u.qid] || {};
      return `<tr><td>${escapeHtml(x.name)} <span style="color:var(--warn);">${questStars(x.u.qid)}</span><div class="dtRel">${escapeHtml(x.u.qid)}</div></td>
        <td style="font-size:11px; color:var(--text-dim);">${escapeHtml(M.cats[m.cat] || m.cat || '')}</td>
        <td><input type="number" min="0" value="${x.u.ordcnt || 0}" data-q-ord="${x.i}" style="width:60px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:3px 6px; font-family:var(--mono);"></td>
        <td><input type="number" min="0" value="${x.u.clrcnt || 0}" data-q-clr="${x.i}" style="width:60px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:3px 6px; font-family:var(--mono);"></td>
        <td>${x.u.clrcnt > 0 ? '' : `<button class="subtle" data-q-mark="${x.i}">Mark cleared</button>`}</td></tr>`;
    }).join('');
    h += '</tbody></table><div class="capNote">"Times cleared" above 0 means the quest pays its normal reward instead of the first-clear reward, and unlocks quests that require it. Times taken is raised to match if it is lower.</div>';
  }
  host.innerHTML = h;
  wireQuestEvents(q);
}

// wireQuestEvents(q): attaches handlers to the quest UI; all edit q.ord / q.user in place (they ARE SAVE.soul.quest)
// and call redo() to re-render. Taking a quest builds an ord entry with the first-clear or normal reward and bumps ordcnt;
// setting clrcnt > 0 raises ordcnt to match.
function wireQuestEvents(q) {
  const host = document.getElementById('q-body');
  // redo(msg): remember the message, re-render, and toast its first line
  const redo = msg => { QUEST_STATE.lastMsg = msg || ''; renderQuests(); if (msg) toast(msg.split('\n')[0]); };
  host.querySelectorAll('[data-q-tab]').forEach(t => t.addEventListener('click', () => { QUEST_FORM.open = t.dataset.qTab; QUEST_STATE.lastMsg = ''; renderQuests(); }));
  const undo = document.getElementById('q-undo-all');
  if (undo) undo.addEventListener('click', () => {
    const o = JSON.parse(JSON.stringify(QUEST_STATE.original));
    q.ord = o.ord;
    q.user = o.user;
    redo('Quests restored to how they were when you loaded the save.');
  });
  host.querySelectorAll('[data-q-prg]').forEach(inp => inp.addEventListener('change', () => {
    const o = q.ord[Number(inp.dataset.qPrg)];
    let v = parseInt(inp.value, 10) || 0;
    v = Math.min(Math.max(v, 0), o.prgmax > 0 ? o.prgmax : v);
    o.prgnow = v;
    redo(`${questName(o.qid)}: progress ${v} / ${o.prgmax}`);
  }));
  host.querySelectorAll('[data-q-complete]').forEach(b => b.addEventListener('click', () => {
    const o = q.ord[Number(b.dataset.qComplete)];
    o.prgnow = o.prgmax > 0 ? o.prgmax : 1;
    redo(`Completed "${questName(o.qid)}". Collect the reward in game.`);
  }));
  host.querySelectorAll('[data-q-drop]').forEach(b => b.addEventListener('click', () => {
    const [o] = q.ord.splice(Number(b.dataset.qDrop), 1);
    redo(`Dropped "${questName(o.qid)}".`);
  }));
  const addS = document.getElementById('q-add-search');
  if (addS) addS.addEventListener('change', () => { QUEST_FORM.addSearch = addS.value; renderQuests(); });
  const showL = document.getElementById('q-show-locked');
  if (showL) showL.addEventListener('change', () => { QUEST_FORM.showLocked = showL.checked; renderQuests(); });
  host.querySelectorAll('[data-q-take]').forEach(b => b.addEventListener('click', () => {
    const qid = b.dataset.qTake;
    const m = questMeta().byId[qid];
    const u = questUserEntry(q, qid);
    if (!m || !u || q.ord.some(o => o.qid === qid)) return;
    q.ord.push({
      qid,
      prgnow: 0,
      prgmax: m.prgmax > 0 ? m.prgmax : 1,
      timer: 0,
      expire: 0,
      term: 0,
      rwd: u.clrcnt > 0 ? m.rwd : (m.first_rwd || m.rwd),
      order: Math.floor(Date.now() / 1000)
    });
    u.ordcnt = (u.ordcnt || 0) + 1;
    redo(`Took "${questName(qid)}". It is now in your current quests.`);
  }));
  const hf = document.getElementById('q-hist-filter');
  if (hf) hf.addEventListener('change', () => { QUEST_FORM.histFilter = hf.value; renderQuests(); });
  const hs = document.getElementById('q-hist-search');
  if (hs) hs.addEventListener('change', () => { QUEST_FORM.histSearch = hs.value; renderQuests(); });
  // setClr(u,v): set times-cleared (capped) and keep times-taken >= cleared
  const setClr = (u, v) => {
    u.clrcnt = Math.min(Math.max(0, v), 999999);
    if (u.clrcnt > 0 && !((u.ordcnt || 0) >= u.clrcnt)) u.ordcnt = u.clrcnt;
  };
  host.querySelectorAll('[data-q-clr]').forEach(inp => inp.addEventListener('change', () => {
    const u = q.user[Number(inp.dataset.qClr)];
    setClr(u, parseInt(inp.value, 10) || 0);
    redo(`${questName(u.qid)}: cleared ${u.clrcnt}, taken ${u.ordcnt}`);
  }));
  host.querySelectorAll('[data-q-ord]').forEach(inp => inp.addEventListener('change', () => {
    const u = q.user[Number(inp.dataset.qOrd)];
    u.ordcnt = Math.min(Math.max(0, parseInt(inp.value, 10) || 0), 999999); inp.value = u.ordcnt;
    redo(`${questName(u.qid)}: taken ${u.ordcnt}`);
  }));
  host.querySelectorAll('[data-q-mark]').forEach(b => b.addEventListener('click', () => {
    const u = q.user[Number(b.dataset.qMark)];
    setClr(u, 1);
    redo(`Marked "${questName(u.qid)}" as cleared.`);
  }));
  const cs = document.getElementById('q-clear-shown');
  if (cs) cs.addEventListener('click', () => {
    const s = norm(QUEST_FORM.histSearch), f = QUEST_FORM.histFilter;
    let n = 0;
    for (const u of q.user) {
      if (u.clrcnt > 0) continue;
      const nm = questName(u.qid);
      const pass = (f === 'all' || (f === 'taken' && u.ordcnt > 0) || (f === 'never' && !(u.ordcnt > 0))) && (!s || norm(nm).includes(s) || norm(u.qid).includes(s));
      if (pass) { setClr(u, 1); n++; }
    }
    redo(`Marked ${n} quest${n === 1 ? '' : 's'} as cleared.`);
  });
}

