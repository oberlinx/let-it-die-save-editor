// ---------------------------------------------------------------------------
// Collection: Armor Skins in use, Mushroom book, Beast book
// soul.armorskin = [{type: PTTP_HEAD|PTTP_BODY|PTTP_LEGS, ptid}] -- the skin shown on each armor
//   slot; only skins unlocked by R&D at +4 are offered (armorSkinsUnlocked).
// soul.msrbook / soul.bstbook = [{id, flag}] -- an entry per mushroom/beast you have come across;
//   flag bits: 1 = eaten raw, 2 = eaten grilled, 4 = an older record the online game kept for
//   everything found. Evidence: mushrooms that can't be grilled (enable_roast 0) never have bit 2,
//   and a newer account has only bits 1/2 for exactly the kinds its play log says it has eaten.
//   The editor sets bits 1/2 and leaves bit 4 as it is.
// ---------------------------------------------------------------------------
// Armor slot types and their labels, in display order (soul.armorskin entries use these type keys).
const SKIN_SLOTS = [ [ 'PTTP_HEAD', 'Head' ], [ 'PTTP_BODY', 'Body' ], [ 'PTTP_LEGS', 'Legs' ] ];
// UI state of the Collection tab (name filter for the mushroom/beast tables).
let COLL_FORM = { filter: '' };
// Block shell for the Collection tab (magazines + mushroom/beast books); renderCollection fills #coll-body.
function blockCollection() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Account</div><h2>Collection</h2></div></div>
    <div class="block-body"><div id="coll-body"></div></div>
  </section>`;
}
// Build the rows for a book table. kind 'msr' (mushrooms) or 'bst' (beasts).
// Returns [{id, name, grill, e, flag}] sorted by master idx; flag is null when the entry is not in the save's book
// (found = present). `grill` is false only for mushrooms with enable_roast 0 (beasts can always be grilled).
function bookRows(kind) {
  const idx = kind === 'msr' ? MSR_INDEX : BST_INDEX;
  const book = kind === 'msr' ? SAVE.soul.msrbook : SAVE.soul.bstbook;
  const byId = new Map(arr(book).map(e => [ e.id, e ]));
  return Object.values(idx).sort((a, b) => (Number(a.idx) || 0) - (Number(b.idx) || 0)).map(r => {
    const e = byId.get(r.id);
    const grill = kind === 'bst' || Number(r.enable_roast) !== 0;
    const name = kind === 'msr' ? msrDisplayName(r.id, 0) : bstDisplayName(r.id, 0);
    return { id: r.id, name, grill, e, flag: e ? Number(e.flag) || 0 : null };
  });
}
// Set or clear flag bits on a book entry, creating the entry (flag 0) if missing.
// bits: 1 = eaten raw, 2 = eaten grilled (bit 4, the older online record, is never touched). Mutates SAVE.
function bookSet(kind, id, bits, on) {
  const key = kind === 'msr' ? 'msrbook' : 'bstbook';
  SAVE.soul[key] = arr(SAVE.soul[key]);
  let e = SAVE.soul[key].find(x => x.id === id);
  if (!e) SAVE.soul[key].push(e = { id, flag: 0 });
  e.flag = on ? (Number(e.flag) | bits) : (Number(e.flag) & ~bits);
}
// Mark every entry of a book as eaten raw (and grilled where possible). Returns how many entries changed.
function bookComplete(kind) {
  let n = 0;
  for (const r of bookRows(kind)) {
    const want = 1 | (r.grill ? 2 : 0);
    if (r.flag == null || (r.flag & want) !== want) { bookSet(kind, r.id, want, true); n++; }
  }
  return n;
}
// Block shell for the Armor Skins section.
function blockSkins() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">All fighters</div><h2>Armor Skins</h2></div></div>
    <div class="block-body">${fsec('skins', 'In use', 'the look on each armor slot, shared by all your fighters', '<div id="skin-body"></div>')}</div>
  </section>`;
}
// Render the three armor-slot skin selectors into #skin-body. Only skins unlocked by armor research (+4)
// are offered; an already-set skin that is not unlocked stays selectable and is labelled. Writing replaces
// the slot's entry in SAVE.soul.armorskin and keeps the list in head/body/legs order.
function renderSkins() {
  const host = document.getElementById('skin-body');
  if (!host || !SAVE) return;
  const sel = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono); width:100%;';
  // armor skins
  const unlocked = [ ...armorSkinsUnlocked(SAVE.user_research) ];
  const inUse = arr(SAVE.soul.armorskin);
  let h = `
    <div class="capNote" style="margin-top:0;">The look shown on each armor slot, for all your fighters (the game keeps one set for the account). Only skins you've unlocked (armor researched to +4) are offered. ${unlocked.length} unlocked.</div>
    <div class="grid" style="grid-template-columns: repeat(3, 1fr);">`;
  for (const [ type, label ] of SKIN_SLOTS) {
    const cur = (inUse.find(x => x && x.type === type) || {}).ptid || '';
    const opts = unlocked.filter(id => PT_INDEX[id] && PT_INDEX[id].type === type).map(id => [ id, PT_INDEX[id].name ]).sort((a, b) => a[1].localeCompare(b[1]));
    h += `<div class="field"><label>${label}</label><select data-skin="${type}" style="${sel}"><option value="">None (show the armor you wear)</option>${opts.map(([ id, nm ]) => `<option value="${id}" ${id === cur ? 'selected' : ''}>${escapeHtml(nm)}</option>`).join('')}${cur && !opts.some(o => o[0] === cur) ? `<option value="${cur}" selected>${escapeHtml((PT_INDEX[cur] || {}).name || cur)} (not unlocked)</option>` : ''}</select></div>`;
  }
  h += '</div>';
  host.innerHTML = h;
  // each selector change rewrites the whole armorskin list for that slot
  host.querySelectorAll('[data-skin]').forEach(el => el.addEventListener('change', () => {
    const type = el.dataset.skin;
    const list = arr(SAVE.soul.armorskin).filter(x => x && x.type !== type);
    if (el.value) list.push({ type, ptid: el.value });
    list.sort((a, b) => SKIN_SLOTS.findIndex(x => x[0] === a.type) - SKIN_SLOTS.findIndex(x => x[0] === b.type));
    SAVE.soul.armorskin = list;
    toast(el.value ? `${SKIN_SLOTS.find(x => x[0] === type)[1]} skin: ${(PT_INDEX[el.value] || {}).name || el.value}` : `${SKIN_SLOTS.find(x => x[0] === type)[1]} skin removed`);
  }));
}

