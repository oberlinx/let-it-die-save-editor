// ==== Stamp Rally (Kiwako) ====
// ---------------------------------------------------------------------------
// Stamp Rally (Kiwako's Tower Stamp Rally)
// Save: floor.stamp.stamps = [{idx, offset, created}], one per stamped floor.
//   idx 0-49 = floors 1F-50F (master_stamp); 0-39 is Stamp Rally I, 40-49 (41F-50F) is Stamp Rally II.
//   offset = how far off the stamp landed; 0 = a perfect stamp.
// gameflg.sv SGF_STAMP_BONUS = bitmask of bonuses already given (master_stamp_bonus.flg):
//   50,000 Kill Coins per 5 floors, a blueprint for completing each rally, another for a perfect one.
// Edits are kept here and written into the save at download.
// ---------------------------------------------------------------------------
// Working copy of the Stamp Rally for the loaded save: stamps array, bonus bitmask (SGF_STAMP_BONUS), a JSON
// snapshot (orig) for change detection, has = save contains floor.stamp, msg = last status line.
let RALLY = { root: null, stamps: [], bonus: 0, orig: '', has: false, msg: '' };
// rallyFlagEntry(root): finds the gameflg entry {var:'SGF_STAMP_BONUS', value, modified} in any array under root.gameflg, or null.
function rallyFlagEntry(root) {
  const g = root && root.gameflg;
  if (!g || typeof g !== 'object') return null;
  for (const k of Object.keys(g)) if (Array.isArray(g[k])) { const f = g[k].find(x => x && x.var === 'SGF_STAMP_BONUS'); if (f) return f; }
  return null;
}
// rallySync(): (re)load RALLY from RAW_SAV_ROOT when a new save was loaded (deep copy of stamps + current bonus mask).
function rallySync() {
  if (RALLY.root === RAW_SAV_ROOT) return;
  const st = RAW_SAV_ROOT && RAW_SAV_ROOT.floor && RAW_SAV_ROOT.floor.stamp;
  const f = rallyFlagEntry(RAW_SAV_ROOT);
  RALLY = { root: RAW_SAV_ROOT, stamps: st ? JSON.parse(JSON.stringify(arr(st.stamps))) : [], bonus: f ? Number(f.value) || 0 : 0, has: !!st, msg: '' };
  RALLY.orig = JSON.stringify([ RALLY.stamps, RALLY.bonus ]);
}
// rallyChanged(): true if stamps/bonus differ from the loaded save.
function rallyChanged() { return RALLY.root === RAW_SAV_ROOT && JSON.stringify([ RALLY.stamps, RALLY.bonus ]) !== RALLY.orig; }
// applyStampRally(root): download-pipeline step. If edited, writes the stamps into root.floor.stamp.stamps and the
// bonus mask into the SGF_STAMP_BONUS flag (creating it in gameflg.sv if needed). Returns root.
function applyStampRally(root) {
  if (!rallyChanged() || !RALLY.has) return root;
  root.floor = root.floor || {};
  root.floor.stamp = root.floor.stamp || { stamps: [], flrstamps: {} };
  root.floor.stamp.stamps = JSON.parse(JSON.stringify(RALLY.stamps));
  const now = Math.floor(Date.now() / 1e3);
  let f = rallyFlagEntry(root);
  if (!f && RALLY.bonus) {
    root.gameflg = root.gameflg && typeof root.gameflg === 'object' ? root.gameflg : {};
    if (!Array.isArray(root.gameflg.sv)) root.gameflg.sv = [];
    root.gameflg.sv.push(f = { var: 'SGF_STAMP_BONUS', value: 0, modified: now });
  }
  if (f && Number(f.value) !== RALLY.bonus) { f.value = RALLY.bonus; f.modified = now; }
  return root;
}
// [firstIdx, lastIdx, text id (STAMPEX.*), fallback title, rally numeral] per section of 10 floors; idx = floor-1.
const RALLY_SECTIONS = [ [ 0, 9, 'TXT_FLOOR_00', '1F-10F', 'I' ], [ 10, 19, 'TXT_FLOOR_01', '11F-20F', 'I' ], [ 20, 29, 'TXT_FLOOR_02', '21F-30F', 'I' ], [ 30, 39, 'TXT_FLOOR_03', '31F-40F', 'I' ], [ 40, 49, 'TXT_FLOOR_04', '41F-50F', 'II' ] ];
// rallyStamp(idx): the stamp record for floor index idx, or undefined.
const rallyStamp = idx => RALLY.stamps.find(x => x && Number(x.idx) === idx);
// rallySet(idx, offset): add/update a stamp (offset 0 = perfect); offset null removes it.
function rallySet(idx, offset) {   // offset null = not stamped
  const i = RALLY.stamps.findIndex(x => x && Number(x.idx) === idx);
  if (offset == null) { if (i >= 0) RALLY.stamps.splice(i, 1); return; }
  if (i >= 0) RALLY.stamps[i].offset = offset;
  else RALLY.stamps.push({ idx, offset, created: Math.floor(Date.now() / 1e3) });
}
// Reset floors lo..hi: remove their stamps and set every bonus that includes one of them back to
// "not given", so the game can hand it out again once those floors are stamped.
function rallyResetFloors(lo, hi) {
  for (let i = lo; i <= hi; i++) rallySet(i, null);
  let n = 0;
  for (const b of arr(AP && AP.stampBonus)) {
    const f = Number(b.flg);
    if (Number(b.stidx) <= hi && Number(b.edidx) >= lo && (RALLY.bonus & f)) { RALLY.bonus &= ~f; n++; }
  }
  return n;
}
// rallyBonuses(): master_stamp_bonus rows (sorted by flag bit) with progress: stamps held / perfect count vs. needed,
// whether the requirement is met, whether the bit is set in RALLY.bonus (claimed), and the reward row.
function rallyBonuses() {
  return arr(AP && AP.stampBonus).slice().sort((a, b) => Number(a.flg) - Number(b.flg)).map(b => {
    const st = Number(b.stidx), ed = Number(b.edidx), perfect = Number(b.perfect) === 1, flg = Number(b.flg);
    let have = 0, perf = 0;
    for (let i = st; i <= ed; i++) { const x = rallyStamp(i); if (x) { have++; if (Number(x.offset) === 0) perf++; } }
    const need = ed - st + 1;
    const rw = arr(AP && AP.rewards).find(r => r.rwdid === b.rwdid) || {};
    const rally = st >= 40 ? 'II' : 'I';
    const label = ed - st + 1 >= 10 ? `Stamp Rally ${rally} ${perfect ? 'perfect (every stamp perfect)' : 'complete'}` : `${st + 1}F-${ed + 1}F`;
    return { id: b.bnsid, flg, perfect, st, ed, need, have, perf, met: perfect ? perf === need : have === need, claimed: (RALLY.bonus & flg) !== 0, rw, label };
  });
}
// rallyRewardLabel(rw): text for a bonus reward (Kill Coins or item name).
function rallyRewardLabel(rw) {
  if (!rw || !rw.type) return '?';
  if (rw.type === 'MONEY') return `${Number(rw.num).toLocaleString()} Kill Coins`;
  if (rw.type === 'ITEM') return itemDisplayName(rw.val0);
  return rw.type + ' ' + (rw.val0 || '');
}
// blockRally(): section shell; renderRally() fills #rally-body.
function blockRally() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Kiwako</div><h2>Stamp Rally</h2></div></div>
    <div class="block-body"><div id="rally-body"></div></div>
  </section>`;
}
// renderRally(): draws stamps per section (select per floor: Not stamped / Perfect / Off by n), reset buttons and the
// bonus table, then wires handlers. 'Send reward' adds the reward to the Reward Box via addPresent() and marks it given.
function renderRally() {
  const host = document.getElementById('rally-body');
  if (!host || !SAVE || !RAW_SAV_ROOT) return;
  rallySync();
  if (!RALLY.has) { host.innerHTML = '<div class="capNote" style="margin-top:0;">This save has no Stamp Rally data yet (the game adds it when you reach the Tower).</div>'; return; }
  const sel = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:5px 6px; font-family:var(--mono);';
  let h = `<div class="capNote" style="margin-top:0;">One stamp per floor, 1F-40F for Stamp Rally I and 41F-50F for Stamp Rally II. "Perfect" is a stamp that landed dead on (offset 0); "off by n" is how far off it landed, as the game stores it. The game gives each bonus once and remembers it. <b>Reset</b> on a floor or section removes those stamps and sets every bonus that includes them back to <b>not given</b>, so they can be earned again; <b>Reset all</b> does it for the whole rally. You can also set a bonus by hand, or use <b>Send reward</b> to put it in the Reward Box now.</div>`;
  if (RALLY.msg) h += `<pre class="stewLog">${escapeHtml(RALLY.msg)}</pre>`;
  h += `<div class="toolbar"><button class="subtle" id="rally-all-perfect">Stamp every floor (perfect)</button><button class="subtle" id="rally-clear">Clear all stamps</button><button class="subtle" id="rally-reset">Reset all (stamps and bonuses)</button><span class="count">${RALLY.stamps.length} / 50 stamped · ${RALLY.stamps.filter(x => Number(x.offset) === 0).length} perfect${rallyChanged() ? ' · changed' : ''}</span></div>`;
  for (const [st, ed, txt, fallback, rally] of RALLY_SECTIONS) {
    const title = resolveName('STAMPEX.' + txt) || fallback;
    h += `<div class="eyebrow" style="margin:14px 0 6px;">Stamp Rally ${rally} · ${escapeHtml(title)} <button class="subtle" data-rally-sec-perfect="${st}">All perfect</button> <button class="subtle" data-rally-sec-clear="${st}">Clear stamps</button> <button class="subtle" data-rally-sec-reset="${st}" title="Clear this section's stamps and set its bonuses back to not given">Reset</button></div><div class="grid" style="grid-template-columns: repeat(5, 1fr);">`;
    for (let i = st; i <= ed; i++) {
      const x = rallyStamp(i), v = x ? String(Number(x.offset) || 0) : '';
      const opts = [ [ '', 'Not stamped' ], [ '0', 'Perfect' ] ].concat(Array.from({ length: 16 }, (_, k) => [ String(k + 1), `Off by ${k + 1}` ]));
      h += `<div class="field"><label>${i + 1}F${x && x.created ? ` <span class="id">${new Date(Number(x.created) * 1000).toLocaleDateString()}</span>` : ''}${x ? ` <button class="subtle" data-rally-floor-reset="${i}" title="Remove this stamp and set the bonuses that include ${i + 1}F back to not given" style="padding:0 6px; font-size:11px;">Reset</button>` : ''}</label><select data-rally-idx="${i}" style="width:100%; ${sel}">${opts.map(([val, t]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    }
    h += '</div>';
  }
  const bs = rallyBonuses();
  h += `<div class="eyebrow" style="margin:16px 0 6px;">Bonuses</div><div class="capNote" style="margin-top:0;">To put a bonus's reward in the Reward Box: finish its stamps (above), set it to <b>Not given</b>, then click <b>Send reward</b> on its row.</div><table class="stewTable"><thead><tr><th>Bonus</th><th>Reward</th><th>Stamps</th><th>Given by the game</th><th></th></tr></thead><tbody>`;
  h += bs.map(b => `<tr><td>${escapeHtml(b.label)}</td><td>${escapeHtml(rallyRewardLabel(b.rw))}</td><td>${b.perfect ? `${b.perf}/${b.need} perfect` : `${b.have}/${b.need}`}${b.met ? ' ✓' : ''}</td>
    <td><select data-rally-bonus="${b.flg}" style="${sel}"><option value="1" ${b.claimed ? 'selected' : ''}>Given</option><option value="0" ${b.claimed ? '' : 'selected'}>Not given</option></select></td>
    <td>${!b.claimed && b.met ? `<button class="action" data-rally-send="${b.flg}">Send reward</button>` : `<button class="subtle" disabled style="opacity:.45; cursor:not-allowed;" title="${b.claimed ? 'Already given. Set it to Not given first.' : 'Finish its stamps first.'}">Send reward</button><div class="id" style="margin-top:2px;">${b.claimed ? 'set to Not given first' : b.perfect ? `needs ${b.need - b.perf} more perfect` : `needs ${b.need - b.have} more stamp${b.need - b.have === 1 ? '' : 's'}`}</div>`}</td></tr>`).join('');
  h += '</tbody></table>';
  host.innerHTML = h;
  // done(msg): store the message, re-render, toast
  const done = msg => { RALLY.msg = msg || ''; renderRally(); if (msg) toast(msg); };
  host.querySelectorAll('[data-rally-idx]').forEach(el => el.addEventListener('change', () => { const rv = el.value === '' ? null : Number(el.value); if (rv !== null && !Number.isInteger(rv)) { done(''); return; } rallySet(Number(el.dataset.rallyIdx), rv); done(''); }));
  host.querySelectorAll('[data-rally-sec-perfect]').forEach(el => el.addEventListener('click', () => { const st = Number(el.dataset.rallySecPerfect); for (let i = st; i < st + 10; i++) rallySet(i, 0); done(`${st + 1}F-${st + 10}F stamped perfect`); }));
  host.querySelectorAll('[data-rally-sec-clear]').forEach(el => el.addEventListener('click', () => { const st = Number(el.dataset.rallySecClear); for (let i = st; i < st + 10; i++) rallySet(i, null); done(`${st + 1}F-${st + 10}F cleared`); }));
  const bonusMsg = n => n ? `; ${n} bonus${n === 1 ? '' : 'es'} set back to not given` : '';
  host.querySelectorAll('[data-rally-floor-reset]').forEach(el => el.addEventListener('click', () => { const i = Number(el.dataset.rallyFloorReset); const n = rallyResetFloors(i, i); done(`${i + 1}F reset${bonusMsg(n)}`); }));
  host.querySelectorAll('[data-rally-sec-reset]').forEach(el => el.addEventListener('click', () => { const st = Number(el.dataset.rallySecReset); const n = rallyResetFloors(st, st + 9); done(`${st + 1}F-${st + 10}F reset${bonusMsg(n)}`); }));
  host.querySelector('#rally-all-perfect').addEventListener('click', () => { for (let i = 0; i < 50; i++) rallySet(i, 0); done('Every floor stamped perfect'); });
  host.querySelector('#rally-clear').addEventListener('click', () => { RALLY.stamps = []; done('All stamps cleared'); });
  host.querySelector('#rally-reset').addEventListener('click', () => { RALLY.stamps = []; RALLY.bonus = 0; done('Stamp Rally reset: no stamps, and every bonus can be earned again'); });
  host.querySelectorAll('[data-rally-bonus]').forEach(el => el.addEventListener('change', () => { const f = Number(el.dataset.rallyBonus); RALLY.bonus = el.value === '1' ? (RALLY.bonus | f) : (RALLY.bonus & ~f); done(''); }));
  host.querySelectorAll('[data-rally-send]').forEach(el => el.addEventListener('click', () => {
    const b = rallyBonuses().find(x => x.flg === Number(el.dataset.rallySend));
    if (!b || !b.rw || !b.rw.type) return;
    if (b.rw.type === 'MONEY') addPresent('MONEY', Number(b.rw.num) || 0, '');
    else if (b.rw.type === 'ITEM') addPresent(boxGameType('ITEM', b.rw.val0), Number(b.rw.num) || 1, b.rw.val0);
    RALLY.bonus |= b.flg;
    done(`${b.label}: ${rallyRewardLabel(b.rw)} sent to the Reward Box and marked as given`);
  }));
}
// wireRally(): tab-activation hook; renders only when the Rally tab is active.
function wireRally() { if (activeTab === 'rally') renderRally(); }

