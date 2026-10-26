// ==== Restroom (the prison): size and releasing prisoners ====
// Size: master_prison has 6 levels, and level n is n cells. The game decides how many cells to show from how many rows
// soul.prison[uid] (SAVE.prison here) holds, NOT from what is in them (tested in game: a list cut to 1, 3 or 4 rows showed
// 1, 3 or 4 cells with the rest blocked off; a list of all 6 rows with cells zeroed still showed 6; an account with no
// rows shows 1 cell). So the size is the number of rows, from 1 to 6. A built, empty cell row has conciliate_second
// 14700, expire_time -1 and a log_max_spirit. Raising the size here is free and instant (no Kill Coins, no build
// wait); lowering removes the last rows and only takes back empty cells.
// Release: what the game does when it frees a prisoner (diffed before/after saves): the prisoner's fighter record and
// body row go, its death bag key stays as {}, the cell goes back to built-and-empty (log_max_spirit and
// conciliate_second kept, last_collect_time = now, expire_time -1), and the kidnap record in root.abduct is kept. The
// SPLithium held in the cell is added to the account, up to the tank's cap.
const RESTROOM_MAX = 6;
const RESTROOM_DEFAULT = { conciliate_second: 14700, log_max_spirit: 12250 };

// A cell counts as built when its conciliation time is set.
const restroomBuilt = p => !!p && Number(p.conciliate_second) > 0;
// The size is the number of rows (the game always shows at least one cell).
function restroomLevel() { return Math.max(1, Math.min(RESTROOM_MAX, arr(SAVE && SAVE.prison).length)); }
function restroomPrices() {
  const rows = (AP && AP.restroomLevels) || [];
  return rows.length ? rows : [ 1, 2, 3, 4, 5, 6 ].map(n => ({ number: n, price: [ 0, 32000, 64000, 128000, 256000, 512000 ][n - 1] }));
}
const restroomNow = () => Math.floor(Date.now() / 60000) * 60;

// The first built, empty cell of the save, to copy its settings; falls back to typical values.
function restroomTemplate() {
  const built = arr(SAVE.prison).filter(restroomBuilt);
  const t = built.find(p => !p.abid) || built[0];
  return {
    conciliate_second: t ? t.conciliate_second : RESTROOM_DEFAULT.conciliate_second,
    log_max_spirit: built.length ? Math.max(...built.map(p => Number(p.log_max_spirit) || 0)) || RESTROOM_DEFAULT.log_max_spirit : RESTROOM_DEFAULT.log_max_spirit,
    last_collect_time: t && t.last_collect_time > 0 && t.last_collect_time < 4e9 ? t.last_collect_time : restroomNow()
  };
}
function restroomEmptyRow(slot, built, tpl) {
  return {
    uid: Number(RAW_SAV_MAIN_UID) || 0, slot, abid: '', log_abid: '', spirit: 0, spirit_fee: 0, log_spirit: 0,
    log_max_spirit: built ? tpl.log_max_spirit : 0, money_ransom: 0,
    conciliate_second: built ? tpl.conciliate_second : 0,
    last_collect_time: built ? tpl.last_collect_time : 0,
    expire_time: built ? -1 : 0,
    state: 'EMPTY', abduct: null
  };
}
// Sets the restroom size (1-6 cells) by adding or removing rows. Returns null when done, else a message saying why not.
function setRestroomLevel(level) {
  level = Math.floor(Number(level));
  if (isNaN(level) || level < 1 || level > RESTROOM_MAX) return `The restroom size is 1 to ${RESTROOM_MAX} cells.`;
  SAVE.prison = arr(SAVE.prison);
  const held = SAVE.prison.filter(p => p && p.slot > level && p.abid);
  if (held.length) return `${held.length} cell${held.length === 1 ? ' still holds a prisoner' : 's still hold prisoners'} in the cells above size ${level}. Release ${held.length === 1 ? 'it' : 'them'} first.`;
  const tpl = restroomTemplate();
  SAVE.prison = SAVE.prison.filter(p => p && p.slot <= level);
  for (let slot = 1; slot <= level; slot++) {
    if (!SAVE.prison.some(p => p.slot === slot)) SAVE.prison.push(restroomEmptyRow(slot, true, tpl));
  }
  SAVE.prison.sort((a, b) => a.slot - b.slot);
  return null;
}

