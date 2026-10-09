// ==== Dates tab ====
// ---------------------------------------------------------------------------
// DATES tab
// Finds every timestamp in the save (Unix seconds), shows them relative to a
// reference time (this PC's clock by default) and flags the kinds of values
// that time-jumping leaves behind:
//   - future   : an event dated after the reference time (created/modified...)
//   - post2038 : after 2038-01-19 03:14:07 UTC, which no longer fits in a
//                signed 32-bit number
//   - wrapped  : negative values; a post-2038 date that already overflowed
// Fixes are stored as rules and applied to the finished save at download time
// (after buildRawSavRootFromSave), so they never fight the other tabs' edits.
// ---------------------------------------------------------------------------

// Largest signed 32-bit value (Jan 2038); later dates overflow in the game.
const DT_INT32_MAX = 2147483647;
// Seconds of clock slack before a date counts as "future".
const DT_TOLERANCE = 300; // seconds of clock slack before "future" is flagged
// Key-name regex: which numeric fields might be timestamps.
const DT_KEY_RE = /(time|date|created|modified|updated|expire|opentime|^order$|whistle_limit)/i;
// Subset of keys that are deadlines (expiry timers); these are legitimately in the future.
const DT_DEADLINE_RE = /(expire|opentime|whistle_limit|guard_time)/i;
// UUID-shaped object keys are collapsed to "*" when building path patterns.
const DT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Pending fix rules, applied in order to the finished root at download (see applyDateRules).
let DATE_RULES = [];
// UI state: reference time mode ('pc' or 'custom'), expanded rows, filter.
const DATE_FORM = { refMode: 'pc', refCustom: null, open: {}, onlyProblems: false };

// Friendly labels for scanned path patterns ("[]" = array element, "*" = numeric/uuid/dynamic key).
const DT_LABELS = {
  'user.created': 'Account created',
  'user.modified': 'Account last saved',
  'user.last_login_date': 'Last login day',
  'user.migrated': 'Save migrated to offline',
  'login_bonus[].login_date': 'Login bonus history (one per day)',
  'soul.modified': 'Save data last written',
  'soul.area_start_time': 'Current run started',
  'soul.last_visiting_shop_time': 'Last shop visit',
  'soul.last_rcv_deathbox_time': 'Last death box received',
  'soul.last_tdm_reset_time': 'Last TDM weekly reset',
  'soul.abduct_guard_time': 'Kidnap protection ends',
  'soul.whistle_limit': 'Whistle expires',
  'soul.vip.expired_time': 'Death Metal (VIP) expires',
  'soul.vip.last_use_day': 'Death Metal (VIP) last used',
  'soul.mail[].created': 'Mail received',
  'soul.present[].created': 'Reward box items received',
  'soul.skl.psskl[].updated': 'Decals obtained / updated',
  'soul.deathbox[].created': 'Death boxes created',
  'soul.deathbox[].opentime': 'Death boxes open at',
  'soul.prison.*[].expire_time': 'Prison (kidnapped fighter) timers',
  'soul.prison.*[].last_collect_time': 'Prison last collected',
  'soul.quest.ord[].order': 'Quests accepted',
  'soul.quest.ord[].expire': 'Quests expire',
  'soul.relationship.revenge.*[].modified': 'Revenge list',
  'soul.screenshot[].created': 'Screenshots',
  'soul.unlockfighter[].created': 'Fighters unlocked',
  'abduct[].created': 'Kidnappings started',
  'abduct[].expire': 'Kidnappings expire',
  'abduct[].modified': 'Kidnappings updated',
  'item.items[].gettime': 'Items obtained',
  'part.pts.*[].created': 'Weapons & gear created',
  'part.pts.*[].modified': 'Weapons & gear modified',
  'part.pts.*[].gettime': 'Weapons & gear obtained',
  'mushroom.msrs[].gettime': 'Mushrooms obtained',
  'beast.bsts[].gettime': 'Beasts obtained',
  'clear_times.*': 'Floor clear times',
  'diedchara.dchrarcs.*[].created': 'Dead fighter archive',
  'diedchara.dchrs.*[].created': 'Dead fighters',
  'diedchara.hunter.match.*[].expire': 'Hunter matching expires',
  'dummy.user[].created': 'Other players (dummy) created',
  'floor.match[].expire': 'Floor matching expires',
  'floor.stamp.stamps[].created': 'Floor stamps',
  'fortresult[].endtime': 'Tokyo Death Metro results',
  'gameflg.cl[].modified': 'Game flags (client)',
  'gameflg.sv[].modified': 'Game flags (server)',
  'shp.expired_time': 'Shop stock expires',
  'team[].last_war_time': 'Teams: last war',
  'team[].modified': 'Teams updated',
  'teamhate[].modified': 'Team grudges (TDM)',
  'teammember.created': 'Joined team',
  'teammember.modified': 'Team membership updated'
};