// ==== My Collection: magazines ====
// My Collection: "Tales From The Barbs" (the four boss magazines, 6 pages each, type BOSS) and the
// "YB Catalogue" (8 pages, type ZAKO), picked up on floors 1F-40F (master_magazine: idx, type, volume,
// page, flrid). soul.magazine.status_list = comma list indexed by idx (0 and 7/14/21 unused):
// -1 = not found, 1 = found (new), 2 = found and read -- seen in real saves, where every found page
// is 1 or 2 regardless of whether its volume is complete. master_magazine_bonus gives 50,000 Kill Coins
// per complete volume; the game hands that out when you pick up the last page (no flag is kept).
// Floor-number offset of each stage prefix in a magazine's flrid (MET 1-10 -> 1F-10F, ARC -> 11F-20F, ...).
const MAG_STAGE_OFS = { MET: 0, ARC: 10, AMS: 20, RFT: 30 };
// Convert a magazine's flrid (e.g. STAGE_FLR_nn) to the 1F-40F number, or null if unknown.
function magFloor(flrid) { const m = /^([A-Z]+)_FLR_(\d+)/.exec(String(flrid || '')); return m && MAG_STAGE_OFS[m[1]] != null ? MAG_STAGE_OFS[m[1]] + Number(m[2]) : null; }
// Parse soul.magazine.status_list (comma string indexed by master_magazine idx) into a number array,
// padded with -1 (not found) to at least 36 entries / every known idx. Values: -1 none, 1 new, 2 read.
function magList() {
  const m = SAVE.soul.magazine;
  const raw = m && typeof m === 'object' ? String(m.status_list || '') : '';
  const out = raw ? raw.split(',').map(x => Number(x)) : [];
  const n = Math.max(out.length, ...arr(AP && AP.magazines).map(r => Number(r.idx) + 1), 36);
  while (out.length < n) out.push(-1);
  return out;
}
// Store the status list back as a comma string, coercing soul.magazine to an object if it was {} / [] / missing.
function magWrite(list) {
  if (!SAVE.soul.magazine || typeof SAVE.soul.magazine !== 'object' || Array.isArray(SAVE.soul.magazine)) SAVE.soul.magazine = {};
  SAVE.soul.magazine.status_list = list.map(v => String(v)).join(',');
}
// Which volumes already had their reward sent in this editing session (`keys`), plus the as-loaded status list (`orig`);
// reset whenever a different save is loaded.
let MAG_SENT = { root: null, keys: new Set(), orig: [] };
// pages as the loaded save had them (the bonus is only offered for volumes finished here); taken from
// the save text kept at load, since the live objects change as you edit
// Status list as in the originally loaded save text (cached per root); used to tell which volumes were
// already complete, so the 50,000 Kill Coins reward is only offered for volumes completed here.
function magOrigList() {
  if (MAG_SENT.root !== RAW_SAV_ROOT) {
    let orig = [];
    try { const r = ORIG_SAVE.root === RAW_SAV_ROOT && ORIG_SAVE.text ? JSON.parse(ORIG_SAVE.text) : null; orig = String((((r || {}).soul || {}).magazine || {}).status_list || '').split(',').map(Number); } catch (e) {}
    MAG_SENT = { root: RAW_SAV_ROOT, keys: new Set(), orig };
  }
  return MAG_SENT.orig;
}
// Group the magazine master rows into volumes [{key: type+volume, type, volume, pages}] ordered by idx.
function magVolumes() {
  const vols = [];
  for (const r of arr(AP && AP.magazines).slice().sort((a, b) => a.idx - b.idx)) {
    const key = r.type + r.volume;
    let v = vols.find(x => x.key === key);
    if (!v) vols.push(v = { key, type: r.type, volume: Number(r.volume), pages: [] });
    v.pages.push(r);
  }
  return vols;
}
// Display title for a volume: a boss-magazine volume (BOSS) or the YB Catalogue (ZAKO), using game text if available.
function magVolTitle(v) {
  const barbs = resolveName('BOOK_MYCOLLECTION.TXT_TOWEROFBARBS') || 'Tales From The Barbs';
  const cat = resolveName('BOOK_MYCOLLECTION.TXT_CATALOG') || 'YB Catalogue';
  return v.type === 'BOSS' ? `${barbs} Vol. ${v.volume}` : cat;
}
// HTML for the magazine part of the Collection tab: per-page selects (Not found / New / Read), per-volume
// "Find all", and "Send reward" for volumes completed in the editor. Returns '' without masters data.
function magHtml() {
  if (!arr(AP && AP.magazines).length) return '';
  const list = magList();
  const sel = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:5px 6px; font-family:var(--mono); width:100%;';
  const vols = magVolumes();
  const found = vols.reduce((n, v) => n + v.pages.filter(p => list[p.idx] > 0).length, 0), total = vols.reduce((n, v) => n + v.pages.length, 0);
  let h = `<div class="toolbar" style="margin:0 0 6px;"><div class="eyebrow" style="margin:0;">My Collection: magazines</div><button class="subtle" id="mag-all">Find and read every page</button><span class="count">${found} / ${total} pages found</span></div>
    <div class="capNote" style="margin-top:0;">The pages you pick up on 1F–40F. "New" is a page found but not opened yet; "Read" is found and opened. The game pays 50,000 Kill Coins when you pick up the last page of a volume yourself; pages completed here don't trigger that, so for a volume you finish here <b>Send reward</b> puts it in the Reward Box instead (offered once, and only for volumes that weren't already complete).</div>`;
  for (const v of vols) {
    const done = v.pages.every(p => list[p.idx] > 0);
    const bonus = arr(AP && AP.magazineBonus).find(b => Number(b.stidx) === Number(v.pages[0].idx));
    const orig = magOrigList(), wasDone = v.pages.every(p => orig[p.idx] > 0), sent = MAG_SENT.keys.has(v.key);
    h += `<div class="toolbar" style="margin:12px 0 6px;"><b>${escapeHtml(magVolTitle(v))}</b><button class="subtle" data-mag-vol="${v.key}">Find all</button>${done && bonus && !wasDone && !sent ? `<button class="subtle" data-mag-bonus="${v.key}">Send reward (50,000 Kill Coins)</button>` : ''}${sent ? '<span class="id">reward sent</span>' : ''}<span class="count">${v.pages.filter(p => list[p.idx] > 0).length} / ${v.pages.length}${done ? ' ✓' : ''}</span></div>`;
    h += `<div class="grid" style="grid-template-columns: repeat(${Math.min(v.pages.length, 4)}, 1fr);">`;
    for (const p of v.pages) {
      const f = magFloor(p.flrid), st = list[p.idx] > 0 ? String(list[p.idx]) : '-1';
      h += `<div class="field"><label>Page ${p.page}${f ? ` <span class="id">${f}F</span>` : ''}</label><select data-mag-idx="${p.idx}" style="${sel}"><option value="-1" ${st === '-1' ? 'selected' : ''}>Not found</option><option value="1" ${st === '1' ? 'selected' : ''}>New</option><option value="2" ${st === '2' ? 'selected' : ''}>Read</option></select></div>`;
    }
    h += '</div>';
  }
  return h;
}
// Wire magazine controls inside `host`; `rerender` is called after each change. "Send reward" queues the
// volume's bonus into the Reward Box via addPresent and remembers it in MAG_SENT so it is offered once.
function magWire(host, rerender) {
  const setPages = (pages, v) => { const l = magList(); for (const p of pages) if (!(l[p.idx] > 0)) l[p.idx] = v; magWrite(l); };
  host.querySelectorAll('[data-mag-idx]').forEach(el => el.addEventListener('change', () => { const l = magList(); l[Number(el.dataset.magIdx)] = Number(el.value); magWrite(l); rerender(); }));
  host.querySelectorAll('[data-mag-vol]').forEach(el => el.addEventListener('click', () => { const v = magVolumes().find(x => x.key === el.dataset.magVol); if (v) { setPages(v.pages, 2); rerender(); toast(`${magVolTitle(v)}: every page found`); } }));
  const all = host.querySelector('#mag-all');
  if (all) all.addEventListener('click', () => { const l = magList(); for (const p of arr(AP.magazines)) l[p.idx] = 2; magWrite(l); rerender(); toast('Every magazine page found and read'); });
  host.querySelectorAll('[data-mag-bonus]').forEach(el => el.addEventListener('click', () => {
    const v = magVolumes().find(x => x.key === el.dataset.magBonus);
    const b = v && arr(AP.magazineBonus).find(x => Number(x.stidx) === Number(v.pages[0].idx));
    const rw = b && arr(AP.rewards).find(r => r.rwdid === b.rwdid);
    if (!rw) return;
    addPresent(rw.type, Number(rw.num) || 0, rw.val0 || '');
    MAG_SENT.keys.add(v.key);
    renderCollection();
    toast(`${magVolTitle(v)}: ${Number(rw.num).toLocaleString()} Kill Coins sent to the Reward Box`);
  }));
}
// Render the Collection tab: magazines, then the filterable Mushroom and Beast book tables
// (raw / grilled checkboxes, "Eat everything"). Mushroom/beast flags: bit 1 raw, bit 2 grilled.
function renderCollection() {
  const host = document.getElementById('coll-body');
  if (!host || !SAVE) return;
  const sel = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono); width:100%;';
  let h = magHtml();
  // books
  h += `<div class="toolbar" style="margin:16px 0 0;"><input type="text" id="coll-filter" placeholder="Filter mushrooms and beasts by name..." value="${escapeHtml(COLL_FORM.filter)}" style="flex:1; max-width:320px; ${sel}"></div>`;
  const filt = norm(COLL_FORM.filter || '');
  for (const [ kind, title ] of [ [ 'msr', 'Mushroom book' ], [ 'bst', 'Beast book' ] ]) {
    const rows = bookRows(kind);
    const done = rows.filter(r => r.flag != null && (r.flag & (1 | (r.grill ? 2 : 0))) === (1 | (r.grill ? 2 : 0))).length;
    const found = rows.filter(r => r.flag != null).length;
    h += `<div class="toolbar" style="margin:14px 0 6px;"><div class="eyebrow" style="margin:0;">${title}</div><button class="subtle" data-book-complete="${kind}">Eat everything (raw and grilled)</button><span class="count">${found} / ${rows.length} found · ${done} fully eaten</span></div>`;
    h += `<table class="stewTable"><thead><tr><th>${kind === 'msr' ? 'Mushroom' : 'Beast'}</th><th>In the book</th><th>Eaten raw</th><th>Eaten grilled</th></tr></thead><tbody>`;
    h += rows.filter(r => !filt || norm(r.name).includes(filt)).map(r => `<tr><td>${escapeHtml(r.name)} <span class="id">${r.id}</span></td><td>${r.flag == null ? 'not found' : 'found'}${r.flag != null && (r.flag & 4) ? ' <span class="id">(older record)</span>' : ''}</td>
      <td><input type="checkbox" data-book="${kind}" data-book-id="${r.id}" data-bit="1" ${r.flag != null && (r.flag & 1) ? 'checked' : ''}></td>
      <td>${r.grill ? `<input type="checkbox" data-book="${kind}" data-book-id="${r.id}" data-bit="2" ${r.flag != null && (r.flag & 2) ? 'checked' : ''}>` : '<span class="id">can\'t be grilled</span>'}</td></tr>`).join('');
    h += '</tbody></table>';
  }
  host.innerHTML = h;
  magWire(host, renderCollection);
  host.querySelectorAll('[data-book]').forEach(el => el.addEventListener('change', () => { bookSet(el.dataset.book, el.dataset.bookId, Number(el.dataset.bit), el.checked); renderCollection(); }));
  host.querySelectorAll('[data-book-complete]').forEach(el => el.addEventListener('click', () => { const n = bookComplete(el.dataset.bookComplete); renderCollection(); toast(n ? `${n} entr${n === 1 ? 'y' : 'ies'} completed` : 'Already complete'); }));
  const fi = document.getElementById('coll-filter');
  // keep focus and caret in the filter box across the re-render
  if (fi) fi.addEventListener('input', () => { COLL_FORM.filter = fi.value; const pos = fi.selectionStart; renderCollection(); const f2 = document.getElementById('coll-filter'); f2.focus(); f2.setSelectionRange(pos, pos); });
}
// Tab hook: render the Collection tab if active; the Armor Skins section renders every time.
function wireCollection() { if (activeTab === 'collection') renderCollection(); renderSkins(); }