// The prisoner's fighter record for a cell (matched by abid), or null.
const restroomFighter = p => p && p.abid ? arr(SAVE.soul.chrs).find(c => c && c.abid === p.abid) || null : null;
function restroomRelease(slot) {
  const row = arr(SAVE.prison).find(p => p && p.slot === slot && p.abid);
  if (!row) return 'That cell is empty.';
  const c = restroomFighter(row);
  if (c) {
    // the fighter's carried items go with it, and its death bag key is left as {} (as for a deleted fighter)
    if (FIGHTER_DELETES.root !== RAW_SAV_ROOT) FIGHTER_DELETES = { root: RAW_SAV_ROOT, cids: new Set, eids: new Set };
    for (const p of arr(c.pspts)) FIGHTER_DELETES.eids.add(p.eptid);
    for (const m of arr(c.psmsrs)) FIGHTER_DELETES.eids.add(m.emsrid);
    for (const b of arr(c.psbsts)) FIGHTER_DELETES.eids.add(b.ebstid);
    for (const it of arr(c.psitems)) FIGHTER_DELETES.eids.add(it.eitemid);
    const rawChrs = arr(RAW_SAV_ROOT.soul && RAW_SAV_ROOT.soul.chr && RAW_SAV_ROOT.soul.chr.chrs && RAW_SAV_ROOT.soul.chr.chrs[RAW_SAV_MAIN_UID]);
    if (rawChrs.some(x => x.cid === c.cid)) FIGHTER_DELETES.cids.add(c.cid);
    SAVE.soul.chrs = SAVE.soul.chrs.filter(x => x !== c);
    SAVE.fortsetting = arr(SAVE.fortsetting).filter(e => e.cid !== c.cid);
    if (activeCharIdx >= SAVE.soul.chrs.length) activeCharIdx = 0;
  }
  // the SPLithium waiting in the cell is added to the account, up to the tank's cap
  const cap = bankCapacityForLevel(SAVE.soul.spirit_tank_level || 1, 'spirit_tank_level');
  const have = Number(SAVE.soul.spirit) || 0, add = Math.max(0, Number(row.spirit) || 0);
  const gained = Math.max(0, Math.min(add, cap - have));
  SAVE.soul.spirit = have + gained;
  Object.assign(row, { abid: '', log_abid: '', spirit: 0, spirit_fee: 0, log_spirit: 0, money_ransom: 0, expire_time: -1, last_collect_time: restroomNow(), state: 'EMPTY', abduct: null });
  return { name: c ? c.name : '', gained, lost: add - gained };
}