// True if v looks like a Unix-seconds timestamp (positive 2001..2106 range, or a negative int32 overflow).
function dtIsDateValue(v) {
  return typeof v === 'number' && Number.isFinite(v) && ((v >= 1e9 && v < 4294967296) || (v <= -1e8 && v >= -2147483648));
}

// Walks a save root and groups every date-like number by path pattern.
// Returns [{pattern, label, deadline, entries:[{obj, key, v}]}]; entries reference the live objects
// so fixes can write straight back.
function dtScan(root) {
  const groups = new Map();
  function add(pattern, obj, key, v, lastKey) {
    let g = groups.get(pattern);
    if (!g) {
      g = { pattern, label: DT_LABELS[pattern] || pattern, deadline: DT_DEADLINE_RE.test(lastKey), entries: [] };
      groups.set(pattern, g);
    }
    g.entries.push({ obj, key, v });
  }
  function walk(o, path, parentKey) {
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        const v = o[i];
        if (v && typeof v === 'object') walk(v, path + '[]', parentKey);
      }
      return;
    }
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      const wild = /^-?\d+$/.test(k) || DT_UUID_RE.test(k) || parentKey === 'clear_times';
      const seg = wild ? '*' : k;
      const p = path ? path + '.' + seg : seg;
      if (typeof v === 'number') {
        const nameKey = wild ? parentKey : k;
        if (DT_KEY_RE.test(nameKey) && dtIsDateValue(v)) add(p, o, k, v, nameKey);
      } else if (v && typeof v === 'object') walk(v, p, k);
    }
  }
  walk(root, '', '');
  return [...groups.values()];
}

// Reference "now": this PC's clock, or the user's custom time.
function dtRefTime() {
  if (DATE_FORM.refMode === 'custom' && DATE_FORM.refCustom != null) return DATE_FORM.refCustom;
  return Math.floor(Date.now() / 1000);
}

// Classifies a date: 'wrapped' (negative), 'post2038', 'future' (not for deadline groups), or null.
function dtProblem(g, v, ref) {
  if (v < 0) return 'wrapped';
  if (v > DT_INT32_MAX) return 'post2038';
  if (!g.deadline && v > ref + DT_TOLERANCE) return 'future';
  return null;
}