// ---------------------------------------------------------------------------
// Stats (read only): the play log the game keeps (root.playlog: base, user, kill, died, fighter,
// fort, money, chara, famous). Nothing here is written back.
// ---------------------------------------------------------------------------
// ==== Stats tab (read only) ====
// Sections of root.playlog shown, as [key, title].
const STATS_SECTIONS = [ [ 'base', 'Overall' ], [ 'user', 'Combat' ], [ 'kill', 'Kills' ], [ 'died', 'Deaths' ], [ 'fighter', 'Fighters' ], [ 'fort', 'Tokyo Death Metro' ], [ 'money', 'Money' ], [ 'chara', 'Fighters sent out' ] ];
// Friendly labels for known playlog keys; unknown keys fall back to statsLabel() heuristics.
const STATS_LABELS = {
  total_play_time: 'Play time', max_floor: 'Deepest floor', move_floor_cnt: 'Floors moved', elevator_cnt: 'Elevator rides', escalator_cnt: 'Escalator rides', interruption: 'Times quit mid-run', move_dist: 'Distance moved',
  total_get_weapon_cnt: 'Weapons picked up', total_get_armor_cnt: 'Armor picked up', total_get_material_cnt: 'Materials picked up', total_research_cnt: 'Research done', total_skill_cnt: 'Decals obtained', exchange_skill_cnt: 'Decals exchanged',
  total_mushroom_cnt: 'Mushrooms eaten', total_mushroom_kind: 'Mushroom kinds eaten', total_throw_mushroom_cnt: 'Mushrooms thrown', total_baked_mushroom_cnt: 'Mushrooms grilled', bad_condition_cnt: 'Bad status effects',
  total_beast_cnt: 'Beasts eaten', total_beast_kind: 'Beast kinds eaten', total_throw_beast_cnt: 'Beasts thrown', total_baked_beast_cnt: 'Beasts grilled', total_purchase_cnt: 'Purchases', total_break_weapon_cnt: 'Weapons broken', total_break_armor_cnt: 'Armor broken',
  total_damage: 'Damage taken', total_give_damage: 'Damage dealt', attack_cnt: 'Attacks', hit_cnt: 'Hits taken', total_died_cnt: 'Deaths', total_enemy_cnt: 'Enemies killed',
  total_get_money: 'Kill Coins earned', total_use_money: 'Kill Coins spent', total_get_spirit: 'SPLithium earned', total_use_spirit: 'SPLithium spent'
};
// Label for a playlog key: known table, then killed_X_cnt / kill_X_cnt / use_X_cnt patterns, else a tidied key.
function statsLabel(k) {
  if (STATS_LABELS[k]) return STATS_LABELS[k];
  let m;
  if ((m = /^killed_(.+)_cnt$/.exec(k))) return 'Killed by ' + m[1].replace(/_/g, ' ');
  if ((m = /^kill_(.+)_cnt$/.exec(k))) return 'Killed ' + m[1].replace(/_/g, ' ');
  if ((m = /^use_(.+)_cnt$/.exec(k))) return 'Used ' + m[1].replace(/_/g, ' ');
  const t = k.replace(/_cnt$/, '').replace(/^total_/, '').replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// Format a playlog value: durations over an hour as "h m" (keys ending _time), numbers with separators, else raw text.
function statsValue(k, v) {
  if (k === 'total_play_time' || /_time$/.test(k)) { const n = Number(v) || 0; if (n > 3600) return `${Math.floor(n / 3600).toLocaleString()} h ${Math.floor(n % 3600 / 60)} m`; }
  if (v !== '' && !isNaN(Number(v)) && typeof v !== 'object') return Number(v).toLocaleString();
  return String(v);
}