function blockRestroom() {
  if (!SAVE) return '';
  const rows = arr(SAVE.prison).filter(p => p && p.abid).sort((a, b) => a.slot - b.slot);
  const lvl = restroomLevel(), prices = restroomPrices();
  const opts = Array.from({ length: RESTROOM_MAX }, (_, i) => {
    const n = i + 1, pr = prices.find(r => Number(r.number) === n);
    return `<option value="${n}" ${n === lvl ? 'selected' : ''}>${n} cell${n === 1 ? '' : 's'}${pr && Number(pr.price) ? ` (game price ${Number(pr.price).toLocaleString()} KC)` : ''}</option>`;
  }).join('');
  const cap = bankCapacityForLevel(SAVE.soul.spirit_tank_level || 1, 'spirit_tank_level');
  const list = rows.length ? `<table class="stewTable" style="margin-top:10px;"><thead><tr><th>Cell</th><th>Prisoner</th><th>State</th><th>SPLithium in cell</th><th>Ransom</th><th></th></tr></thead><tbody>${rows.map(p => {
    const c = restroomFighter(p), a = p.abduct || {};
    return `<tr><td>${p.slot}</td><td>${escapeHtml(c ? c.name || '?' : a.charaname || '(no fighter record)')}</td><td>${escapeHtml(p.state || a.state || '')}</td><td>${Number(p.spirit || 0).toLocaleString()}</td><td>${a.ransom != null ? Number(a.ransom).toLocaleString() : ''}</td><td><button class="subtle" data-restroom-release="${p.slot}">Release</button></td></tr>`;
  }).join('')}</tbody></table>` : `<div class="capNote">No prisoners right now.</div>`;
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Account</div><h2>Restroom</h2></div></div>
    <div class="block-body">
      <div class="field" style="max-width:380px;"><label>Restroom size</label><select id="restroom-level">${opts}</select></div>
      <div class="capNote">Raising the size is free here and instant (no Kill Coins, no building time). Lowering removes the last cells; if one of them holds a prisoner you are asked whether to release it first. The game always shows at least one cell. Taking cells away is not something the game does itself, so keep a backup.</div>
      ${list}
      <div class="capNote">Release frees the prisoner like the game does and adds the SPLithium in its cell to your account, up to your tank's cap (${cap.toLocaleString()}). You can release at any time.</div>
    </div>
  </section>`;
}
function wireRestroom() {
  const sel = document.getElementById('restroom-level');
  if (sel) sel.addEventListener('change', () => {
    const level = Number(sel.value), reset = () => { sel.value = String(restroomLevel()); };
    // cells that would be removed but hold a prisoner: offer to release them first
    const held = arr(SAVE.prison).filter(p => p && p.slot > level && p.abid);
    let released = 0, gained = 0;
    if (held.length) {
      const names = held.map(p => { const c = restroomFighter(p); return `cell ${p.slot}: ${c ? c.name || '?' : (p.abduct && p.abduct.charaname) || 'prisoner'}`; }).join('\n');
      if (!confirm(`${held.length} of the cells to be removed ${held.length === 1 ? 'holds a prisoner' : 'hold prisoners'}:\n\n${names}\n\nRelease ${held.length === 1 ? 'it' : 'them'} first (the SPLithium in the cell${held.length === 1 ? '' : 's'} is added to your account, up to the tank's cap) and then remove the cells?`)) { reset(); return; }
      for (const p of held) {
        const r = restroomRelease(p.slot);
        if (typeof r === 'string') { toast(r, true); renderAll(); return; }
        released++; gained += r.gained || 0;
      }
    }
    const msg = setRestroomLevel(level);
    if (msg) { toast(msg, true); renderAll(); return; }
    renderAll();
    toast(`Restroom set to ${restroomLevel()} cell${restroomLevel() === 1 ? '' : 's'}.${released ? ` Released ${released} prisoner${released === 1 ? '' : 's'}${gained ? ` (+${gained.toLocaleString()} SPLithium)` : ''}.` : ''}`);
  });
  document.querySelectorAll('[data-restroom-release]').forEach(btn => btn.addEventListener('click', () => {
    const slot = Number(btn.dataset.restroomRelease), p = arr(SAVE.prison).find(x => x && x.slot === slot), c = restroomFighter(p);
    if (!confirm(`Release ${c ? c.name || 'this prisoner' : 'this prisoner'} from cell ${slot}?\n\nThe prisoner is removed from your save and the SPLithium in the cell is added to your account (up to the tank's cap).`)) return;
    const r = restroomRelease(slot);
    if (typeof r === 'string') { toast(r, true); return; }
    renderAll();
    toast(`${r.name || 'Prisoner'} released.${r.gained ? ` +${r.gained.toLocaleString()} SPLithium.` : ''}${r.lost ? ` ${r.lost.toLocaleString()} SPLithium did not fit in the tank.` : ''}`);
  }));
}
