// ===== Raw data (read only): the whole save as the game stores it, for power users =====
// A browser over the raw save: breadcrumb + the current object's fields, 200 at a time, with search over keys
// and values. Nothing can be edited here on purpose: the other tabs check every change against the game's rules.
// "With your edits" shows the save exactly as Download would write it now (buildDownloadRoot).
// Page size for the key list and cap on search hits.
const RAW_PAGE = 200, RAW_HITS = 300;
// State of the raw browser: which root it belongs to, source ('loaded' or 'edited'), cached edited clone, current
// path, page, search query/hits and the key to highlight.
let RAW_VIEW = { root: null, src: 'loaded', ed: null, edAt: 0, path: [], page: 0, q: '', hits: null, hitsMore: false, mark: null };
// Cache of serialized sizes for container nodes (WeakMap so it never keeps data alive).
const RAW_SIZE = new WeakMap();
// Reset the viewer state for the current root.
function rawReset() { RAW_VIEW = { root: RAW_SAV_ROOT, src: 'loaded', ed: null, edAt: 0, path: [], page: 0, q: '', hits: null, hitsMore: false, mark: null }; }
// The data being browsed: the loaded raw root, or a cached deep copy of buildDownloadRoot() ("with your edits").
function rawData() {
  if (RAW_VIEW.src !== 'edited') return RAW_SAV_ROOT;
  if (!RAW_VIEW.ed) { RAW_VIEW.ed = JSON.parse(JSON.stringify(buildDownloadRoot())); RAW_VIEW.edAt = Date.now(); }
  return RAW_VIEW.ed;
}
// Follow a key path into data; undefined if any step is missing.
function rawAt(data, path) {
  let v = data;
  for (const k of path) { if (v === null || typeof v !== 'object' || !(k in v)) return undefined; v = v[k]; }
  return v;
}
// Path as JS-like text, e.g. save.soul["x-y"][3].
function rawPathText(path) {
  return 'save' + path.map(k => typeof k === 'number' ? `[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? '.' + k : `[${JSON.stringify(k)}]`).join('');
}
// JSON length of a value (cached for objects/arrays).
function rawSize(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v).length;
  let n = RAW_SIZE.get(v);
  if (n == null) { n = JSON.stringify(v).length; RAW_SIZE.set(v, n); }
  return n;
}
// Human size text (B / KB / MB).
function rawBytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B'; }
// Kind label: null, list, object, or typeof.
function rawKind(v) { return v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v === 'object' ? 'object' : typeof v; }
// If a number looks like a unix time (key name plus plausible range), return an HTML date hint, else ''.
function rawDateHint(k, v) {
  return typeof v === 'number' && v > 9e8 && v < 2.2e9 && /time|created|modified|expire|date|login|start|end|_at$|limit/i.test(String(k)) ? ` <span class="id">(${escapeHtml(dtFmt(v))})</span>` : '';
}
// HTML for a non-container value, truncating long strings.
function rawLeafHtml(k, v) {
  if (typeof v === 'string') {
    const s = JSON.stringify(v);
    return `<span style="color:#9fd39f;">${escapeHtml(s.length > 240 ? s.slice(0, 240) + '…"' : s)}</span>${s.length > 240 ? ` <span class="id">(${v.length.toLocaleString()} characters)</span>` : ''}`;
  }
  if (v === null) return '<span class="id">null</span>';
  return `<span style="color:#e6b86a;">${escapeHtml(String(v))}</span>${rawDateHint(k, v)}`;
}
// Iterative search of keys and values (case-insensitive substring) in document order; returns {hits: [paths], more}
// and stops after RAW_HITS matches.
function rawSearch(data, q) {
  const needle = q.toLowerCase(), hits = [];
  const stack = [ [ data, [] ] ];
  let more = false;
  while (stack.length) {
    const [ v, path ] = stack.pop();
    const keys = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v);
    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i], c = v[k], p = path.concat([ k ]);
      const keyHit = typeof k === 'string' && k.toLowerCase().includes(needle);
      const valHit = (c === null || typeof c !== 'object') && String(c).toLowerCase().includes(needle);
      if (keyHit || valHit) { if (hits.length >= RAW_HITS) { more = true; stack.length = 0; break; } hits.push(p); }
      if (c !== null && typeof c === 'object') stack.push([ c, p ]);
    }
  }
  // stack order walks the save top to bottom; keep that order
  return { hits, more };
}
// Block shell for the Raw data tab.
function blockRaw() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Read only · for power users</div><h2>Raw data</h2></div></div>
    <div class="block-body"><div id="raw-body"></div></div>
  </section>`;
}
// Render the raw viewer: source selector, search, breadcrumb, paged key table with copy buttons.
function renderRaw() {
  const host = document.getElementById('raw-body');
  if (!host) return;
  if (!RAW_SAV_ROOT) { host.innerHTML = '<div class="capNote" style="margin-top:0;">Load a .sav to see its raw data.</div>'; return; }
  if (RAW_VIEW.root !== RAW_SAV_ROOT) rawReset();
  let data;
  try { data = rawData(); } catch (err) { host.innerHTML = `<div class="capNote">Couldn't build the save with your edits (${escapeHtml(err.message)}).</div>`; return; }
  let node = rawAt(data, RAW_VIEW.path);
  if (node === undefined || node === null || typeof node !== 'object') { RAW_VIEW.path = []; RAW_VIEW.page = 0; node = data; }
  const P = RAW_VIEW.path, isArr = Array.isArray(node);
  const keys = isArr ? node.map((_, i) => i) : Object.keys(node);
  const pages = Math.max(1, Math.ceil(keys.length / RAW_PAGE));
  if (RAW_VIEW.page >= pages) RAW_VIEW.page = pages - 1;
  const from = RAW_VIEW.page * RAW_PAGE, shown = keys.slice(from, from + RAW_PAGE);
  const crumbs = [ `<a href="#" data-raw-go="0" style="color:var(--accent-bright);">save</a>` ].concat(P.map((k, i) => `<a href="#" data-raw-go="${i + 1}" style="color:var(--accent-bright);">${escapeHtml(typeof k === 'number' ? '[' + k + ']' : String(k))}</a>`)).join(' <span class="id">›</span> ');
  const rows = shown.map(k => {
    const v = node[k], kind = rawKind(v), box = v !== null && typeof v === 'object';
    const cnt = box ? (Array.isArray(v) ? v.length : Object.keys(v).length) : 0;
    const mark = RAW_VIEW.mark != null && RAW_VIEW.mark === k;
    return `<tr data-raw-row="${escapeHtml(String(k))}" style="${mark ? 'background:rgba(214,57,46,.18);' : ''}">
      <td style="white-space:nowrap; vertical-align:top;">${box ? `<a href="#" data-raw-into="${escapeHtml(JSON.stringify(k))}" style="color:var(--accent-bright);">${escapeHtml(isArr ? '[' + k + ']' : String(k))}</a>` : `<span>${escapeHtml(isArr ? '[' + k + ']' : String(k))}</span>`}</td>
      <td style="word-break:break-all;">${box ? `<span class="id">${kind === 'list' ? 'list of ' + cnt.toLocaleString() : cnt.toLocaleString() + ' field' + (cnt === 1 ? '' : 's')}</span>` : rawLeafHtml(k, v)}</td>
      <td class="id" style="white-space:nowrap; text-align:right; vertical-align:top;">${box ? rawBytes(rawSize(v)) : kind}</td>
      <td style="white-space:nowrap; vertical-align:top;"><button class="subtle" data-raw-copy="${escapeHtml(JSON.stringify(k))}" title="Copy this value" style="padding:1px 6px; font-size:11px;">copy</button></td>
    </tr>`;
  }).join('');
  const hitsHtml = RAW_VIEW.hits == null ? '' : `<div class="subDetails" style="padding:8px; margin:8px 0;">
      <div style="font-size:12px; margin-bottom:4px;"><b>${RAW_VIEW.hits.length}${RAW_VIEW.hitsMore ? '+' : ''}</b> match${RAW_VIEW.hits.length === 1 ? '' : 'es'} for <b>${escapeHtml(RAW_VIEW.q)}</b>${RAW_VIEW.hitsMore ? ` (showing the first ${RAW_HITS}; search for something longer to narrow it)` : ''} <a href="#" id="raw-hits-close" class="id" style="margin-left:8px;">close</a></div>
      <div style="max-height:220px; overflow:auto; font-family:ui-monospace, Consolas, monospace; font-size:11.5px; line-height:1.6;">${RAW_VIEW.hits.map((p, i) => { const v = rawAt(data, p); const box = v !== null && typeof v === 'object'; return `<div><a href="#" data-raw-hit="${i}" style="color:var(--accent-bright);">${escapeHtml(rawPathText(p))}</a>${box ? '' : ' = ' + escapeHtml((s => s.length > 100 ? s.slice(0, 100) + '…' : s)(JSON.stringify(v)))}</div>`; }).join('') || '<span class="id">No matches.</span>'}</div>
    </div>`;
  host.innerHTML = `<div class="capNote" style="margin-top:0;">The whole save as the game stores it, read only. Nothing can be changed here on purpose: the other tabs check every change against the game's rules. Click a name to open it; numbers that look like dates show the date. <b>Copy</b> copies a value as JSON.</div>
    <div class="toolbar" style="flex-wrap:wrap; gap:6px; align-items:center;">
      <label style="font-size:12px;">Show <select id="raw-src" style="width:auto; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:6px 8px; font-family:var(--mono); font-size:12px;"><option value="loaded" ${RAW_VIEW.src === 'loaded' ? 'selected' : ''}>the save as loaded</option><option value="edited" ${RAW_VIEW.src === 'edited' ? 'selected' : ''}>with your edits (as Download would write it)</option></select></label>
      ${RAW_VIEW.src === 'edited' ? `<button class="subtle" id="raw-refresh" title="Rebuild after more edits">Refresh</button><span class="id">built ${escapeHtml(new Date(RAW_VIEW.edAt).toLocaleTimeString())}</span>` : ''}
      <input type="search" id="raw-q" placeholder="Search keys and values (e.g. Dms4dustin, free_money, HVN_FLR_0330)" value="${escapeHtml(RAW_VIEW.q)}" style="flex:1; min-width:220px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:6px 8px; font-family:var(--mono); font-size:12px;">
      <button class="subtle" id="raw-find">Search</button>
    </div>
    ${hitsHtml}
    <div style="margin:8px 0 4px; font-size:13px; word-break:break-all;">${crumbs}</div>
    <div class="id" style="margin-bottom:6px;">${escapeHtml(rawPathText(P))} · ${isArr ? 'list of ' + keys.length.toLocaleString() : keys.length.toLocaleString() + ' fields'} · ${rawBytes(rawSize(node))}
      <button class="subtle" id="raw-copy-path" style="padding:1px 6px; font-size:11px; margin-left:6px;">Copy path</button>
      <button class="subtle" id="raw-dl" style="padding:1px 6px; font-size:11px;">Download this as .json</button></div>
    ${pages > 1 ? `<div class="toolbar" style="margin:4px 0;"><button class="subtle" id="raw-prev" ${RAW_VIEW.page ? '' : 'disabled'}>‹ Previous</button><span class="id">${(from + 1).toLocaleString()}–${Math.min(from + RAW_PAGE, keys.length).toLocaleString()} of ${keys.length.toLocaleString()}</span><button class="subtle" id="raw-next" ${RAW_VIEW.page < pages - 1 ? '' : 'disabled'}>Next ›</button></div>` : ''}
    <div style="overflow:auto;"><table class="stewTable" style="width:100%; font-family:ui-monospace, Consolas, monospace; font-size:12px;"><tbody>${rows || '<tr><td class="id">(empty)</td></tr>'}</tbody></table></div>`;
  wireRawUi(data, node, keys);
  if (RAW_VIEW.mark != null) { const r = host.querySelector(`[data-raw-row="${CSS.escape(String(RAW_VIEW.mark))}"]`); if (r) r.scrollIntoView({ block: 'center' }); }
}
// Copy text to the clipboard with a toast.
function rawCopy(text, what) {
  const done = () => toast(`Copied ${what}`);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast('Copy failed', true));
  else toast('Copy is not available in this browser', true);
}
// Wire raw viewer navigation (breadcrumbs, drill-down, hits, paging, search, downloads).
function wireRawUi(data, node, keys) {
  const $ = id => document.getElementById(id);
  const go = (path, mark) => { RAW_VIEW.path = path; RAW_VIEW.mark = mark == null ? null : mark; RAW_VIEW.page = 0; if (mark != null) { const n = rawAt(data, path); const ks = Array.isArray(n) ? n.map((_, i) => i) : Object.keys(n || {}); RAW_VIEW.page = Math.max(0, Math.floor(ks.indexOf(mark) / RAW_PAGE)); } renderRaw(); };
  document.querySelectorAll('[data-raw-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(RAW_VIEW.path.slice(0, Number(a.dataset.rawGo))); }));
  document.querySelectorAll('[data-raw-into]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(RAW_VIEW.path.concat([ JSON.parse(a.dataset.rawInto) ])); }));
  document.querySelectorAll('[data-raw-copy]').forEach(b => b.addEventListener('click', () => { const k = JSON.parse(b.dataset.rawCopy); rawCopy(JSON.stringify(node[k], null, 2), rawPathText(RAW_VIEW.path.concat([ k ]))); }));
  document.querySelectorAll('[data-raw-hit]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const p = RAW_VIEW.hits[Number(a.dataset.rawHit)]; go(p.slice(0, -1), p[p.length - 1]); }));
  $('raw-copy-path').addEventListener('click', () => rawCopy(rawPathText(RAW_VIEW.path), 'the path'));
  $('raw-dl').addEventListener('click', () => {
    const name = 'raw_' + (RAW_VIEW.path.length ? RAW_VIEW.path.map(String).join('_').replace(/[^\w.-]+/g, '-').slice(0, 80) : 'save') + '.json';
    triggerDownload(JSON.stringify(node, null, 2), name, 'application/json');
  });
  if ($('raw-prev')) $('raw-prev').addEventListener('click', () => { RAW_VIEW.page--; RAW_VIEW.mark = null; renderRaw(); });
  if ($('raw-next')) $('raw-next').addEventListener('click', () => { RAW_VIEW.page++; RAW_VIEW.mark = null; renderRaw(); });
  $('raw-src').addEventListener('change', e => { RAW_VIEW.src = e.target.value; RAW_VIEW.ed = null; RAW_VIEW.hits = null; RAW_VIEW.mark = null; renderRaw(); });
  if ($('raw-refresh')) $('raw-refresh').addEventListener('click', () => { RAW_VIEW.ed = null; RAW_VIEW.hits = null; renderRaw(); });
  const find = () => {
    const q = $('raw-q').value.trim();
    RAW_VIEW.q = q;
    if (q.length < 2) { RAW_VIEW.hits = null; toast('Type at least 2 characters to search', true); renderRaw(); return; }
    const r = rawSearch(data, q); RAW_VIEW.hits = r.hits; RAW_VIEW.hitsMore = r.more; renderRaw();
  };
  $('raw-find').addEventListener('click', find);
  $('raw-q').addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
  if ($('raw-hits-close')) $('raw-hits-close').addEventListener('click', e => { e.preventDefault(); RAW_VIEW.hits = null; renderRaw(); });
}
// Tab hook for Raw data.
function wireRaw() { if (activeTab === 'raw') renderRaw(); }

// ===== JSON compare (advanced, read only): two saves side by side, line by line, with search =====
// Compares the saves by their JSON structure, not as text (a save is 0.5-1.1 million lines when laid out one value
// per line): objects key by key, lists of records matched by their id (eid, cid, ...) so a list the game reordered
// isn't reported as changed. Changes are grouped by the object they're in and shown side by side, a line per field,
// changed lines highlighted and unchanged ones folded. Search runs over both saves. Nothing here changes the save.
// Field names used to match records between two lists, in priority order (needs a unique non-empty value in both).
const JD_IDS = [ 'eid', 'cid', 'eptid', 'emsrid', 'ebstid', 'eitemid', 'pid', 'qid', 'sklid', 'cstmid', 'id', 'flrid', 'ptid', 'itemId', 'slot' ];
// Max differences recorded, and page sizes for the differences list and the side-by-side object view.
const JD_MAX = 20000, JD_PAGE = 60, JD_VIEW_PAGE = 200;
// State of the JSON compare tab (sources, loaded file, diff result, filters, current view and search hits).
let JD = { root: null, aSrc: 'loaded', bSrc: 'file', fileRoot: null, fileName: '', edA: null, res: null, busy: false, msg: '', sec: '', kind: 'all', filter: '', page: 0, view: null, q: '', hits: null };
// Reset compare state when another save is loaded.
function jdSync() { if (JD.root !== RAW_SAV_ROOT) Object.assign(JD, { root: RAW_SAV_ROOT, edA: null, res: null, view: null, hits: null, page: 0, msg: '' }); }
// "with your edits" is the save exactly as Download would write it now (built once per Compare)
// Cached deep copy of the save as Download would write it.
function jdEdited() { if (!JD.edA) JD.edA = JSON.parse(JSON.stringify(buildDownloadRoot())); return JD.edA; }
// Resolve compare side 'A' or 'B' to a root object (edited, loaded, Compare-tab save or loaded file).
function jdSide(which) {
  const src = which === 'A' ? JD.aSrc : JD.bSrc;
  return src === 'edited' ? jdEdited() : src === 'loaded' ? RAW_SAV_ROOT : src === 'compare' ? CMP.rootB : JD.fileRoot;
}
// Display name for a compare side.
function jdSideName(which) {
  const src = which === 'A' ? JD.aSrc : JD.bSrc;
  return src === 'edited' ? 'This save, with your edits' : src === 'loaded' ? 'This save, as loaded' : src === 'compare' ? (CMP.file || 'Compare tab save') : (JD.fileName || 'Second save');
}
// Load a second save (.sav or .json) as the right-hand side; throws if it doesn't look like a full save.
async function jdLoadFile(file) {
  const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
  const root = isBrgSav(bytes) ? await parseBrgSav(bytes) : parseSaveJsonText(new TextDecoder('utf-8').decode(bytes));
  if (!looksLikeFullDump(root)) throw new Error('not a LET IT DIE save');
  JD.fileRoot = root; JD.fileName = file.name; JD.bSrc = 'file'; JD.res = null; JD.view = null; JD.hits = null;
}
// True for plain objects (not arrays or null).
const jdIsObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// the field that identifies each record of two lists, when every record has a unique one
// Pick the id field that uniquely identifies every record in both lists, or null (then lists compare by position).
function jdIdKey(a, b) {
  if (!a.length && !b.length) return null;
  if (!a.every(jdIsObj) || !b.every(jdIsObj)) return null;
  for (const k of JD_IDS) {
    const ok = x => x[k] !== undefined && x[k] !== '' && x[k] !== null && (typeof x[k] === 'string' || typeof x[k] === 'number');
    if (!a.every(ok) || !b.every(ok)) continue;
    if (new Set(a.map(x => x[k])).size === a.length && new Set(b.map(x => x[k])).size === b.length) return k;
  }
  return null;
}
// Path as text for diff group titles; '(whole save)' for the root.
function jdPathText(path) { return path.map((k, i) => typeof k === 'number' ? `[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? (i ? '.' : '') + k : `[${JSON.stringify(k)}]`).join('') || '(whole save)'; }
// groups: parent path -> { pa, pb, pathA, pathB, rows: [{ka, kb, kind}], arr, idKey }
// Structural diff of two JSON values. Returns { groups: Map(pathText -> {pathA, pathB, pa, pb, arr, idKey,
// rows:[{ka, kb, kind: changed|added|removed}]}), n, more, counts }. Lists with an id key match records by id; others
// by position. Stops at JD_MAX differences (more = true).
function jdDiff(A, B) {
  const groups = new Map(), out = { groups, n: 0, more: false, counts: { changed: 0, added: 0, removed: 0 } };
  // find or create the group for a container
  const group = (pathA, pathB, pa, pb, idKey) => {
    const key = jdPathText(pathB || pathA);
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, pathA, pathB, pa, pb, arr: Array.isArray(pa || pb), idKey, rows: [] });
    return g;
  };
  // record one difference, respecting the cap
  const note = (g, ka, kb, kind) => { if (out.n >= JD_MAX) { out.more = true; return; } out.n++; out.counts[kind]++; g.rows.push({ ka, kb, kind }); };
  // recursive walk: differences are recorded on the parent container's group
  const walk = (a, b, pathA, pathB) => {
    if (out.more) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const idKey = jdIdKey(a, b);
      let g = null; const G = () => g || (g = group(pathA, pathB, a, b, idKey));
      if (idKey) {
        const ib = new Map(b.map((x, i) => [ x[idKey], i ])), ia = new Map(a.map((x, i) => [ x[idKey], i ]));
        a.forEach((x, i) => { const j = ib.get(x[idKey]); if (j == null) note(G(), i, null, 'removed'); else walk(x, b[j], pathA.concat([ i ]), pathB.concat([ j ])); });
        b.forEach((x, j) => { if (!ia.has(x[idKey])) note(G(), null, j, 'added'); });
      } else {
        const n = Math.max(a.length, b.length);
        for (let i = 0; i < n && !out.more; i++) {
          if (i >= b.length) note(G(), i, null, 'removed');
          else if (i >= a.length) note(G(), null, i, 'added');
          else if (jdLeafDiff(a[i], b[i])) note(G(), i, i, 'changed');
          else walk(a[i], b[i], pathA.concat([ i ]), pathB.concat([ i ]));
        }
      }
      return;
    }
    if (jdIsObj(a) && jdIsObj(b)) {
      let g = null; const G = () => g || (g = group(pathA, pathB, a, b, null));
      for (const k of Object.keys(a)) {
        if (out.more) return;
        if (!(k in b)) note(G(), k, null, 'removed');
        else if (jdLeafDiff(a[k], b[k])) note(G(), k, k, 'changed');
        else walk(a[k], b[k], pathA.concat([ k ]), pathB.concat([ k ]));
      }
      for (const k of Object.keys(b)) if (!(k in a)) note(G(), null, k, 'added');
    }
  };
  walk(A, B, [], []);
  return out;
}
// a difference to report on this line itself (rather than inside it): different primitives, or different kinds
// A difference to report on this line itself (rather than inside it): different primitives or kinds.
function jdLeafDiff(x, y) {
  const ox = x !== null && typeof x === 'object', oy = y !== null && typeof y === 'object';
  if (ox && oy) return Array.isArray(x) !== Array.isArray(y);
  if (ox !== oy) return true;
  return !(x === y || (typeof x === 'number' && typeof y === 'number' && Number.isNaN(x) && Number.isNaN(y)));
}
// Short text for a value in the diff: container summaries or truncated JSON.
function jdVal(v) {
  if (v === undefined) return '';
  if (Array.isArray(v)) return `[…] ${v.length.toLocaleString()} item${v.length === 1 ? '' : 's'}`;
  if (jdIsObj(v)) { const n = Object.keys(v).length; return `{…} ${n} field${n === 1 ? '' : 's'}`; }
  const t = JSON.stringify(v);
  return t.length > 200 ? t.slice(0, 200) + '…' + (typeof v === 'string' ? `" (${v.length.toLocaleString()} characters)` : '') : t;
}
// Key label for a diff line; list indexes show the record's id field.
function jdKeyLabel(k, rec, idKey) {
  if (k == null) return '';
  if (typeof k === 'number') return `[${k}]${idKey && rec && rec[idKey] != null ? ` ${idKey}=${String(rec[idKey]).slice(0, 40)}` : ''}: `;
  return JSON.stringify(k) + ': ';
}
// One side-by-side table row; container values become links that open the object in the side-by-side view.
function jdLineHtml(cls, ka, kb, pa, pb, idKey, mark, nested) {
  const va = ka != null && pa ? pa[ka] : undefined, vb = kb != null && pb ? pb[kb] : undefined;
  const cell = (k, v, side, path) => {
    if (k == null) return '';
    const isObj = v !== null && typeof v === 'object';
    const label = escapeHtml(jdKeyLabel(k, v, idKey)), val = escapeHtml(jdVal(v)) + (typeof v === 'number' ? rawDateHint(k, v) : '');
    return isObj && nested ? `${label}<span class="jdLink" data-jd-open="${escapeHtml(JSON.stringify([ side, path.concat([ k ]) ]))}">${val}</span>` : label + val;
  };
  return `<tr class="${cls}${mark ? ' jdMark' : ''}"><td class="jdA">${cell(ka, va, 'A', nested ? nested.pathA : [])}</td><td class="jdB">${cell(kb, vb, 'B', nested ? nested.pathB : [])}</td></tr>`;
}
// one changed object: its changed lines, with two unchanged lines of context around them (objects only)
// HTML for one changed container, filtered by JD.kind, with context lines and folded unchanged runs.
function jdGroupHtml(g) {
  const kindCls = { changed: 'jdChg', added: 'jdAdd', removed: 'jdDel' };
  const nested = { pathA: g.pathA || [], pathB: g.pathB || [] };
  let rows = g.rows.filter(r => JD.kind === 'all' || r.kind === JD.kind);
  if (!rows.length) return '';
  let body = '';
  if (g.arr) {
    body = rows.slice(0, 200).map(r => jdLineHtml(kindCls[r.kind], r.ka, r.kb, g.pa, g.pb, g.idKey, false, nested)).join('');
    if (rows.length > 200) body += `<tr class="jdGap"><td colspan="2">… ${rows.length - 200} more in this list</td></tr>`;
  } else {
    const keys = [ ...new Set(Object.keys(g.pa || {}).concat(Object.keys(g.pb || {}))) ];
    const hit = new Map(rows.map(r => [ r.ka != null ? r.ka : r.kb, r ]));
    const show = new Set();
    keys.forEach((k, i) => { if (hit.has(k)) for (let d = -2; d <= 2; d++) if (keys[i + d] != null) show.add(i + d); });
    let last = -1;
    keys.forEach((k, i) => {
      if (!show.has(i)) return;
      if (i > last + 1) body += `<tr class="jdGap"><td colspan="2">⋯ ${i - last - 1} unchanged line${i - last - 1 === 1 ? '' : 's'}</td></tr>`;
      const r = hit.get(k);
      body += r ? jdLineHtml(kindCls[r.kind], r.ka, r.kb, g.pa, g.pb, null, false, nested) : jdLineHtml('jdCtx', k in (g.pa || {}) ? k : null, k in (g.pb || {}) ? k : null, g.pa, g.pb, null, false, nested);
      last = i;
    });
    if (last < keys.length - 1) body += `<tr class="jdGap"><td colspan="2">⋯ ${keys.length - 1 - last} unchanged line${keys.length - 1 - last === 1 ? '' : 's'}</td></tr>`;
  }
  const n = { changed: 0, added: 0, removed: 0 }; for (const r of rows) n[r.kind]++;
  return `<div class="jdGroup"><div class="jdGroupHead"><span class="jdLink" data-jd-open="${escapeHtml(JSON.stringify([ 'A', g.pathA || g.pathB ]))}" title="Show the whole object side by side">${escapeHtml(g.key)}</span><span class="id">${[ n.changed && n.changed + ' changed', n.removed && n.removed + ' only on the left', n.added && n.added + ' only on the right' ].filter(Boolean).join(' · ')}${g.idKey ? ` · matched by ${escapeHtml(g.idKey)}` : ''}</span></div><table class="jdTable"><colgroup><col style="width:50%"><col style="width:50%"></colgroup>${body}</table></div>`;
}
// Top-level section name of a group key (first one or two path segments).
function jdSection(key) { const m = /^([A-Za-z_$][\w$]*)(\.[A-Za-z_$][\w$]*)?/.exec(key); return m ? m[1] + (m[2] || '') : key; }
// Groups passing the section, path filter and kind filter.
function jdGroupsShown() {
  const f = JD.filter.trim().toLowerCase();
  return [ ...JD.res.groups.values() ].filter(g => (!JD.sec || jdSection(g.key) === JD.sec) && (!f || g.key.toLowerCase().includes(f)) && g.rows.some(r => JD.kind === 'all' || r.kind === JD.kind));
}
// the whole object at a path, both sides, a line per field (paged), for browsing and search hits
// Side-by-side browser of the whole object at JD.view.path (paged).
function jdViewHtml() {
  const v = JD.view, A = jdSide('A'), B = jdSide('B');
  const pa = rawAt(A, v.path), pb = B ? rawAt(B, v.path) : undefined;
  const isC = x => x !== null && typeof x === 'object';
  const crumbs = [ `<span class="jdLink" data-jd-go="[]">save</span>` ].concat(v.path.map((k, i) => `<span class="jdLink" data-jd-go="${escapeHtml(JSON.stringify(v.path.slice(0, i + 1)))}">${escapeHtml(typeof k === 'number' ? `[${k}]` : k)}</span>`)).join(' › ');
  let h = `<div class="toolbar" style="margin:0 0 6px;"><button class="subtle" id="jd-view-close">← Back to the differences</button><span style="font-family:var(--mono); font-size:12px;">${crumbs}</span></div>`;
  if (!isC(pa) && !isC(pb)) return h + `<div class="capNote">Nothing at this path on either side.</div>`;
  const arrMode = Array.isArray(pa) || Array.isArray(pb);
  const keys = arrMode ? Array.from({ length: Math.max(isC(pa) ? pa.length : 0, isC(pb) ? pb.length : 0) }, (_, i) => i) : [ ...new Set(Object.keys(isC(pa) ? pa : {}).concat(Object.keys(isC(pb) ? pb : {}))) ];
  const pages = Math.max(1, Math.ceil(keys.length / JD_VIEW_PAGE));
  if (v.mark != null) { const at = keys.indexOf(v.mark); if (at >= 0) v.page = Math.floor(at / JD_VIEW_PAGE); }
  v.page = Math.min(Math.max(0, v.page || 0), pages - 1);
  const nested = { pathA: v.path, pathB: v.path };
  const lines = keys.slice(v.page * JD_VIEW_PAGE, (v.page + 1) * JD_VIEW_PAGE).map(k => {
    const inA = isC(pa) && k in pa, inB = isC(pb) && k in pb;
    const cls = !inA ? 'jdAdd' : !inB ? 'jdDel' : JSON.stringify(pa[k]) === JSON.stringify(pb[k]) ? 'jdCtx' : 'jdChg';
    return jdLineHtml(cls, inA ? k : null, inB ? k : null, pa, pb, null, k === v.mark, nested);
  }).join('');
  h += `<div class="capNote" style="margin:0 0 6px;">Same path on both sides${arrMode ? ' (lists are shown by position here; the differences list matches records by id)' : ''}. Highlighted lines differ; click a {…} or […] to open it.</div>`;
  h += `<table class="jdTable"><colgroup><col style="width:50%"><col style="width:50%"></colgroup><tr><td class="jdA"><b>${escapeHtml(jdSideName('A'))}</b></td><td class="jdB"><b>${escapeHtml(jdSideName('B'))}</b></td></tr>${lines}</table>`;
  if (pages > 1) h += `<div class="toolbar" style="margin-top:6px;"><button class="subtle" id="jd-vprev" ${v.page ? '' : 'disabled'}>← Previous</button><span class="id">lines ${(v.page * JD_VIEW_PAGE + 1).toLocaleString()}-${Math.min(keys.length, (v.page + 1) * JD_VIEW_PAGE).toLocaleString()} of ${keys.length.toLocaleString()}</span><button class="subtle" id="jd-vnext" ${v.page < pages - 1 ? '' : 'disabled'}>Next →</button></div>`;
  return h;
}
// Block shell for the JSON compare tab.
function blockJd() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow" style="color:var(--warn);">Advanced users · read only</div><h2>JSON compare</h2></div></div>
    <div class="block-body"><div id="jd-body"></div></div>
  </section>`;
}
// Render the compare tab: warning, side selectors, file picker, Compare, search results, and either the object view or the paged differences.
function renderJd() {
  const host = document.getElementById('jd-body');
  if (!host) return;
  jdSync();
  const sel = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:6px 8px; font-family:var(--mono);';
  let h = `<div class="warnNote" style="font-size:12px;"><b>For advanced users.</b> This compares two saves the way the game stores them, field by field, and searches them. It's read only: nothing here changes your save. <b>Editing a save's JSON by hand can corrupt it</b>, crash the game or lose progress (a wrong id, a missing field or a value the game doesn't expect is enough). Only do it if you know the save format, and always keep a backup.</div>`;
  if (!RAW_SAV_ROOT) { host.innerHTML = h + '<div class="capNote">Load a .sav first.</div>'; return; }
  h += `<div class="grid" style="grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:10px; margin-bottom:8px;">
    <div class="field"><label>Left</label><select id="jd-a" style="${sel} width:100%;"><option value="loaded" ${JD.aSrc === 'loaded' ? 'selected' : ''}>This save, as loaded</option><option value="edited" ${JD.aSrc === 'edited' ? 'selected' : ''}>This save, with your edits (as Download would write it)</option></select></div>
    <div class="field"><label>Right</label><select id="jd-b" style="${sel} width:100%;"><option value="file" ${JD.bSrc === 'file' ? 'selected' : ''}>${JD.fileRoot ? 'Second save: ' + escapeHtml(JD.fileName) : 'A second save (load it below)'}</option>${CMP.rootB ? `<option value="compare" ${JD.bSrc === 'compare' ? 'selected' : ''}>The save loaded on the Compare tab (${escapeHtml(CMP.file || '')})</option>` : ''}<option value="loaded" ${JD.bSrc === 'loaded' ? 'selected' : ''}>This save, as loaded</option><option value="edited" ${JD.bSrc === 'edited' ? 'selected' : ''}>This save, with your edits (as Download would write it)</option></select></div>
  </div>
  <div class="toolbar"><label class="subtle" style="cursor:pointer; padding:6px 10px; border:1px solid var(--panel-border);">Load a second save (.sav or .json)<input type="file" id="jd-file" accept=".sav,.json" style="display:none;"></label><button class="action" id="jd-run" ${JD.busy ? 'disabled' : ''}>${JD.busy ? 'Comparing…' : 'Compare'}</button><span class="capNote" style="margin:0;">Tip: left "as loaded" and right "with your edits" shows exactly what your edits change.</span></div>`;
  if (JD.msg) h += `<div class="capNote">${escapeHtml(JD.msg)}</div>`;
  // search
  h += `<div class="toolbar" style="margin-top:8px;"><input id="jd-q" type="text" placeholder="Search keys and values in both saves" value="${escapeHtml(JD.q)}" style="${sel} flex:1; min-width:200px;"><button class="subtle" id="jd-search">Search</button>${JD.hits ? '<button class="subtle" id="jd-search-clear">Clear</button>' : ''}</div>`;
  if (JD.hits) {
    const all = JD.hits.A.hits.map(p => [ 'A', p ]).concat(JD.hits.B ? JD.hits.B.hits.map(p => [ 'B', p ]) : []);
    h += `<div class="capNote" style="margin:4px 0;">${JD.hits.A.hits.length}${JD.hits.A.more ? '+' : ''} match${JD.hits.A.hits.length === 1 ? '' : 'es'} on the left, ${JD.hits.B ? JD.hits.B.hits.length + (JD.hits.B.more ? '+' : '') : 0} on the right${(JD.hits.A.more || (JD.hits.B && JD.hits.B.more)) ? ` (first ${RAW_HITS} per side; search for something more specific)` : ''}.</div>`;
    if (all.length) h += `<div style="max-height:240px; overflow:auto; border:1px solid var(--panel-border); margin-bottom:8px;"><table class="jdTable">${all.map(([ side, p ]) => { const v = rawAt(jdSide(side), p); return `<tr><td class="jdNo" style="width:52px;">${side === 'A' ? 'left' : 'right'}</td><td><span class="jdLink" data-jd-open="${escapeHtml(JSON.stringify([ side, p ]))}">${escapeHtml(jdPathText(p))}</span> <span class="id">${escapeHtml(jdVal(v))}</span></td></tr>`; }).join('')}</table></div>`;
  }
  if (JD.view) { host.innerHTML = h + jdViewHtml(); wireJdUi(); return; }
  if (JD.res) {
    const r = JD.res;
    if (!r.n) h += `<div class="capNote">No differences: the two sides are the same.</div>`;
    else {
      const secs = new Map(); for (const g of r.groups.values()) { const k = jdSection(g.key); secs.set(k, (secs.get(k) || 0) + g.rows.length); }
      const shown = jdGroupsShown(), pages = Math.max(1, Math.ceil(shown.length / JD_PAGE));
      JD.page = Math.min(JD.page, pages - 1);
      h += `<div class="capNote" style="margin:8px 0 4px;"><b>${r.n.toLocaleString()}${r.more ? '+' : ''}</b> difference${r.n === 1 ? '' : 's'} in ${r.groups.size.toLocaleString()} object${r.groups.size === 1 ? '' : 's'}: ${r.counts.changed.toLocaleString()} changed, ${r.counts.removed.toLocaleString()} only on the left, ${r.counts.added.toLocaleString()} only on the right.${r.more ? ` Stopped at ${JD_MAX.toLocaleString()}; pick a section to narrow it down.` : ''}</div>`;
      h += `<div class="toolbar"><select id="jd-sec" style="${sel}"><option value="">All sections</option>${[ ...secs.entries() ].sort((x, y) => y[1] - x[1]).map(([ k, n ]) => `<option value="${escapeHtml(k)}" ${JD.sec === k ? 'selected' : ''}>${escapeHtml(k)} (${n.toLocaleString()})</option>`).join('')}</select><select id="jd-kind" style="${sel}"><option value="all" ${JD.kind === 'all' ? 'selected' : ''}>All differences</option><option value="changed" ${JD.kind === 'changed' ? 'selected' : ''}>Changed</option><option value="removed" ${JD.kind === 'removed' ? 'selected' : ''}>Only on the left</option><option value="added" ${JD.kind === 'added' ? 'selected' : ''}>Only on the right</option></select><input id="jd-filter" type="text" placeholder="Filter by path" value="${escapeHtml(JD.filter)}" style="${sel} min-width:180px;"><button class="subtle" id="jd-txt">Download the differences (.txt)</button></div>`;
      h += `<table class="jdTable" style="margin:6px 0 4px;"><colgroup><col style="width:50%"><col style="width:50%"></colgroup><tr><td class="jdA"><b>Left: ${escapeHtml(jdSideName('A'))}</b></td><td class="jdB"><b>Right: ${escapeHtml(jdSideName('B'))}</b></td></tr></table>`;
      h += shown.slice(JD.page * JD_PAGE, (JD.page + 1) * JD_PAGE).map(jdGroupHtml).join('') || '<div class="capNote">Nothing matches these filters.</div>';
      if (pages > 1) h += `<div class="toolbar"><button class="subtle" id="jd-prev" ${JD.page ? '' : 'disabled'}>← Previous</button><span class="id">objects ${(JD.page * JD_PAGE + 1).toLocaleString()}-${Math.min(shown.length, (JD.page + 1) * JD_PAGE).toLocaleString()} of ${shown.length.toLocaleString()}</span><button class="subtle" id="jd-next" ${JD.page < pages - 1 ? '' : 'disabled'}>Next →</button></div>`;
    }
  }
  host.innerHTML = h;
  wireJdUi();
}
// Plain-text export of the currently filtered differences.
function jdDiffText() {
  const lines = [ `JSON compare: left = ${jdSideName('A')}, right = ${jdSideName('B')}`, '' ];
  for (const g of jdGroupsShown()) for (const r of g.rows) {
    if (JD.kind !== 'all' && r.kind !== JD.kind) continue;
    const p = jdPathText((g.pathB || g.pathA).concat([ r.kb != null ? r.kb : r.ka ]));
    const a = r.ka != null && g.pa ? g.pa[r.ka] : undefined, b = r.kb != null && g.pb ? g.pb[r.kb] : undefined;
    lines.push(r.kind === 'changed' ? `${p}: ${jdVal(a)} -> ${jdVal(b)}` : r.kind === 'added' ? `${p}: only on the right: ${jdVal(b)}` : `${p}: only on the left: ${jdVal(a)}`);
  }
  return lines.join('\r\n') + '\r\n';
}
// Wire compare controls. Compare runs on a short timeout so the "Comparing..." state can paint first.
function wireJdUi() {
  const $ = id => document.getElementById(id);
  const again = () => { JD.res = null; JD.view = null; JD.hits = null; JD.page = 0; renderJd(); };
  if ($('jd-a')) $('jd-a').addEventListener('change', e => { JD.aSrc = e.target.value; JD.edA = null; again(); });
  if ($('jd-b')) $('jd-b').addEventListener('change', e => { JD.bSrc = e.target.value; JD.edA = null; again(); });
  if ($('jd-file')) $('jd-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { await jdLoadFile(f); JD.msg = ''; toast(`Loaded ${f.name} for comparing (your save is unchanged)`); } catch (err) { JD.msg = `Couldn't read ${f.name}: ${err.message}`; }
    renderJd();
  });
  if ($('jd-run')) $('jd-run').addEventListener('click', () => {
    const B = jdSide('B');
    if (!B) { JD.msg = 'Load a second save first, or pick one of this save\'s versions on the right.'; renderJd(); return; }
    JD.busy = true; JD.msg = ''; renderJd();
    setTimeout(() => {
      try { JD.edA = null; const t = Date.now(); JD.res = jdDiff(jdSide('A'), jdSide('B')); JD.msg = `Compared in ${((Date.now() - t) / 1000).toFixed(1)} s.`; }
      catch (err) { JD.res = null; JD.msg = 'The comparison failed: ' + err.message; }
      JD.busy = false; JD.view = null; JD.page = 0; renderJd();
    }, 30);
  });
  const doSearch = () => {
    const q = ($('jd-q').value || '').trim();
    JD.q = q;
    if (q.length < 2) { toast('Type at least 2 characters', true); return; }
    const B = jdSide('B');
    JD.hits = { A: rawSearch(jdSide('A'), q), B: B ? rawSearch(B, q) : null };
    renderJd();
  };
  if ($('jd-search')) $('jd-search').addEventListener('click', doSearch);
  if ($('jd-q')) $('jd-q').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  if ($('jd-search-clear')) $('jd-search-clear').addEventListener('click', () => { JD.hits = null; JD.q = ''; renderJd(); });
  if ($('jd-sec')) $('jd-sec').addEventListener('change', e => { JD.sec = e.target.value; JD.page = 0; renderJd(); });
  if ($('jd-kind')) $('jd-kind').addEventListener('change', e => { JD.kind = e.target.value; JD.page = 0; renderJd(); });
  if ($('jd-filter')) $('jd-filter').addEventListener('change', e => { JD.filter = e.target.value; JD.page = 0; renderJd(); });
  if ($('jd-prev')) $('jd-prev').addEventListener('click', () => { JD.page--; renderJd(); });
  if ($('jd-next')) $('jd-next').addEventListener('click', () => { JD.page++; renderJd(); });
  if ($('jd-txt')) $('jd-txt').addEventListener('click', () => triggerDownload(jdDiffText(), `json_compare_${reviewStamp()}.txt`, 'text/plain'));
  if ($('jd-view-close')) $('jd-view-close').addEventListener('click', () => { JD.view = null; renderJd(); });
  if ($('jd-vprev')) $('jd-vprev').addEventListener('click', () => { JD.view.page--; JD.view.mark = null; renderJd(); });
  if ($('jd-vnext')) $('jd-vnext').addEventListener('click', () => { JD.view.page++; JD.view.mark = null; renderJd(); });
  document.querySelectorAll('[data-jd-open]').forEach(el => el.addEventListener('click', () => {
    const [ side, p ] = JSON.parse(el.dataset.jdOpen);
    const v = rawAt(jdSide(side), p);
    // a container opens itself; a single value opens its parent with that line marked
    if (v !== null && typeof v === 'object') JD.view = { path: p, page: 0, mark: null };
    else JD.view = { path: p.slice(0, -1), page: 0, mark: p[p.length - 1] };
    renderJd();
    window.scrollTo(0, 0);
  }));
  document.querySelectorAll('[data-jd-go]').forEach(el => el.addEventListener('click', () => { JD.view = { path: JSON.parse(el.dataset.jdGo), page: 0, mark: null }; renderJd(); }));
}
// Tab hook for JSON compare.
function wireJd() { if (activeTab === 'jdiff') renderJd(); }
// Block shell for the Stats tab.
function blockStats() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Read only</div><h2>Stats</h2></div></div>
    <div class="block-body"><div id="stats-body"></div></div>
  </section>`;
}
// Render read-only playlog sections as tables (nested/JSON-string values are skipped) plus the top 15 decals.
function renderStats() {
  const host = document.getElementById('stats-body');
  if (!host || !RAW_SAV_ROOT) return;
  const pl = RAW_SAV_ROOT.playlog || {};
  let h = '<div class="capNote" style="margin-top:0;">The records the game keeps about your play. This tab only shows them; nothing here is changed.</div>';
  for (const [ key, title ] of STATS_SECTIONS) {
    const sec = pl[key];
    if (!sec || typeof sec !== 'object' || Array.isArray(sec)) continue;
    const rows = Object.entries(sec).filter(([ , v ]) => v === null || typeof v !== 'object').filter(([ k, v ]) => !(typeof v === 'string' && /^[\[{]/.test(v)));
    if (!rows.length) continue;
    h += `<details class="subDetails" style="margin-bottom:10px;" ${key === 'base' ? 'open' : ''}><summary>▸ ${title} (${rows.length})</summary><div class="subDetailsBody"><table class="stewTable"><tbody>`;
    h += rows.map(([ k, v ]) => `<tr><td>${escapeHtml(statsLabel(k))}</td><td style="text-align:right;">${escapeHtml(statsValue(k, v))}</td></tr>`).join('');
    h += '</tbody></table></div></details>';
  }
  // most used decals (famous.skill is a JSON map of decal id -> count)
  // famous.skill is a JSON string map of decal id -> use count
  try {
    const fam = JSON.parse((pl.famous || {}).skill || '{}');
    const top = Object.entries(fam).sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (top.length) h += `<details class="subDetails"><summary>▸ Most used decals (top ${top.length})</summary><div class="subDetailsBody"><table class="stewTable"><tbody>${top.map(([ id, n ]) => `<tr><td>${escapeHtml(SKL_INDEX[id] ? decalNameP(id) : id)}</td><td style="text-align:right;">${Number(n).toLocaleString()}</td></tr>`).join('')}</tbody></table></div></details>`;
  } catch (e) {}
  host.innerHTML = h;
}

// ---------------------------------------------------------------------------
// CURRENT RUN (read only). Shown only while the save is in a run (soul.pause set). Everything comes from the
// save as loaded: the fighter in the run (money, bloodnium, bloodnium_result {enemy_count, bloodnium,
// msr_bloodnium, start_time, elapsed_time, max_floor_id}, gain_exp/start_exp, hp, sklgauge), soul run state
// (stgid/flrid/areaid, pause + pause_x/y/z, area_start_time, replica_* = account values copied at the start),
// force_shutdown_counts, soul.hvntrinfo (map rewards), floor.rlg (floors visited, with ref areas), clear_times,
// and the item instances the run made (owners FLOOR, TRBOX, ZAKO, ZOMBIE, MBOSS, JACKAL_*). Export as CSV.
// ---------------------------------------------------------------------------
// When the game made each floor of the run. clear_times is the FIRST time a floor was ever cleared (a record,
// not rewritten by later runs), so it can't time this run. The floor list's arcid is a time-based UUID (v1) on
// most saves, giving the moment the floor was built; otherwise the batch of enemy fighters (Haters) the game
// archives when it builds a floor gives it (dchrarcs.created), found by walking back from the current floor.