// Formats a Unix-seconds value as local "YYYY-MM-DD HH:MM".
function dtFmt(v) {
  if (v < 0) return `overflowed (${v})`;
  const d = new Date(v * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Human relative time ("3 days ago", "in 2 months") against ref.
function dtRel(v, ref) {
  if (v < 0) return 'after 2038 (wrapped)';
  const s = v - ref, a = Math.abs(s);
  const units = [[31557600, 'year'], [2629800, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  let txt = 'now';
  for (const [n, u] of units) if (a >= n) { const k = Math.floor(a / n); txt = `${k} ${u}${k === 1 ? '' : 's'}`; break; }
  if (txt === 'now') return 'about now';
  return s > 0 ? `in ${txt}` : `${txt} ago`;
}

// Unix seconds -> value for an <input type=datetime-local> (local time).
function dtToLocalInput(v) {
  if (v == null || v < 0) return '';
  const d = new Date(v * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
// datetime-local string -> Unix seconds, or null if empty/invalid.
function dtFromLocalInput(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

// Picks a readable label for an entry's parent object, trying common id fields and resolving names via the indexes.
function dtIdLabel(obj, key) {
  if (!obj || typeof obj !== 'object') return key;
  for (const f of ['nm', 'name', 'sklid', 'itemid', 'ptid', 'msrid', 'bstid', 'abid', 'cid', 'tid', 'id', 'type']) {
    if (obj[f] != null && obj[f] !== '' && typeof obj[f] !== 'object') {
      const raw = String(obj[f]);
      const idx = f === 'sklid' ? SKL_INDEX[raw] : f === 'itemid' ? ITEM_INDEX[raw] : f === 'ptid' ? PT_INDEX[raw] : f === 'msrid' ? MSR_INDEX[raw] : f === 'bstid' ? BST_INDEX[raw] : null;
      return idx && idx.name ? idx.name : raw;
    }
  }
  return key;
}

// Applies one fix rule to a finished root; returns the number of values changed.
// rule.action 'set' changes the single entry of one pattern (only if still equal to rule.from);
// 'fix' sets problem dates to the reference time (or its day start for login_date), and for
// login_bonus removes future days.
// Apply one fix rule to a finished save root.
function dtApplyRule(root, rule) {
  const groups = dtScan(root);
  if (rule.action === 'set') {
    const g = groups.find(x => x.pattern === rule.pattern);
    if (!g || g.entries.length !== 1) return 0;
    const e = g.entries[0];
    if (e.v !== rule.from) return 0; // something else changed it since; that edit wins
    e.obj[e.key] = rule.value;
    return 1;
  }
  const targets = rule.pattern === '*' ? groups : groups.filter(x => x.pattern === rule.pattern);
  const ref = rule.ref;
  const refDay = Math.floor(ref / 86400) * 86400;
  let n = 0;
  for (const g of targets) {
    if (g.pattern === 'login_bonus[].login_date') {
      // one entry per day: drop the days that haven't happened yet instead of
      // stacking copies of "today"
      if (Array.isArray(root.login_bonus)) {
        const before = root.login_bonus.length;
        root.login_bonus = root.login_bonus.filter(e => !(e && dtIsDateValue(e.login_date) && dtProblem(g, e.login_date, refDay + 86399)));
        n += before - root.login_bonus.length;
      }
      continue;
    }
    const isDay = /login_date$/.test(g.pattern);
    for (const e of g.entries) {
      if (!dtProblem(g, e.v, ref)) continue;
      e.obj[e.key] = isDay ? refDay : ref;
      n++;
    }
  }
  return n;
}

// Applies all pending rules, recording each rule's change count in r.applied.
function applyDateRules(root) {
  for (const r of DATE_RULES) r.applied = dtApplyRule(root, r);
  return root;
}

// Builds the would-be download root (without the stamp/other download hooks) and applies date rules, for display.
function dtBuildRoot() {
  // deep copy: the built root shares objects with SAVE, and the rules must not edit SAVE (see buildDownloadRoot)
  const root = JSON.parse(JSON.stringify(buildRawSavRootFromSave(SAVE, RAW_SAV_ROOT, RAW_SAV_MAIN_UID)));
  return applyDateRules(root);
}

// Static HTML for the Dates tab.
function blockDates() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Time</div><h2>Dates</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Every date stored in your save, compared with a reference time. Moving your PC clock forward and then back leaves dates "in the future", and going past 2038 makes dates overflow into negative numbers. Either can crash the game. Fixes here only change the dates that are wrong, and are applied when you download the .sav. Close the game first and keep a copy of your original save.</div>
      <div id="dt-body"></div>
    </div>
  </section>`;
}

// Renders the Dates tab: summary stats, problem counts, pending rules and the per-kind table.
// Scans the rebuilt root so the view reflects other tabs' unsaved edits; every action adds a rule and re-renders.
function renderDates() {
  const host = document.getElementById('dt-body');
  if (!host || !SAVE) return;
  if (!RAW_SAV_ROOT) { host.innerHTML = '<div class="warnNote">The Dates tab needs a .sav (or the full .json dump).</div>'; return; }
  let root;
  try { root = dtBuildRoot(); } catch (err) { host.innerHTML = `<div class="warnNote">Could not read dates: ${escapeHtml(err.message)}</div>`; return; }
  const ref = dtRefTime();
  const pcNow = Math.floor(Date.now() / 1000);
  const groups = dtScan(root);
  let latest = null, total = 0;
  const counts = { future: 0, post2038: 0, wrapped: 0 };
  for (const g of groups) {
    g.problems = [];
    g.min = Infinity; g.max = -Infinity;
    for (const e of g.entries) {
      total++;
      const pr = dtProblem(g, e.v, ref);
      if (pr) { counts[pr]++; g.problems.push(Object.assign({ pr }, e)); }
      const eff = e.v < 0 ? e.v + 4294967296 : e.v;
      if (eff < g.min) g.min = eff;
      if (eff > g.max) { g.max = eff; }
      if (!g.deadline && (!latest || eff > latest.v)) latest = { v: eff, g };
    }
  }
  groups.sort((a, b) => (b.problems.length > 0) - (a.problems.length > 0) || b.max - a.max);
  const probTotal = counts.future + counts.post2038 + counts.wrapped;
  const saved = root.user && dtIsDateValue(root.user.modified) ? root.user.modified : root.soul && dtIsDateValue(root.soul.modified) ? root.soul.modified : null;

  let h = `<div class="stewStats">
    <div class="stewStat"><div class="k">Reference time</div><div class="v" style="font-size:15px;">${dtFmt(ref)}</div><div class="s">${DATE_FORM.refMode === 'pc' ? "this PC's clock right now" : `custom, ${dtRel(ref, pcNow)} vs this PC`}</div></div>
    <div class="stewStat"><div class="k">Save last written</div><div class="v" style="font-size:15px;">${saved != null ? dtFmt(saved) : 'unknown'}</div><div class="s">${saved != null ? dtRel(saved, ref) : ''}</div></div>
    <div class="stewStat"><div class="k">Latest event date</div><div class="v" style="font-size:15px;">${latest ? dtFmt(latest.v) : '-'}</div><div class="s">${latest ? escapeHtml(latest.g.label) + ', ' + dtRel(latest.v, ref) : ''}</div></div>
    <div class="stewStat"><div class="k">Dates found</div><div class="v">${total}</div><div class="s">${groups.length} kinds</div></div>
  </div>`;
  h += `<div class="toolbar" style="margin-bottom:12px;">
    <label class="stewHlOnly" style="margin:0;"><input type="radio" name="dt-ref" value="pc" ${DATE_FORM.refMode === 'pc' ? 'checked' : ''}> Use this PC's clock</label>
    <label class="stewHlOnly" style="margin:0;"><input type="radio" name="dt-ref" value="custom" ${DATE_FORM.refMode === 'custom' ? 'checked' : ''}> Use a custom time:</label>
    <input type="datetime-local" id="dt-ref-custom" value="${dtToLocalInput(DATE_FORM.refCustom != null ? DATE_FORM.refCustom : pcNow)}" style="background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:5px 8px; font-family:var(--mono); font-size:12px; color-scheme:dark;">
  </div>`;
  if (probTotal) {
    h += `<div class="warnNote" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;"><div style="flex:1; min-width:240px;"><b>${probTotal} problem date${probTotal === 1 ? '' : 's'} found.</b> ${[counts.future && `${counts.future} in the future`, counts.post2038 && `${counts.post2038} past the 2038 limit`, counts.wrapped && `${counts.wrapped} already overflowed (negative)`].filter(Boolean).join(', ')}. Fixing sets them to the reference time. Future login-bonus days are removed instead, and expiry timers are only changed if they overflow.</div><button class="action" id="dt-fix-all">Fix all problems</button></div>`;
  } else {
    h += `<div class="warnNote" style="border-color:var(--good); color:var(--good-bright);">No problem dates relative to ${dtFmt(ref)}.</div>`;
  }
  if (DATE_RULES.length) {
    h += `<div class="subDetails" style="padding:8px 10px;"><div style="font-size:11px; color:var(--text-dim); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.4px;">Pending date fixes (applied when you download)</div>`;
    h += DATE_RULES.map((r, i) => `<div class="listRow" style="padding:4px 0;"><div class="name">${r.action === 'set' ? `Set ${escapeHtml(DT_LABELS[r.pattern] || r.pattern)} to ${dtFmt(r.value)}` : `Fix ${r.pattern === '*' ? 'all problem dates' : escapeHtml(DT_LABELS[r.pattern] || r.pattern)} (reference ${dtFmt(r.ref)})`}</div><span class="id">${r.applied || 0} changed</span><button class="subtle" data-dt-undo="${i}">Undo</button></div>`).join('');
    h += `<div style="margin-top:6px;"><button class="subtle" id="dt-undo-all">Undo all date fixes</button></div></div>`;
  }
  h += `<label class="stewHlOnly" style="margin:4px 0 8px;"><input type="checkbox" id="dt-only-prob" ${DATE_FORM.onlyProblems ? 'checked' : ''}> Only show kinds with problems</label>`;
  h += '<table class="stewTable dtTable"><thead><tr><th>What</th><th>Count</th><th>Earliest</th><th>Latest</th><th>Problems</th><th></th></tr></thead><tbody>';
  for (const g of groups) {
    if (DATE_FORM.onlyProblems && !g.problems.length) continue;
    const single = g.entries.length === 1;
    const open = !!DATE_FORM.open[g.pattern];
    const pc = { future: 0, post2038: 0, wrapped: 0 };
    for (const p of g.problems) pc[p.pr]++;
    const probTxt = g.problems.length ? [pc.future && `${pc.future} future`, pc.post2038 && `${pc.post2038} past 2038`, pc.wrapped && `${pc.wrapped} overflowed`].filter(Boolean).join(', ') : '<span style="color:var(--text-faint);">ok</span>';
    h += `<tr class="${g.problems.length ? 'dtBad' : ''}"><td><a href="#" class="dtToggle" data-dt-open="${escapeHtml(g.pattern)}">${open ? '▾' : '▸'} ${escapeHtml(g.label)}</a>${g.deadline ? ' <span class="badge">timer</span>' : ''}<div class="id" style="font-size:10px; color:var(--text-faint);">${escapeHtml(g.pattern)}</div></td>
      <td>${g.entries.length}</td>
      <td>${single ? '' : `${dtFmt(g.min)}<div class="dtRel">${dtRel(g.min, ref)}</div>`}</td>
      <td>${dtFmt(g.max)}<div class="dtRel">${dtRel(g.max, ref)}</div></td>
      <td>${probTxt}</td>
      <td style="white-space:nowrap;">${g.problems.length ? `<button class="subtle" data-dt-fix="${escapeHtml(g.pattern)}">Fix</button>` : ''}</td></tr>`;
    if (open) {
      h += `<tr><td colspan="6" style="background:var(--bg);">`;
      if (single) {
        const e = g.entries[0];
        h += `<div class="toolbar" style="margin:4px 0;"><span style="font-size:11.5px; color:var(--text-dim);">Set to:</span><input type="datetime-local" data-dt-input="${escapeHtml(g.pattern)}" value="${dtToLocalInput(e.v < 0 ? ref : e.v)}" style="background:var(--panel); border:1px solid var(--panel-border); color:var(--text); padding:5px 8px; font-family:var(--mono); font-size:12px; color-scheme:dark;"><button class="subtle" data-dt-set="${escapeHtml(g.pattern)}" data-dt-from="${e.v}">Apply</button><button class="subtle" data-dt-setref="${escapeHtml(g.pattern)}" data-dt-from="${e.v}">Set to reference time</button><span class="id">current value ${e.v}</span></div>`;
      } else {
        const list = (g.problems.length ? g.problems : g.entries.slice().sort((a, b) => b.v - a.v)).slice(0, 100);
        h += `<div style="font-size:11px; color:var(--text-dim); margin:2px 0 4px;">${g.problems.length ? `Problem entries${g.problems.length > 100 ? ' (first 100)' : ''}` : `Newest entries${g.entries.length > 100 ? ' (first 100)' : ''}`}</div>`;
        h += list.map(e => `<div class="listRow" style="padding:3px 0;"><div class="name">${escapeHtml(dtIdLabel(e.obj, e.key))}</div><span>${dtFmt(e.v)}</span><span class="dtRel" style="width:150px; text-align:right;">${dtRel(e.v, ref)}</span></div>`).join('');
      }
      h += '</td></tr>';
    }
  }
  h += '</tbody></table>';
  host.innerHTML = h;

  host.querySelectorAll('input[name="dt-ref"]').forEach(r => r.addEventListener('change', () => {
    DATE_FORM.refMode = r.value;
    if (r.value === 'custom' && DATE_FORM.refCustom == null) DATE_FORM.refCustom = dtFromLocalInput(document.getElementById('dt-ref-custom').value);
    renderDates();
  }));
  document.getElementById('dt-ref-custom').addEventListener('change', e => {
    const v = dtFromLocalInput(e.target.value);
    if (v != null) { DATE_FORM.refCustom = v; DATE_FORM.refMode = 'custom'; renderDates(); }
  });
  document.getElementById('dt-only-prob').addEventListener('change', e => { DATE_FORM.onlyProblems = e.target.checked; renderDates(); });
  host.querySelectorAll('[data-dt-open]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const k = a.dataset.dtOpen;
    DATE_FORM.open[k] = !DATE_FORM.open[k];
    renderDates();
  }));
  const addRule = (rule, msg) => {
    DATE_RULES.push(rule);
    renderDates();
    const r = DATE_RULES[DATE_RULES.length - 1];
    toast(`${msg}: ${r.applied || 0} date${r.applied === 1 ? '' : 's'} changed`);
  };
  const fixAll = document.getElementById('dt-fix-all');
  if (fixAll) fixAll.addEventListener('click', () => addRule({ action: 'fix', pattern: '*', ref: dtRefTime() }, 'Fixed problem dates'));
  host.querySelectorAll('[data-dt-fix]').forEach(b => b.addEventListener('click', () => addRule({ action: 'fix', pattern: b.dataset.dtFix, ref: dtRefTime() }, 'Fixed')));
  host.querySelectorAll('[data-dt-set]').forEach(b => b.addEventListener('click', () => {
    const inp = host.querySelector(`[data-dt-input="${CSS.escape(b.dataset.dtSet)}"]`);
    const v = dtFromLocalInput(inp && inp.value);
    if (v == null) return toast('Pick a date and time first', true);
    addRule({ action: 'set', pattern: b.dataset.dtSet, from: Number(b.dataset.dtFrom), value: v }, 'Date set');
  }));
  host.querySelectorAll('[data-dt-setref]').forEach(b => b.addEventListener('click', () => addRule({ action: 'set', pattern: b.dataset.dtSetref, from: Number(b.dataset.dtFrom), value: dtRefTime() }, 'Date set')));
  host.querySelectorAll('[data-dt-undo]').forEach(b => b.addEventListener('click', () => { DATE_RULES.splice(Number(b.dataset.dtUndo), 1); renderDates(); toast('Date fix undone'); }));
  const undoAll = document.getElementById('dt-undo-all');
  if (undoAll) undoAll.addEventListener('click', () => { DATE_RULES = []; renderDates(); toast('All date fixes undone'); });
}

// Wires the Dates tab (renders only if it is the active tab).
function wireDates() {
  if (activeTab === 'dates') renderDates();
}

