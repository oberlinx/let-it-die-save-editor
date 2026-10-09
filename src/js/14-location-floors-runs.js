// ==== Location: floor move / Heaven boss floors ====
// (design notes in the original comment block that follows)
// ---------------------------------------------------------------------------
// Location: move a fighter paused on a Heaven boss floor to another boss floor
// that uses the same map.
// Save: a mid-run quit keeps soul.pause (e.g. HEAVEN_PAUSE), soul.stgid/flrid/areaid/unitid and the
// exact position (pause_x/y/z, yaw). The run's floors live under root.floor: rlg.user (floors walked
// this run, last = current), rlg.archive (each generated floor's layout), pop.* spawns, dust,
// closed_area_flags, mboss (the boss waiting on the current floor); soul.hvntrinfo holds the boss
// floors' reward info and the fighter's bloodnium_result names the deepest floor of the run.
// Heaven routes (master_floor S_HVN): regular Heaven / TENGOKU = HVN_FLR_0001.. (51F-451F, boss map
// HVN_AREA_017 every 5 floors); NEO routes R00 D.O.D, R01 W.E, R02 C.W, R03 M.I.L.K = HVN_FLR_R0x_..
// (52F-140F; boss map A = HVN_AREA_001_R0x on 55,65..135F, boss map B = HVN_AREA_002_R0x on 60,70..140F).
// Only floors with the same map (same areaid) are offered, so the saved position still fits.
// The move is written at download: every reference to the current floor in soul and root.floor is
// renamed to the new floor, anything left there from an earlier visit to the new floor is dropped,
// and the waiting boss is set to the new floor's boss level. Records (clear_times, playlog) are kept.
// ---------------------------------------------------------------------------
// State of the pending floor move: chosen target floor id, whether to reroll boss-floor rewards, and the last computed rolls (flmRoll output).
let FLOOR_MOVE = { root: null, target: '', armed: false, msg: '', reroll: true, rolls: null };
// flmSync(): reset FLOOR_MOVE when a different save is loaded.
function flmSync() { if (FLOOR_MOVE.root !== RAW_SAV_ROOT) FLOOR_MOVE = { root: RAW_SAV_ROOT, target: '', armed: false, msg: '', reroll: true, rolls: null }; }
// Boss-floor rewards. The unopened treasure boxes on the floor (root.floor.trbox, contentid = an item with
// owner TRBOX) and the boss's own drop (floor.mboss.mbss[].eitemid) were rolled by the game for the
// floor you were on. master_floor_drop_gen gives, per floor / map / reference area / gen type, weighted
// groups (grp = master_item.grp); deeper floors weight the better items higher. A reroll draws each
// reward again from the NEW floor's table, the way the game rolls them.
// flmItemsOf(root): flat array of item instances from root.item.items (which may be an array or an object of arrays).
function flmItemsOf(root) {
  const it = root && root.item && root.item.items;
  return Array.isArray(it) ? it : it && typeof it === 'object' ? [].concat(...Object.values(it).filter(Array.isArray)) : [];
}
// flmRefArea(root, flrid): reference boss arena id for a floor, from soul.hvntrinfo or the floor archive; '-' if unknown.
function flmRefArea(root, flrid) {
  const h = arr(root && root.soul && root.soul.hvntrinfo).find(x => x && x.flrid === flrid);
  if (h && h.refareaid) return h.refareaid;
  const a = arr(root && root.floor && root.floor.rlg && root.floor.rlg.archive).find(x => x && x.flrid === flrid);
  return (a && a.ref_areaid) || '-';
}
// master_item grp -> items, built once per ITEM_INDEX
let FLM_GRP = { index: null, map: null };
// flmGroup(grp): items of a master_item group (cached map).
function flmGroup(grp) {
  if (FLM_GRP.index !== ITEM_INDEX) {
    const map = new Map();
    for (const i of Object.values(ITEM_INDEX)) { const g = Number(i.grp); if (!map.has(g)) map.set(g, []); map.get(g).push(i); }
    FLM_GRP = { index: ITEM_INDEX, map };
  }
  return FLM_GRP.map.get(Number(grp)) || [];
}
// flmDraw(flrid, areaid, refareaid, type): weighted random draw of an item id from master_floor_drop_gen for the
// floor/map/arena/gen-type (rows with refareaid '-' always match). Uses Math.random(), so each call can differ.
// Returns null when no table row applies.
function flmDraw(flrid, areaid, refareaid, type) {
  const rows = arr(AP && AP.hvnBossDrops).filter(r => r.flrid === flrid && r.areaid === areaid && r.type === type && (r.refareaid === refareaid || r.refareaid === '-'));
  const pool = [];
  for (const r of rows) {
    const items = flmGroup(r.grp);
    if (items.length) pool.push({ w: Number(r.freq) || 0, items });
  }
  const total = pool.reduce((n, p) => n + p.w, 0);
  if (!total) return null;
  let x = Math.random() * total;
  for (const p of pool) { if ((x -= p.w) < 0) return p.items[Math.floor(Math.random() * p.items.length)].itemId || p.items[0].itemid; }
  return pool[pool.length - 1].items[0].itemId;
}
// soul.hvntrinfo holds the boss floor you're on plus the next three boss floors of the route (what the
// map shows as upcoming rewards): {flrid, areaid, refareaid, rwdtype, rwdid (the featured reward),
// is_rare, rwds: [{gentype, rwdid}]}. The game only adds the next one as you climb, so after a move the
// whole block is shifted to the new floor and its next three boss floors (same route, same spacing, so
// maps A/B stay in step). Without this the map shows no upcoming rewards for a while, and boss floors
// with no entry fall back to Kill Coins in their chests.
// Which of a boss floor's planned rewards (soul.hvntrinfo rwds) never become chests (master_stage_trbox, BOSS_GOAL
// points, and game saves): a Screamer Pit places no large boxes (HVN_TB_TGT_0n_RUSH all 0; its TRBOX_L entries
// are placeholders); a mid-boss floor places two (_MBOSS 01 and 03 at 100, 02 at 0), holding the first two TRBOX_L
// rewards, so its third is never placed; a Don floor places all three (_BOSS 01-03 at 100: saves show the first
// two in 02/03 and the third in 01). Returns the unplaced rwds indexes.
// Material reward names (metals and Death 'Roids) in the colour they're named after (master_item rarity:
// 1 Blue, 2 Green, 3 Black, 4 Red, 5 Purple, 6 Orange, 7 Platinum, 8 44CE). The game's map calls every featured
// reward (hvntrinfo rwdid, the extra-large box) a "Legendary Chest" (MAP.TXT_LEGEND_TREASURE_INFO); is_rare ones
// come from the rare table and get a small neutral "rare" tag.
// Platinum (7) is shown orange like the Orange tier: the top Legendary Chest rewards in NEO are orange 'Roids and Platinum (user, 2026-10-05)
// Colour per master_item rarity tier (see comments above) used to tint metal / 'Roid names.
const RWD_TIER_COLOR = { 1: '#4ea3ef', 2: '#5cc46a', 3: '#a9b0b7', 4: '#e5534b', 5: '#b07cf0', 6: '#f28c28', 7: '#f28c28', 8: '#e6b422' };
// by the colour the material is named after (44CE Metal shares rarity 5 with Purple, so the name decides), else rarity
// Name-based tier overrides, first match wins (value = key into RWD_TIER_COLOR).
const RWD_NAME_COLOR = [ [ /\b44CE\b/, 8 ], [ /\bPlatinum\b/i, 7 ], [ /\bOrange\b/i, 6 ], [ /\bPurple\b/i, 5 ], [ /\bRed\b/i, 4 ], [ /\bBlack\b/i, 3 ], [ /\bGreen\b/i, 2 ], [ /\bBlue\b/i, 1 ] ];
// rwdTierColor(id): CSS colour for STONE/STEROID items, '' otherwise.
function rwdTierColor(id) {
  const r = ITEM_INDEX[id];
  if (!r || !/^ITMT_(STONE|STEROID)_/.test(id)) return '';
  const hit = RWD_NAME_COLOR.find(([ re ]) => re.test(r.name || ''));
  return RWD_TIER_COLOR[hit ? hit[1] : Number(r.rarity)] || '';
}
// rwdIsBlueprint(id): item is a blueprint (ITTP_RMAP).
function rwdIsBlueprint(id) { const r = ITEM_INDEX[id]; return !!r && r.itemtype === 'ITTP_RMAP'; }
// rwdNameHtml(id): escaped, coloured (or blueprint-styled) item name as HTML.
function rwdNameHtml(id) {
  const c = rwdTierColor(id), t = escapeHtml(itemDisplayName(id));
  if (rwdIsBlueprint(id)) return `<span class="rwdBp" title="${t}">${t.replace(/^Blueprint - /, '')}</span>`;
  return c ? `<span style="color:${c};">${t}</span>` : t;
}
// is_rare: the game shows that Legendary Chest's text in yellow on the map (user, 2026-10-05) and fills it from
// the rare table. The editor never changes an existing entry's is_rare; entries it creates (boss lock on floors the
// game hasn't planned yet, the go-back rewind's skipped map B floor) get is_rare at HVN_RARE_CHANCE, the share of
// rare entries in game saves (21 of 38), and their reward from the matching table.
// Probability that a newly written Legendary Chest entry is flagged rare.
const HVN_RARE_CHANCE = 0.55;
// legendTag(): HTML badge marking a rare Legendary Chest.
function legendTag() { return ' <span class="badge" style="border-color:#f2d33a; color:#f2d33a; font-size:10.5px; padding:1px 7px;" title="Rare Legendary Chest: yellow on the game\'s map, filled from the rare table">rare</span>'; }
// flmUnplaced(e): Set of indexes of hvntrinfo rwds that never become chests (see comment above): pit TRBOX_L, and mid-boss third TRBOX_L.
function flmUnplaced(e) {
  const rw = arr(e && e.rwds), out = new Set();
  const kind = blkKind(e && e.refareaid).kind;
  const pit = kind === 'pit' || rw.some(w => w && w.gentype === 'PTGENTP_TRZAKO');
  const mboss = !pit && kind !== 'boss' && (kind === 'mboss' || rw.some(w => w && /^PTGENTP_MBOSS/.test(w.gentype)));
  let n = 0;
  rw.forEach((w, i) => { if (w && w.gentype === 'PTGENTP_TRBOX_L' && (pit || (mboss && ++n > 2))) out.add(i); });
  return out;
}
// flmRouteBoss(id): boss floors (mbsmax > 0) of the same Heaven route as floor id, sorted by floor number.
function flmRouteBoss(id) {
  const key = hvnRoute(id).key;
  return arr(AP && AP.hvnFloors).filter(f => Number(f.mbsmax) > 0 && hvnRoute(f.id).key === key).sort((a, b) => a.no - b.no);
}
// The download root's soul is merged from SAVE.soul, so soul.hvntrinfo is still the loaded save's own array.
// Give the root its own copy before changing it, or every build (even a cancelled review) would change the
// loaded save and repeat the change on the next download.
// flmOwnHvn(root): replace root.soul.hvntrinfo with a deep copy so later edits do not leak into the loaded SAVE.
function flmOwnHvn(root) {
  const s = root && root.soul;
  if (s && s.hvntrinfo && typeof s.hvntrinfo === 'object') s.hvntrinfo = JSON.parse(JSON.stringify(s.hvntrinfo));
}
// Arenas the game can use on a boss floor (master_ref_boss_area_setting). Regular Heaven offers Dons and the
// RUSH6-10 pits only from 100F, the RUSH1-5 pits only below 100F; mid-bosses everywhere. A floor move shifts
// the planned boss floors by the same number of floors, so one can land where its arena never appears (a Don
// planned at 110F moved to 60F). Those are re-picked for their new floor: the same kind when that floor has
// it, otherwise a mid-boss (so a Don below 100F becomes a mid-boss), with rewards from the new floor's tables.
// flmAllowed(flrid): Set of boss arena ids the game may use on that floor.
function flmAllowed(flrid) { return new Set(arr(AP && AP.hvnBossAreas).filter(r => r.flrid === flrid).map(r => r.refareaid)); }
// flmCurRef(): boss arena id of the paused floor in the loaded save ('' if none).
function flmCurRef() {
  const s = RAW_SAV_ROOT && RAW_SAV_ROOT.soul;
  if (!s) return '';
  const h = arr(s.hvntrinfo).find(e => e && e.flrid === s.flrid);
  if (h && h.refareaid) return h.refareaid;
  const a = arr(RAW_SAV_ROOT.floor && RAW_SAV_ROOT.floor.rlg && RAW_SAV_ROOT.floor.rlg.archive).find(x => x && x.flrid === s.flrid);
  return (a && a.ref_areaid) || '';
}
// {newFlrid: {entry, from, to}} for planned floors whose arena can't appear on the floor they move to
function flmRefix(target) {
  const out = {};
  for (const u of flmUpcoming(target)) {
    const ok = flmAllowed(u.id), ref = u.entry && u.entry.refareaid;
    if (!ref || !ok.size || ok.has(ref)) continue;
    const rows = arr(AP && AP.hvnBossAreas).filter(r => r.flrid === u.id), k = blkKind(ref).kind;
    let pool = rows.filter(r => blkKind(r.refareaid).kind === k);
    if (!pool.length) pool = rows.filter(r => blkKind(r.refareaid).kind === 'mboss');
    if (!pool.length) pool = rows;
    const r = blkPick(pool), entry = r && blkEntry(u.floor, r.refareaid, Number(u.entry.is_rare) === 1);
    if (entry) out[u.id] = { entry, from: ref, to: r.refareaid };
  }
  return out;
}
// flmShiftHvn(root, from, to, refix): moves soul.hvntrinfo along with a floor move: every entry's floor is shifted by the
// same number of route boss slots (dropping entries pushed off the route), areaid is updated, and re-picked entries (refix) replace the old ones.
// Falls back to a plain rename if either floor is not on the route list.
function flmShiftHvn(root, from, to, refix) {
  const list = root && root.soul && root.soul.hvntrinfo;
  if (!Array.isArray(list)) return;
  const L = flmRouteBoss(from), iFrom = L.findIndex(f => f.id === from), iTo = L.findIndex(f => f.id === to);
  if (iFrom < 0 || iTo < 0) { flmRewrite(list, from, to, 0); return; }
  const d = iTo - iFrom;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i], j = e ? L.findIndex(f => f.id === e.flrid) : -1;
    if (j < 0) continue;
    const n = L[j + d];
    if (!n) { list.splice(i, 1); continue; }
    e.flrid = n.id;
    e.areaid = n.areaid;
    const fx = refix && refix[n.id];
    if (fx) Object.assign(e, JSON.parse(JSON.stringify(fx.entry)));
  }
}
// upcoming boss floors after a move: [{oldId, id, entry}] from the save as loaded
function flmUpcoming(target) {
  const root = RAW_SAV_ROOT, cur = root && root.soul;
  if (!cur) return [];
  const L = flmRouteBoss(cur.flrid), iFrom = L.findIndex(f => f.id === cur.flrid), iTo = L.findIndex(f => f.id === target);
  if (iFrom < 0 || iTo < 0) return [];
  const out = [];
  for (const e of arr(cur.hvntrinfo)) {
    const j = L.findIndex(f => f.id === e.flrid);
    if (j <= iFrom) continue;
    const n = L[j + iTo - iFrom];
    if (n) out.push({ oldId: e.flrid, id: n.id, floor: n, entry: e });
  }
  return out.sort((a, b) => a.floor.no - b.floor.no);
}
// flmRoll(target): computes (without writing) the rerolled rewards for a move to floor `target`:
//   { boxes: treasure boxes to change, boss: boss drop change, featured: Legendary Chest change,
//     upcoming: next boss floors' changes, refix: arena re-picks }
// Each change is {from, to} item ids; uses flmDraw so results are random. Returns null if there is no save/floor.
function flmRoll(target) {
  const root = RAW_SAV_ROOT, cur = root && root.soul, t = hvnFloor(target);
  if (!cur || !t) return null;
  const items = flmItemsOf(root), ref = flmSwapRef(target) || flmRefArea(root, cur.flrid);
  const out = { boxes: [], boss: null, featured: null, upcoming: [], refix: flmRefix(target) };
  const hCur = arr(cur.hvntrinfo).find(e => e && e.flrid === cur.flrid);
  if (hCur && hCur.rwdid) { const to = flmDraw(t.id, t.areaid, flmSwapRef(target) || hCur.refareaid || ref, Number(hCur.is_rare) ? 'PTGENTP_TRBOX_SPXL_RARE' : 'PTGENTP_SPXL'); if (to) out.featured = { from: hCur.rwdid, to }; }
  for (const u of flmUpcoming(target)) {
    const fx = out.refix[u.id];
    if (fx) {
      // re-picked for its new floor (flmRefix): shown as it will be written, not rerolled again
      const ne = fx.entry, unp = flmUnplaced(ne);
      out.upcoming.push({ id: u.id, no: u.floor.no, refix: fx, featured: ne.rwdid ? { from: u.entry.rwdid, to: ne.rwdid } : null, rare: Number(ne.is_rare) === 1, rwds: arr(ne.rwds).map((w, i) => ({ gentype: w.gentype, placeholder: unp.has(i), from: w.rwdid, to: w.rwdid })) });
      continue;
    }
    const e = u.entry, refA = e.refareaid || '-';
    // Treasure-enemy floors (the "rush" boss floors: TRZAKO entries) have no large boxes. The game still
    // lists three TRBOX_L placeholder entries (Death 'Roids Blue) for them, which never appear as chests,
    // so they're kept as they are and not shown.
    const unplaced = flmUnplaced(e);
    const rw = arr(e.rwds).map((w, i) => { const ph = unplaced.has(i); return { gentype: w.gentype, placeholder: ph, from: w.rwdid, to: ph ? w.rwdid : flmDraw(u.id, u.floor.areaid, refA, w.gentype) || w.rwdid }; });
    const fe = e.rwdid ? { from: e.rwdid, to: flmDraw(u.id, u.floor.areaid, refA, Number(e.is_rare) ? 'PTGENTP_TRBOX_SPXL_RARE' : 'PTGENTP_SPXL') || e.rwdid } : null;
    out.upcoming.push({ id: u.id, no: u.floor.no, featured: fe, rare: Number(e.is_rare) === 1, rwds: rw });
  }
  // Which table each box on the boss floor uses (as the game places them, see master_stage_trbox and
  // the floor's reward list): the extra-large box (TBTP_EXLARGE on the floor, TBTP_SPXL in the spawn
  // list, point HVN_TB_TGT_00) holds the featured reward (hvntrinfo.rwdid: the SPXL table, or the rare
  // SPXL table when is_rare); the large boxes (TBTP_LARGE) hold the TRBOX_L rewards. Anything else is
  // left as it is rather than drawn from a table it doesn't come from.
  const popType = {};
  const pt0 = root.floor && root.floor.pop && root.floor.pop.trbox;
  if (pt0 && typeof pt0 === 'object') for (const k of Object.keys(pt0)) if (k.startsWith(cur.flrid + '-')) for (const e of arr(pt0[k])) if (e && e.pntid) popType[e.pntid] = e.type;
  for (const b of arr(root.floor && root.floor.trbox)) {
    if (!b || b.rwdtype !== 'TBRWD_ITEM') continue;
    const inst = items.find(i => i.eid === b.contentid);
    if (!inst) continue;
    const isFeatured = b.type === 'TBTP_EXLARGE' || b.type === 'TBTP_SPXL' || popType[b.pntid] === 'TBTP_SPXL';
    if (isFeatured) {
      if (!out.featured) { const to = flmDraw(t.id, t.areaid, flmSwapRef(target) || (hCur && hCur.refareaid) || ref, hCur && Number(hCur.is_rare) ? 'PTGENTP_TRBOX_SPXL_RARE' : 'PTGENTP_SPXL'); if (to) out.featured = { from: (hCur && hCur.rwdid) || inst.itemid, to }; }
      if (out.featured) out.boxes.push({ eid: b.contentid, pntid: b.pntid, from: inst.itemid, to: out.featured.to, gentype: 'featured' });
    } else if (b.type === 'TBTP_LARGE') {
      const to = flmDraw(t.id, t.areaid, ref, 'PTGENTP_TRBOX_L');
      if (to) out.boxes.push({ eid: b.contentid, pntid: b.pntid, from: inst.itemid, to, gentype: 'PTGENTP_TRBOX_L' });
    }
  }
  // treasure enemies (ZAKO_TREASURE, on the boss floors that have no large boxes): each carries a chest
  // (floor.zako.trbox, contentid = an item owned by ZAKO) drawn from the TRZAKO table, plus Kill Coins the
  // game rolled (left as they are)
  for (const zb of arr(root.floor && root.floor.zako && root.floor.zako.trbox)) {
    if (!zb || zb.rwdtype !== 'TBRWD_ITEM') continue;
    const inst = items.find(i => i.eid === zb.contentid);
    const to = inst && flmDraw(t.id, t.areaid, '-', 'PTGENTP_TRZAKO');
    if (to) out.boxes.push({ eid: zb.contentid, pntid: 'treasure enemy', from: inst.itemid, to, gentype: 'PTGENTP_TRZAKO' });
  }
  for (const m of arr(root.floor && root.floor.mboss && root.floor.mboss.mbss)) {
    if (!m || !m.eitemid) continue;
    const inst = items.find(i => i.eid === m.eitemid);
    const to = inst && flmDraw(t.id, t.areaid, '-', 'PTGENTP_' + m.type);
    if (to) out.boss = { eid: m.eitemid, from: inst.itemid, to, gentype: 'PTGENTP_' + m.type };
  }
  return out;
}
// ---- Spoiler toggle for the Location tab ----
// one upcoming floor's rewards as the map / floor has them: treasure enemies, large boxes, boss drop
// Spoilers: the Location tab only names the rolled rewards (boxes, boss drops, the map's upcoming rewards)
// when "Show rewards (spoilers)" is ticked; otherwise it shows how many there are and of what kind. The choice
// is remembered in this browser.
// Whether reward names are shown; persisted in localStorage (try/catch since storage may be blocked).
let LOC_SPOIL = false;
try { LOC_SPOIL = localStorage.getItem('lid.locationSpoilers') === '1'; } catch (err) {}
// locSetSpoil(on): set and persist the spoiler toggle.
function locSetSpoil(on) { LOC_SPOIL = !!on; try { localStorage.setItem('lid.locationSpoilers', on ? '1' : '0'); } catch (err) {} }
// flmUpText(rwds, nm): summary HTML of a floor's rewards (counts, plus names when spoilers are on). nm formats a name.
function flmUpText(rwds, nm) {
  const g = t => rwds.filter(w => !w.placeholder && w.gentype === t).map(w => nm(w.to));
  const parts = [], names = xs => LOC_SPOIL ? `: ${xs.join(', ')}` : '';
  const z = g('PTGENTP_TRZAKO'), l = g('PTGENTP_TRBOX_L');
  if (z.length) parts.push(`${z.length} treasure enem${z.length === 1 ? 'y' : 'ies'}${names(z)}`);
  if (l.length) parts.push(`${l.length} large box${l.length === 1 ? '' : 'es'}${names(l)}`);
  const b = rwds.filter(w => !w.placeholder && /^PTGENTP_MBOSS/.test(w.gentype)).map(w => nm(w.to));
  if (b.length) parts.push(`boss drop${LOC_SPOIL ? ': ' + b.join(', ') : ''}`);
  return parts.length ? `<span class="id">· ${parts.join(' · ')}</span>` : '';
}
// flmApplyRolls(root, from, to): writes flmRoll results into the download root: swaps item ids on the box/boss item instances
// (matched by eid), the floor's spawn list, and the hvntrinfo reward ids for the current and upcoming boss floors. No-op if reroll is off.
function flmApplyRolls(root, from, to) {
  const r = FLOOR_MOVE.reroll && FLOOR_MOVE.rolls;
  if (!r) return;
  const items = flmItemsOf(root);
  const swaps = r.boxes.concat(r.boss ? [ r.boss ] : []);
  for (const s of swaps) { const inst = items.find(i => i.eid === s.eid); if (inst) inst.itemid = s.to; }
  // the floor's spawn list names the box contents by item id
  const pt = root.floor && root.floor.pop && root.floor.pop.trbox;
  if (pt && typeof pt === 'object') for (const k of Object.keys(pt)) if (k.startsWith(to + '-')) for (const e of arr(pt[k])) { const s = r.boxes.find(b => b.pntid === e.pntid); if (s && e.contentid === s.from) e.contentid = s.to; }
  // the boss floor's reward list (already renamed to the new floor)
  const h = arr(root.soul && root.soul.hvntrinfo).find(x => x && x.flrid === to);
  if (h && r.featured && h.rwdid === r.featured.from) h.rwdid = r.featured.to;
  // the next boss floors (already shifted): featured reward and box / boss rewards
  for (const u of arr(r.upcoming)) {
    const e = arr(root.soul && root.soul.hvntrinfo).find(x => x && x.flrid === u.id);
    if (!e) continue;
    if (u.featured && e.rwdid === u.featured.from) e.rwdid = u.featured.to;
    arr(e.rwds).forEach((w, i) => { const n = u.rwds[i]; if (n && w && w.rwdid === n.from && w.gentype === n.gentype) w.rwdid = n.to; });
  }
  if (h) {
    // each large box / the boss drop matches one entry of its own gen type (the featured box is rwdid)
    const used = new Set();
    for (const s of swaps) {
      if (s.gentype === 'featured') continue;
      const i = arr(h.rwds).findIndex((w, n) => !used.has(n) && w && w.gentype === s.gentype && w.rwdid === s.from);
      if (i >= 0) { used.add(i); h.rwds[i].rwdid = s.to; }
    }
  }
}
// ==== Heaven floor/route helpers ====
// hvnFloor(id): master floor record from AP.hvnFloors, or null.
function hvnFloor(id) { return arr(AP && AP.hvnFloors).find(f => f.id === id) || null; }
// hvnRoute(id): {key, name} - 'main' for regular Heaven, or R00..R03 for NEO routes (name from MOVE_MESSAGE text).
function hvnRoute(id) {
  const m = /^HVN_FLR_(R0\d)_/.exec(String(id || ''));
  if (!m) return { key: 'main', name: 'Regular Heaven (TENGOKU)' };
  const neo = resolveName('MOVE_MESSAGE.TXT_MOVE_NEO_' + m[1]);
  return { key: m[1], name: neo && neo !== 'MOVE_MESSAGE.TXT_MOVE_NEO_' + m[1] ? neo.replace(/\s*area$/i, '') : 'NEO ' + m[1] };
}
// hvnMapLabel(areaid): 'boss map A' / 'boss map B' / 'boss floor' for known Heaven boss maps, else ''.
function hvnMapLabel(areaid) {
  if (/^HVN_AREA_001_R0\d$/.test(areaid)) return 'boss map A';
  if (/^HVN_AREA_002_R0\d$/.test(areaid)) return 'boss map B';
  if (areaid === 'HVN_AREA_017') return 'boss floor';
  return '';
}
// hvnFloorLabel(f): display string 'Route · NF · map'.
function hvnFloorLabel(f) {
  if (!f) return '?';
  const r = hvnRoute(f.id), map = hvnMapLabel(f.areaid);
  return `${r.name} · ${f.no}F${map ? ' · ' + map : ''}`;
}
// flmCurrent(): the paused position fields of the loaded save {pause, stgid, flrid, areaid}, or null.
function flmCurrent() {
  const s = RAW_SAV_ROOT && RAW_SAV_ROOT.soul;
  if (!s) return null;
  return { pause: s.pause || '', stgid: s.stgid || '', flrid: s.flrid || '', areaid: s.areaid || '' };
}
// Screamer Pit twins (EXPERIMENTAL). Regular Heaven uses the RUSH1-5 pits (HVN_AREA_011-015) only below 100F and
// RUSH6-10 (HVN_AREA_018-022) only from 100F. In every save seen, a pit and its twin five numbers apart are built
// the same way: same units (BOSS_START / BOSS / BOSS_GOAL), the same 5 ZAKO + 50 ZMB spawn points (named
// HVN_R<nn>_...), the same goal points and the same map layout; only the arena id, the KIS (enemy set) and the
// point-name number differ. So a built pit can be moved past the 95F / 100F line by turning it into its twin.
// flmPitNo(ref): Screamer Pit number (1-10) of an arena id, or 0 if not a pit.
function flmPitNo(ref) { const k = blkKind(ref); return k.kind === 'pit' ? Number(k.n) : 0; }
// flmPitRef(n): arena id whose KIS is RUSH<n>, or ''.
function flmPitRef(n) { const r = arr(AP && AP.hvnBossKis).find(x => new RegExp('_KIS_RUSH' + n + '$').test(x.kis || '')); return r ? r.areaid : ''; }
// flmPitTwin(ref): the pit arena five numbers apart (1-5 <-> 6-10), or ''.
function flmPitTwin(ref) { const n = flmPitNo(ref); return !n ? '' : flmPitRef(n <= 5 ? n + 5 : n - 5); }
// flmSwapRef(target): returns the twin arena to convert to, or '' when no conversion is needed/possible.
// the arena the paused floor needs on `target`: '' = keep its own, else the pit twin it's turned into
function flmSwapRef(target) {
  const ref = flmCurRef(), ok = flmAllowed(target), twin = flmPitTwin(ref);
  if (!ref || !ok.size || ok.has(ref) || !twin || !ok.has(twin)) return '';
  return twin;
}
// flmPitConvert(root, to, fromRef, toRef): rewrite the built pit on floor `to` into its twin: hvntrinfo/archive arena ids,
// the units string (KIS id and HVN_Rnn_ point names), closed_area_flags keys, and spawn-point pntid values in floor / zombie data.
// turn the built pit on floor `to` (already renamed from the old floor) from arena `fromRef` into `toRef`
function flmPitConvert(root, to, fromRef, toRef) {
  const a = flmPitNo(fromRef), b = flmPitNo(toRef);
  if (!a || !b || !root) return;
  const pa = 'HVN_R' + String(a).padStart(2, '0') + '_', pb = 'HVN_R' + String(b).padStart(2, '0') + '_';
  const fl = root.floor || {};
  const h = arr(root.soul && root.soul.hvntrinfo).find(e => e && e.flrid === to);
  // (its TRBOX_L placeholders come from the same one-item table for every pit, so they stay as they are)
  if (h && h.refareaid === fromRef) h.refareaid = toRef;
  for (const e of arr(fl.rlg && fl.rlg.archive)) {
    if (!e || e.flrid !== to) continue;
    if (e.ref_areaid === fromRef) e.ref_areaid = toRef;
    if (typeof e.units === 'string') e.units = e.units.split('KIS_RUSH' + a + '"').join('KIS_RUSH' + b + '"').split(pa).join(pb);
  }
  const cf = fl.closed_area_flags;
  if (cf && typeof cf === 'object') for (const k of Object.keys(cf)) if (k.startsWith(to + '_') && k.endsWith('_' + fromRef)) { cf[k.slice(0, -fromRef.length) + toRef] = cf[k]; delete cf[k]; }
  // spawn points of the enemies on the floor (floor.zako.flrzks, floor.pop.xzk / xzmb, zombie.flrzmbs):
  // only entries for this floor (or with no floor id) are renamed
  const walk = (n, d) => {
    if (!n || typeof n !== 'object' || d > 8) return;
    if (!Array.isArray(n) && n.flrid && n.flrid !== to) return;
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (k === 'pntid' && typeof v === 'string' && v.startsWith(pa)) n[k] = pb + v.slice(pa.length);
      else if (v && typeof v === 'object' && k !== 'rlg' && k !== 'closed_area_flags') walk(v, d + 1);
    }
  };
  walk(fl, 0);
  walk(root.zombie, 0);
}
// flmTargets(): candidate target floors for the Location move: same route, same boss map (areaid), different floor, arena fits.
// Returns [] unless the fighter is paused in Heaven (S_HVN) on a boss floor.
function flmTargets() {
  const cur = flmCurrent();
  if (!cur || !cur.pause || cur.stgid !== 'S_HVN') return [];
  const f = hvnFloor(cur.flrid);
  if (!f || !(Number(f.mbsmax) > 0)) return [];
  const route = hvnRoute(f.id).key, ref = flmCurRef(), twin = flmPitTwin(ref);
  // the floor you're on is already built with its arena (e.g. a Don), so only floors that arena can appear on
  // (a Screamer Pit also goes where its twin can appear, see flmPitTwin)
  const fits = x => { const ok = flmAllowed(x.id); return !ref || !ok.size || ok.has(ref) || (!!twin && ok.has(twin)); };
  return arr(AP && AP.hvnFloors).filter(x => x.areaid === f.areaid && x.id !== f.id && hvnRoute(x.id).key === route && fits(x)).sort((a, b) => a.no - b.no);
}
// rename every reference to floor `from` under node to `to` (object flrid values, keys like
// "<flrid>-<areaid>" or "<flrid>_<areaid>..."); drop array items / keys that already refer to `to`
// flmRewrite(node, from, to, depth): recursive in-place rename of floor id `from` to `to` in a JSON subtree (flrid values and
// "<id>-..." / "<id>_..." keys). Items and keys that already refer to `to` are deleted first so the old visit is discarded. Depth-limited.
function flmRewrite(node, from, to, depth) {
  if (!node || typeof node !== 'object' || depth > 10) return;
  const keyIs = (k, id) => k === id || k.startsWith(id + '-') || k.startsWith(id + '_');
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) { const v = node[i]; if (v && typeof v === 'object' && !Array.isArray(v) && v.flrid === to) node.splice(i, 1); }
    for (const v of node) flmRewrite(v, from, to, depth + 1);
    return;
  }
  for (const k of Object.keys(node)) if (keyIs(k, to)) delete node[k];
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (k === 'flrid' && v === from) node[k] = to;
    else if (v && typeof v === 'object') flmRewrite(v, from, to, depth + 1);
    if (keyIs(k, from)) { node[to + k.slice(from.length)] = node[k]; delete node[k]; }
  }
}
// applyFloorMove(root): download-pipeline step. Applies the pending move: sets soul.flrid, shifts hvntrinfo, renames floor
// ids under root.floor (the Stamp Rally is held aside because it has no floor ids), sets mid-boss level, applies rerolls, converts pit twin,
// and renames the floor in the fighters' bloodnium_result. Returns root.
function applyFloorMove(root) {
  if (FLOOR_MOVE.root !== RAW_SAV_ROOT || !FLOOR_MOVE.target || !root || !root.soul) return root;
  const from = root.soul.flrid, to = FLOOR_MOVE.target;
  const f = hvnFloor(to);
  if (!from || !f || from === to) return root;
  root.soul.flrid = to;
  // order matters: hvntrinfo is copied (flmOwnHvn) and shifted before floor data is renamed
  flmOwnHvn(root);
  flmShiftHvn(root, from, to, FLOOR_MOVE.rolls && FLOOR_MOVE.rolls.refix);
  if (root.floor) {
    const stamp = root.floor.stamp;
    delete root.floor.stamp;           // the Stamp Rally has no floor ids; keep it out of the rewrite
    flmRewrite(root.floor, from, to, 0);
    if (stamp !== undefined) root.floor.stamp = stamp;
    const lvl = Number(f.mbslvlmin) || 0;
    if (lvl && root.floor.mboss && Array.isArray(root.floor.mboss.mbss)) for (const m of root.floor.mboss.mbss) if (m && m.lvl != null) m.lvl = lvl;
  }
  flmApplyRolls(root, from, to);
  const swap = flmSwapRef(to);
  if (swap) flmPitConvert(root, to, flmCurRef(), swap);
  // the fighter's run summary names the deepest floor of this run
  const chrs = root.soul.chr && root.soul.chr.chrs;
  for (const list of chrs && typeof chrs === 'object' ? Object.values(chrs) : []) for (const c of arr(list)) {
    if (c && typeof c.bloodnium_result === 'string' && c.bloodnium_result.includes('"' + from + '"')) c.bloodnium_result = c.bloodnium_result.split('"' + from + '"').join('"' + to + '"');
  }
  return root;
}
// ---------------------------------------------------------------------------
// ==== Boss floor lock ====
// Boss floor lock: make the run's upcoming Heaven boss floors all Dons, all mid-bosses, all Screamer Pits, or
// Dons and mid-bosses. Confirmed in game for a whole run: on a D.O.D. run locked at 52F, the game built 75F and
// 85F from the entries the editor added (not in the game's own plan) and kept every later entry unchanged.
// Each boss floor rolls an arena (refareaid) from master_ref_boss_area_setting (flrid, refareaid, freq).
// master_area_setting_unit (unit HEAVEN_BOSS) says what the arena holds: KIS_BOSS1-4 = main boss
// (HVN_AREA_003-006), KIS_MBOSS1-4 = mid-boss (007-010), KIS_RUSH1-10 = Screamer Pit (011-015, 018-022).
// The NEO routes' map B floors have one fixed arena (ARC/MET/AMS/RFT_AREA_HVN) and are never either.
// The roll is kept in soul.hvntrinfo (the floor you're on plus the next three boss floors) with the
// rewards drawn for that arena. As seen in saves: mid-boss = [MBOSSn drop, 3x TRBOX_L]; pit = [3x TRZAKO,
// 3x TRBOX_L placeholders from the pit's one-item table]; map B = [3x TRBOX_L]; main boss = [3x TRBOX_L]
// (no boss drop; seen in a save paused on regular Heaven 105F with BOSS1 / BOSS4 floors planned).
// A lock redraws each upcoming entry that isn't already of the chosen kind (not the floor you're on: it's
// already built) from the arenas of that kind, with the game's weights. It can also write entries for
// every remaining boss floor of the route, which the game keeps for the whole run.
// hvntrinfo is emptied between runs, so this only works on a save paused mid-run.
// ---------------------------------------------------------------------------
// rewards, for the floors the lock writes:
//   'roll'  = Legendary Chest, large boxes and boss drop all drawn now from the game's tables (confirmed in game)
//   'chest' = only the Legendary Chest drawn now (rwds left empty): the game rolls the large boxes and boss drop itself
//             (confirmed in game 2026-10-05: 55F had the written Legendary Chest and the mid-boss dropped a reward)
//   'hidden'= spoiler free: written like 'chest', and the editor never shows any reward of the locked run (not even
//             with "Show rewards (spoilers)" ticked, and not the rare flag)
//   'none'  = arena only (rwdid '' and rwds []). Tested in game 2026-10-05 (55F mid-boss): the two large boxes spawned
//             with rewards and the mid-boss dropped one (the game rolled them), but there was NO Legendary Chest:
//             the game doesn't roll that one itself.
// which: '' = any boss of the mode's kinds, or one boss: 'boss:1'..'boss:4' (Dons) / 'mboss:1'..'mboss:4' (mid-bosses)
// State of the boss-floor lock UI: mode ('' = off, a BLK_MODES key), which (specific boss), extend (write all remaining floors), rewards policy, cached plan.
let BOSS_LOCK = { root: null, mode: '', which: '', extend: true, rewards: 'roll', plan: null };
// blkSync(): reset BOSS_LOCK when a different save is loaded.
function blkSync() { if (BOSS_LOCK.root !== RAW_SAV_ROOT) BOSS_LOCK = { root: RAW_SAV_ROOT, mode: '', which: '', extend: true, rewards: 'roll', plan: null }; }
// blkWhichOptions(mode): list of {v, label} single-boss choices for a mode.
// the boss choices a lock mode offers
function blkWhichOptions(mode) {
  const m = BLK_MODES[mode];
  if (!m) return [];
  const out = [];
  for (const kind of [ 'boss', 'mboss' ]) if (m.kinds.includes(kind)) for (const n of [ 1, 2, 3, 4 ]) out.push({ v: kind + ':' + n, label: (kind === 'boss' ? 'Don ' : 'Mid-boss ') + BLK_BOSS_NAMES[kind][n] });
  return out;
}
// BLK_MODES: lock modes - which arena kinds count (kinds), optional fallback kinds, UI label and noun.
// don: the four main bosses (KIS_BOSS1-4). Regular Heaven offers no Don below 100F, so those floors fall back
// to a mid-boss (the nearest kind) rather than whatever the game would roll.
const BLK_MODES = {
  don: { kinds: [ 'boss' ], fallback: [ 'mboss' ], label: 'Don only (main bosses)', noun: 'Don' },
  mboss: { kinds: [ 'mboss' ], label: 'Mid-boss only', noun: 'mid-boss' },
  pit: { kinds: [ 'pit' ], label: 'Screamer Pit only', noun: 'Screamer Pit' },
  boss: { kinds: [ 'boss', 'mboss' ], label: 'Don or mid-boss (no Screamer Pits)', noun: 'Don or mid-boss' }
};
// Who each Heaven boss arena holds: master_stage_mboss puts MBOSS1-4 at the mid-boss points and STAGE_BOSS1-4 (their
// boss-enhanced versions) at the Don points; master_mboss names them by type (hearing / sight / predation / U10), and
// the game's quest text names them in that order: "the 3 Shock Terrors COEN, JIN-DIE, and GOTO-9, along with U-10" and
// "COEN Mk-2, JIN-DIE Mk-2, GOTO-9 Mk-2, and U10 Mk-2".
// One-boss lock confirmed in game (user, 2026-10-07).
// Display names of the four bosses per kind (mid-boss vs. Mk-2 Don).
const BLK_BOSS_NAMES = { mboss: { 1: 'COEN', 2: 'JIN-DIE', 3: 'GOTO-9', 4: 'U-10' }, boss: { 1: 'COEN Mk-2', 2: 'JIN-DIE Mk-2', 3: 'GOTO-9 Mk-2', 4: 'U10 Mk-2' } };
// blkKind(refareaid): classify a boss arena by its KIS name -> {kind: mboss|boss|pit|fixed, n, label}.
function blkKind(refareaid) {
  const k = (arr(AP && AP.hvnBossKis).find(r => r.areaid === refareaid) || {}).kis || '';
  let m;
  if ((m = /_KIS_MBOSS(\d+)$/.exec(k))) return { kind: 'mboss', n: m[1], label: `Mid-boss ${BLK_BOSS_NAMES.mboss[m[1]] || ''} (MBOSS${m[1]})`.replace('  ', ' ') };
  if ((m = /_KIS_BOSS(\d+)$/.exec(k))) return { kind: 'boss', n: m[1], label: `Don ${BLK_BOSS_NAMES.boss[m[1]] || ''} (BOSS${m[1]})`.replace('  ', ' ') };
  if ((m = /_KIS_RUSH(\d+)$/.exec(k))) return { kind: 'pit', n: m[1], label: 'Screamer Pit' };
  return { kind: 'fixed', n: '', label: 'Fixed arena' };
}
// blkPick(rows): weighted random pick by freq; first row if all weights are 0; null for empty.
function blkPick(rows) {
  const total = rows.reduce((n, r) => n + (Number(r.freq) || 0), 0);
  if (!total) return rows.length ? rows[0] : null;
  let x = Math.random() * total;
  for (const r of rows) if ((x -= Number(r.freq) || 0) < 0) return r;
  return rows[rows.length - 1];
}
// blkDraw(floor, refareaid, type): draw a reward from the arena's own table, else the floor's general table.
// a floor's own table for the arena when it has one (a pit's TRBOX_L is its one placeholder item),
// otherwise the floor's general ('-') table
function blkDraw(floor, refareaid, type) {
  const own = arr(AP && AP.hvnBossDrops).some(r => r.flrid === floor.id && r.areaid === floor.areaid && r.type === type && r.refareaid === refareaid);
  return own ? flmDraw(floor.id, floor.areaid, refareaid, type) : flmDraw(floor.id, floor.areaid, '-', type);
}
// blkEntry(floor, refareaid, isRare, rewards): builds a new soul.hvntrinfo entry for a boss floor. Reward policy 'none' / 'chest' /
// 'hidden' leaves rwds empty (with a Legendary Chest rwdid except for 'none'); otherwise draws boss drop (mid-boss), 3 treasure-enemy
// rewards (pit) and 3 large-box rewards. Returns null if a draw fails.
function blkEntry(floor, refareaid, isRare, rewards) {
  if (rewards === 'none' || rewards === 'chest' || rewards === 'hidden') {
    const rwdid = rewards !== 'none' ? blkDraw(floor, refareaid, isRare ? 'PTGENTP_TRBOX_SPXL_RARE' : 'PTGENTP_SPXL') : '';
    if (rewards !== 'none' && !rwdid) return null;
    return { flrid: floor.id, areaid: floor.areaid, refareaid, rwdtype: 'TBRWD_ITEM', rwdid, is_rare: isRare ? 1 : 0, created: 0, rwds: [] };
  }
  const k = blkKind(refareaid), rw = (gentype, ref) => ({ gentype, rwdtype: 'TBRWD_ITEM', rwdid: blkDraw(floor, ref, gentype) });
  const rwds = [];
  if (k.kind === 'mboss') rwds.push(rw('PTGENTP_MBOSS' + k.n, '-'));
  if (k.kind === 'pit') for (let i = 0; i < 3; i++) rwds.push(rw('PTGENTP_TRZAKO', '-'));
  for (let i = 0; i < 3; i++) rwds.push(rw('PTGENTP_TRBOX_L', refareaid));
  const rwdid = blkDraw(floor, refareaid, isRare ? 'PTGENTP_TRBOX_SPXL_RARE' : 'PTGENTP_SPXL');
  if (!rwdid || rwds.some(w => !w.rwdid)) return null;
  return { flrid: floor.id, areaid: floor.areaid, refareaid, rwdtype: 'TBRWD_ITEM', rwdid, is_rare: isRare ? 1 : 0, created: 0, rwds };
}
// blkFrom(): floor id the lock plans from (pending floor move target, else the current floor).
// the floor the fighter will be on at download (a pending floor move counts) and its upcoming entries
function blkFrom() {
  const s = RAW_SAV_ROOT && RAW_SAV_ROOT.soul;
  return (FLOOR_MOVE.root === RAW_SAV_ROOT && FLOOR_MOVE.target) || (s && s.flrid) || '';
}
// blkExisting(from): Map flrid -> hvntrinfo entry that will exist for planning (accounts for a pending floor move's shifts/rerolls).
function blkExisting(from) {
  const s = RAW_SAV_ROOT && RAW_SAV_ROOT.soul;
  if (!s) return new Map();
  if (from !== s.flrid) {
    // the planned floors as the move writes them: shifted, re-picked (refix) or with their rerolled rewards
    const r = FLOOR_MOVE.rolls || {}, fx = r.refix || {};
    return new Map(flmUpcoming(from).map(u => {
      if (fx[u.id]) return [ u.id, fx[u.id].entry ];
      const ru = FLOOR_MOVE.reroll && arr(r.upcoming).find(x => x.id === u.id);
      if (!ru) return [ u.id, u.entry ];
      const e = JSON.parse(JSON.stringify(u.entry));
      if (ru.featured && e.rwdid === ru.featured.from) e.rwdid = ru.featured.to;
      arr(e.rwds).forEach((w, i) => { const n = ru.rwds[i]; if (n && w && w.rwdid === n.from && w.gentype === n.gentype) w.rwdid = n.to; });
      return [ u.id, e ];
    }));
  }
  return new Map(arr(s.hvntrinfo).filter(e => e && e.flrid).map(e => [ e.flrid, e ]));
}
// blkPlan(): builds the lock plan - for each remaining route boss floor after the current one, keep the existing entry if already of
// the chosen kind (or the chosen single boss), otherwise pick a new arena (with fallbacks) and create an entry. Returns {from, mode, which, extend, rewards, items[]} or null.
function blkPlan() {
  const from = blkFrom(), cur = hvnFloor(from), mode = BLK_MODES[BOSS_LOCK.mode];
  if (!cur || !mode) return null;
  const have = blkExisting(from), items = [];
  for (const f of flmRouteBoss(from).filter(x => x.no > cur.no)) {
    const old = have.get(f.id) || null;
    const rows = arr(AP && AP.hvnBossAreas).filter(r => r.flrid === f.id);
    if (!rows.length) continue;
    let want = rows.filter(r => mode.kinds.includes(blkKind(r.refareaid).kind)), kinds = mode.kinds, fallback = false;
    if (!want.length && mode.fallback) {
      const fb = rows.filter(r => mode.fallback.includes(blkKind(r.refareaid).kind));
      if (fb.length) { want = fb; kinds = mode.fallback; fallback = true; }
    }
    // one boss picked: that boss's arena where the floor offers it; otherwise the same boss's other version (a Don
    // below 100F becomes its mid-boss), otherwise any arena of the mode
    let one = false;
    const W = BOSS_LOCK.which && BOSS_LOCK.which.split(':');
    if (W && BLK_MODES[BOSS_LOCK.mode] && blkWhichOptions(BOSS_LOCK.mode).some(o => o.v === BOSS_LOCK.which)) {
      const exact = rows.filter(r => { const k = blkKind(r.refareaid); return k.kind === W[0] && k.n === W[1]; });
      const twin = rows.filter(r => { const k = blkKind(r.refareaid); return k.kind !== W[0] && (k.kind === 'boss' || k.kind === 'mboss') && k.n === W[1]; });
      if (exact.length) { want = exact; fallback = false; one = true; }
      else if (twin.length) { want = twin; fallback = true; one = true; }
      else fallback = true; // this floor never has that boss (NEO routes only have their own): any of the mode
    }
    // keep the planned entry if it already satisfies the lock; floors the game hasn't planned are only written when 'extend' is on
    const oldK = old && blkKind(old.refareaid);
    const keep = old && (!want.length || (one ? want.some(r => r.refareaid === old.refareaid) : kinds.includes(oldK.kind)));
    if (keep) { items.push({ floor: f, old, entry: null, fallback }); continue; }
    if (!old && !BOSS_LOCK.extend) continue;
    const r = blkPick(want.length ? want : rows);
    // a floor the game hasn't planned yet gets a rare (yellow on the map) Legendary Chest as often as the game gives one
    items.push({ floor: f, old, entry: r && blkEntry(f, r.refareaid, old ? Number(old.is_rare) === 1 : Math.random() < HVN_RARE_CHANCE, BOSS_LOCK.rewards), fallback });
  }
  return { from, mode: BOSS_LOCK.mode, which: BOSS_LOCK.which, extend: BOSS_LOCK.extend, rewards: BOSS_LOCK.rewards, items };
}
// blkPlanFresh(): returns the cached BOSS_LOCK.plan, rebuilding it when its inputs (floor, mode, options, floor-move rolls) changed.
function blkPlanFresh() {
  const p = BOSS_LOCK.plan;
  if (!BOSS_LOCK.mode) return null;
  const mv = blkFrom() !== (RAW_SAV_ROOT && RAW_SAV_ROOT.soul && RAW_SAV_ROOT.soul.flrid);
  // a floor move's rolls (its re-picked floors and rerolled rewards) are what the lock starts from, so a new roll means a new plan
  const rolls = mv ? FLOOR_MOVE.rolls : null, reroll = mv ? FLOOR_MOVE.reroll : null;
  if (!p || p.from !== blkFrom() || p.mode !== BOSS_LOCK.mode || p.which !== BOSS_LOCK.which || p.extend !== BOSS_LOCK.extend || p.rewards !== BOSS_LOCK.rewards || p.rolls !== rolls || p.reroll !== reroll) { const np = blkPlan(); BOSS_LOCK.plan = np && Object.assign(np, { rolls, reroll }); }
  return BOSS_LOCK.plan;
}
// applyBossLock(root): download-pipeline step. Writes the planned entries into root.soul.hvntrinfo (replacing or, when extend is on, appending). Returns root.
function applyBossLock(root) {
  if (BOSS_LOCK.root !== RAW_SAV_ROOT || !BOSS_LOCK.mode || !root || !root.soul) return root;
  const p = blkPlanFresh();
  if (!p || p.from !== root.soul.flrid) return root;
  flmOwnHvn(root);
  if (!Array.isArray(root.soul.hvntrinfo)) root.soul.hvntrinfo = [];
  const list = root.soul.hvntrinfo;
  for (const it of p.items) {
    if (!it.entry) continue;
    const e = JSON.parse(JSON.stringify(it.entry)), i = list.findIndex(x => x && x.flrid === it.floor.id);
    if (i >= 0) list[i] = e; else if (p.extend) list.push(e);
  }
  return root;
}
// blkRewardText(e, nm): HTML summary of an hvntrinfo entry's rewards honoring the spoiler setting.
function blkRewardText(e, nm) {
  if (!e) return '';
  if (!e.rwdid && !arr(e.rwds).length) return '<span class="id">no Legendary Chest · large boxes and boss drop rolled by the game</span>';
  if (!arr(e.rwds).length) return `${LOC_SPOIL ? 'Legendary Chest: ' + nm(e.rwdid) : 'Legendary Chest'}${Number(e.is_rare) ? legendTag() : ''} <span class="id">· large boxes and boss drop rolled by the game</span>`;
  const unplaced = flmUnplaced(e);
  const rw = arr(e.rwds).map((w, i) => ({ gentype: w.gentype, placeholder: unplaced.has(i), to: w.rwdid }));
  return `${e.rwdid ? (LOC_SPOIL ? 'Legendary Chest: ' + nm(e.rwdid) : 'Legendary Chest') + (Number(e.is_rare) ? legendTag() : '') : '—'} ${flmUpText(rw, nm)}`;
}
// renderBossLock(): draws the 'Lock boss floors' panel in #loc-lock (mode/boss selects, options, planned-changes table) and wires its handlers; each change clears the cached plan and re-renders the Location tab.
function renderBossLock() {
  const host = document.getElementById('loc-lock');
  if (!host || !SAVE || !RAW_SAV_ROOT) return;
  blkSync();
  const s = RAW_SAV_ROOT.soul || {};
  let h = `<h3 style="margin:18px 0 6px;">Lock boss floors</h3>
    <div class="capNote" style="margin:0 0 10px;">Makes the run's upcoming Heaven boss floors all Dons, all mid-bosses or all Screamer Pits, for the rest of the run (confirmed in game). Keep a backup of your save.</div>`;
  if (!s.pause || s.stgid !== 'S_HVN') { host.innerHTML = h + `<div class="capNote" style="margin-top:0;">Only works on a fighter paused mid-run in Heaven (the game clears the planned boss floors between runs). Quit the game anywhere in Heaven, then load that save here.</div>`; return; }
  if (!arr(AP && AP.hvnBossAreas).length || !arr(AP && AP.hvnBossKis).length) { host.innerHTML = h + `<div class="capNote" style="margin-top:0;">This masters.db doesn't have the Heaven boss arena tables.</div>`; return; }
  if (RUN_END.root === RAW_SAV_ROOT && RUN_END.on) { host.innerHTML = h + `<div class="capNote" style="margin-top:0;">Off while the run is set to end (ending the run clears the planned boss floors).</div>`; return; }
  const from = blkFrom(), cur = hvnFloor(from);
  if (!cur) { host.innerHTML = h + `<div class="capNote" style="margin-top:0;">The paused floor isn't a known Heaven floor.</div>`; return; }
  // going back to the last boss floor: the lock still starts from the floors after the crash, but say where the fighter will be
  const rwi = REWIND.root === RAW_SAV_ROOT && REWIND.on ? rewindInfo(RAW_SAV_ROOT) : null;
  const shownFrom = rwi && rwi.pos ? rwi.floor : cur;
  const sel = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);';
  const remaining = flmRouteBoss(from).filter(x => x.no > cur.no).length;
  const lockOn = !!BOSS_LOCK.mode;
  h += `<div class="toolbar"><select id="blk-mode" style="${sel} min-width:min(340px, 100%); max-width:100%;"><option value="">Leave as rolled</option>${Object.entries(BLK_MODES).map(([ k, m ]) => `<option value="${k}" ${BOSS_LOCK.mode === k ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('')}</select>${blkWhichOptions(BOSS_LOCK.mode).length ? `<select id="blk-which" style="${sel} min-width:min(220px, 100%); max-width:100%;"><option value="">Any ${escapeHtml(BLK_MODES[BOSS_LOCK.mode].noun)}</option>${blkWhichOptions(BOSS_LOCK.mode).map(o => `<option value="${o.v}" ${BOSS_LOCK.which === o.v ? 'selected' : ''}>Only ${escapeHtml(o.label)}</option>`).join('')}</select>` : ''}</div>
    ${lockOn ? `<label style="cursor:pointer; display:block; margin:6px 0;"><input type="checkbox" id="blk-extend" ${BOSS_LOCK.extend ? 'checked' : ''} style="width:auto; margin-right:6px;">Also write every remaining boss floor of the route (${remaining} after ${escapeHtml(shownFrom.no + 'F')}), not only the ones the game has planned so far, so the lock lasts the whole run.</label>
    <div class="toolbar" style="margin:4px 0 6px;"><label style="font-size:12px;">Rewards on the floors it writes <select id="blk-rewards" style="${sel} max-width:100%;"><option value="roll" ${BOSS_LOCK.rewards === 'roll' ? 'selected' : ''}>Roll all now: Legendary Chest, large boxes, boss drop (confirmed in game)</option><option value="chest" ${BOSS_LOCK.rewards === 'chest' ? 'selected' : ''}>Legendary Chest now, the rest rolled by the game (confirmed in game)</option><option value="hidden" ${BOSS_LOCK.rewards === 'hidden' ? 'selected' : ''}>Spoiler free: like the above, and the editor never shows the rewards</option><option value="none" ${BOSS_LOCK.rewards === 'none' ? 'selected' : ''}>None: the game rolls the boxes and boss drop, no Legendary Chest (confirmed in game)</option></select></label></div>${BOSS_LOCK.rewards === 'none' ? '<div class="warnNote" style="margin:0 0 8px;"><b>These floors have no Legendary Chest.</b> Tested in game: the large boxes and the boss drop are rolled by the game as usual, but the game doesn\'t make a Legendary Chest for a floor without one, so the map shows it blank and the floor has none.</div>' : BOSS_LOCK.rewards === 'hidden' ? '<div class="capNote" style="margin:0 0 8px;">Spoiler free: each floor it writes gets a Legendary Chest (rare at the game\'s rate) and the game rolls the large boxes and boss drop, the same as the option above, but the editor won\'t show any of it here, whatever "Show rewards" is set to. You find out in game. If you load the downloaded save in the editor again, keep "Show rewards (spoilers)" unticked.</div>' : BOSS_LOCK.rewards === 'chest' ? '<div class="capNote" style="margin:0 0 8px;">Only the Legendary Chest is written; the game rolls the large boxes and boss drop itself when it builds the floor (confirmed in game).</div>' : ''}` : ''}`;
  const p = blkPlanFresh();
  if (p) {
    const nm = rwdNameHtml;
    const changed = p.items.filter(it => it.entry);
    h += `<table class="stewTable" style="margin-top:6px;"><thead><tr><th>Floor</th><th>Now</th><th>On download</th><th>${LOC_SPOIL && p.rewards !== 'hidden' ? 'Legendary Chest and other rewards' : 'Rewards (names hidden)'}</th></tr></thead><tbody>`;
    h += p.items.map(it => {
      const was = it.old ? blkKind(it.old.refareaid).label : '<span class="id">not planned yet</span>';
      const now = (it.entry ? `<b>${escapeHtml(blkKind(it.entry.refareaid).label)}</b>${it.old ? '' : ' <span class="id">(added)</span>'}` : '<span class="id">unchanged</span>') + (it.fallback ? ` <span class="id">(no ${escapeHtml(p.which ? (blkWhichOptions(p.mode).find(o => o.v === p.which) || {}).label || BLK_MODES[p.mode].noun : BLK_MODES[p.mode].noun)} on this floor)</span>` : '');
      return `<tr><td>${escapeHtml(hvnFloorLabel(it.floor))}</td><td>${it.old ? escapeHtml(was) : was}</td><td>${now}</td><td>${p.rewards === 'hidden' ? '<span class="id">hidden (spoiler free)</span>' : blkRewardText(it.entry || it.old, nm)}</td></tr>`;
    }).join('');
    h += `</tbody></table><div class="toolbar" style="margin-top:6px;"><button class="subtle" id="blk-reroll">Reroll again</button><span class="capNote" style="margin:0;">${changed.length} floor${changed.length === 1 ? '' : 's'} will be written. ${p.rewards === 'none' ? 'No Legendary Chest; the game rolls their large boxes and boss drop.' : p.rewards === 'hidden' ? 'Rewards are rolled but not shown (spoiler free).' : p.rewards === 'chest' ? 'Their Legendary Chest is drawn now; the game rolls the large boxes and boss drop.' : 'Rewards are drawn from each floor\'s own tables for the new arena.'}</span></div>`;
    h += `<div class="capNote">Not changed: the floor you're on (already built), NEO map B floors (one fixed arena), and planned floors that are already ${escapeHtml(BLK_MODES[p.mode].noun)} floors.${p.mode === 'don' ? ' Regular Heaven has no Dons below 100F (the game only offers a mid-boss or a Screamer Pit there), so those floors become mid-boss floors.' : ''}${p.mode === 'don' || p.mode === 'boss' ? ' Dons have no boss drop: their floors get a Legendary Chest and three large chests, as the game writes them.' : ''}${from !== s.flrid ? ' Applied after the floor move above, so it replaces the moved floors\' rerolled rewards.' : ''} Floors the game hadn't planned get a Legendary Chest that's rare (yellow on the map) as often as the game makes one.</div>`;
    if (p.items.some(it => /_KIS_RUSH/.test((arr(AP.hvnBossKis).find(r => r.areaid === (it.entry || it.old || {}).refareaid) || {}).kis || ''))) h += `<div class="capNote">Screamer Pit chests (treasure enemies) can hold any faction's metal, on every route: the game's own pit table mixes all four (a W.E pit can drop D.O.D. ARMS, Candle Wolf or M.I.L.K. metal). The large boxes, featured reward and boss drop stay the route's own faction.</div>`;
  }
  host.innerHTML = h;
  const wh = document.getElementById('blk-which');
  if (wh) wh.addEventListener('change', () => { BOSS_LOCK.which = wh.value; BOSS_LOCK.plan = null; renderLocation(); });
  const ms = document.getElementById('blk-mode');
  if (ms) ms.addEventListener('change', () => { BOSS_LOCK.mode = ms.value; if (!blkWhichOptions(ms.value).some(o => o.v === BOSS_LOCK.which)) BOSS_LOCK.which = ''; BOSS_LOCK.plan = null; renderLocation(); toast(ms.value ? 'Boss floor lock set — download to apply' : 'Boss floors left as rolled'); });
  const ex = document.getElementById('blk-extend');
  if (ex) ex.addEventListener('change', () => { BOSS_LOCK.extend = ex.checked; BOSS_LOCK.plan = null; renderLocation(); });
  const rws = document.getElementById('blk-rewards');
  if (rws) rws.addEventListener('change', () => { BOSS_LOCK.rewards = rws.value; BOSS_LOCK.plan = null; renderLocation(); });
  const rr = document.getElementById('blk-reroll');
  if (rr) rr.addEventListener('click', () => { BOSS_LOCK.plan = null; renderLocation(); });
}
// ==== Location tab: floor move / End the run / Rewind ====
// Block shell for the "Location" tab (Heaven run state). Only emits the section markup and the
// "show rewards (spoilers)" checkbox (LOC_SPOIL); renderLocation() fills #loc-body afterwards.
function blockLocation() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Heaven</div><h2>Location</h2></div></div>
    <div class="block-body">
      <label style="cursor:pointer; display:inline-block; margin:0 0 10px;" title="Rolled rewards are hidden until this is ticked"><input type="checkbox" id="loc-spoil" ${LOC_SPOIL ? 'checked' : ''} style="width:auto; margin-right:6px;">Show rewards (spoilers)</label>
      <div id="loc-body"></div><div id="loc-lock"></div></div>
  </section>`;
}

// ---------------------------------------------------------------------------
// End the run: send the fighter in a run back to the Waiting Room, the way the game leaves a save after
// a run ends (from a paused save and the same account's save after the run: wr1 -> wr2). The game then:
// clears soul.pause/stgid/flrid/areaid/unitid/relief_point, sets replica_money/spirit/bloodnium_point to
// -1, empties soul.hvntrinfo and force_shutdown_counts, empties the run's floor data (rlg, pop, trbox,
// item, dust, bo, mboss, ffm, vm) and zombie.flrzmbs, drops the item / part instances the run made (owners
// FLOOR, TRBOX, ZAKO, ZOMBIE, MBOSS, JACKAL_*), and the fighter's carried Kill Coins and Bloodnium go to
// the account (bloodnium_result reset). Everything in the Death Bag stays. Kill Coins are banked up to
// the Bank's limit for its level.
// ---------------------------------------------------------------------------
// Pending "End the run" request. `root` records which loaded save (RAW_SAV_ROOT) the toggle belongs to, so
// a stale `on` from a previously loaded save is ignored. Consumed by applyRunEnd() at download time.
const RUN_END = { root: null, on: false };
// Item/part instance owners that only exist for the lifetime of a run (floor drops, chests, enemies,
// Jackals); these are purged when a run is ended. The Death Bag (fighter-owned) is not matched.
const RUN_OWNERS = /^(FLOOR|TRBOX|ZAKO|ZOMBIE|MBOSS|JACKAL_.*)$/;
// Summarise what ending the current run would do, without changing anything.
// @param root save JSON root. Returns null when the save is not paused in a run (soul.pause empty), else
//   { chr (fighter in USE), money, blood (carried Kill Coins / Bloodnium), cap (Bank limit for its level),
//     bank (current soul.free_money), add (coins that fit in the Bank), lost (coins over the limit),
//     floors (rlg floors in the run), made (run-owned item/part instances), pause, flrid }.
// Gotcha: chrs / items / pts may be a plain array or an object keyed by the main account uid.
function runEndInfo(root) {
  const s = root && root.soul;
  if (!s || !s.pause) return null;
  const uid = String(RAW_SAV_MAIN_UID || (root.user && root.user.uid) || '');
  const cl = s.chr && s.chr.chrs, list = Array.isArray(cl) ? cl : cl && typeof cl === 'object' ? arr(cl[uid]) : [];
  const c = list.find(x => x && x.state === 'USE');
  const money = c ? Number(c.money) || 0 : 0, blood = c ? Number(c.bloodnium) || 0 : 0;
  const cap = bankCapacityForLevel(s.safe_level != null ? s.safe_level : 1);
  const bank = Number(s.free_money) || 0;
  const add = cap ? Math.max(0, Math.min(money, cap - bank)) : money;
  const rlg = root.floor && root.floor.rlg, floors = Array.isArray(rlg && rlg.user) ? rlg.user.length : 0;
  let made = 0;
  for (const [sec, key] of [ [ 'item', 'items' ], [ 'part', 'pts' ] ]) {
    const v = root[sec] && root[sec][key], L = Array.isArray(v) ? v : v && typeof v === 'object' ? arr(v[uid]) : [];
    made += L.filter(x => x && RUN_OWNERS.test(String(x.owner || ''))).length;
  }
  return { chr: c, money, blood, cap, bank, add, lost: money - add, floors, made, pause: s.pause, flrid: s.flrid };
}
// Mutating step of "End the run", called while building the download clone (not on the live SAVE).
// No-op unless the toggle is on for this very root and the soul is paused. Mirrors what the game writes when a
// run ends: clears pause/stage/floor ids, resets replica_* to -1, empties run floor data, banks the carried
// Kill Coins (capped by the Bank) and adds Bloodnium (capped by bloodniumMax), zeroes the fighter's run
// money, and drops run-owned item/part instances. Returns the (mutated) root.
function applyRunEnd(root) {
  if (RUN_END.root !== RAW_SAV_ROOT || !RUN_END.on || !root || !root.soul || !root.soul.pause) return root;
  const s = root.soul, info = runEndInfo(root), uid = String(RAW_SAV_MAIN_UID);
  // blank the run position fields (only those present, so absent keys are not invented)
  for (const k of [ 'pause', 'stgid', 'flrid', 'areaid', 'unitid', 'relief_point' ]) if (k in s) s[k] = '';
  for (const k of [ 'replica_money', 'replica_spirit', 'replica_bloodnium_point' ]) if (k in s) s[k] = -1;
  if ('hvntrinfo' in s) s.hvntrinfo = {};
  if ('force_shutdown_counts' in root) root.force_shutdown_counts = {};
  const c = info && info.chr;
  if (c) {
    s.free_money = (Number(s.free_money) || 0) + info.add;
    // the game caps Bloodnium at BLOODNIUM_POINT_MAX (a total already above it is left as it is)
    { const had = Number(s.bloodnium_point) || 0; s.bloodnium_point = Math.max(had, Math.min(bloodniumMax(), had + info.blood)); }
    c.money = 0; c.bloodnium = 0; c.pause = '';
    c.bloodnium_result = JSON.stringify({ enemy_count: 0, bloodnium: 0, elapsed_time: 0, max_floor_id: '' });
  }
  // empty every per-floor structure of the run (shapes must stay objects with the same sub-keys)
  const fl = root.floor;
  if (fl) {
    fl.rlg = { user: {}, archive: {} };
    if (fl.pop && typeof fl.pop === 'object') for (const k of Object.keys(fl.pop)) fl.pop[k] = {};
    for (const k of [ 'trbox', 'item', 'dust' ]) if (k in fl) fl[k] = {};
    const empty = { bo: [ 'bos', 'flrbos' ], mboss: [ 'mbss', 'mbszmbs', 'flrmbss' ], ffm: [ 'ffms', 'flrffms', 'kill_areas' ], vm: [ 'vms', 'flrvms' ] };
    for (const [k, keys] of Object.entries(empty)) if (k in fl) { fl[k] = {}; for (const kk of keys) fl[k][kk] = {}; }
  }
  const z = root.zombie && root.zombie.flrzmbs;
  if (z && typeof z === 'object') for (const k of Object.keys(z)) z[k] = {};
  // remove run-owned instances; the list is a bare array or {uid: [...]}, so handle both
  for (const [sec, key] of [ [ 'item', 'items' ], [ 'part', 'pts' ] ]) {
    const v = root[sec] && root[sec][key];
    const keep = L => L.filter(x => !(x && RUN_OWNERS.test(String(x.owner || ''))));
    if (Array.isArray(v)) root[sec][key] = keep(v);
    else if (v && typeof v === 'object' && Array.isArray(v[uid])) v[uid] = keep(v[uid]);
  }
  return root;
}
// ==== Rewind to the last boss floor ====
// ---------------------------------------------------------------------------
// Go back to the last boss floor (confirmed in game on regular Heaven, 2026-10-05). A run that crashed on a normal (randomly built) Heaven floor
// can crash the game when it tries to resume it. Instead of ending the run, this puts the fighter back on the
// last boss floor of the run, paused the way the game pauses there (HEAVEN_PAUSE at the arena's arrival point),
// with that floor's boss already beaten and its chests gone (they were left behind when the run moved on).
// The floors after it are dropped from the run; the fighter keeps the Death Bag, Kill Coins and Bloodnium.
// Arrival points come from real paused saves: regular Heaven's boss map and NEO map A.
// ---------------------------------------------------------------------------
// Pending "go back to the last boss floor" request. Same root-tag pattern as RUN_END. `extra` caches the
// reward entries rolled for skipped NEO map B floors (rolled once so review and download agree).
// It is ignored while End the run is on (applyRewind returns early).
const REWIND = { root: null, on: false, extra: { root: null, by: {} } };
// Known pause positions (x/y/z/yaw) where the game places a fighter on a boss arena, keyed by area id
// (regular Heaven boss map and NEO map A). NEO map B is unknown, so rewind is not offered onto it.
const REWIND_POS = {
  HVN_AREA_017: { x: 23.341, y: 8529.418, z: -902.85, yaw: 23846 },
  HVN_AREA_001: { x: 60.8716, y: 8421.1299, z: -902.85, yaw: -4048 }
};
// Arrival point for an area id; strips a trailing _R0n variant suffix. Returns null when unknown.
function rewindPos(areaid) { return REWIND_POS[String(areaid || '').replace(/_R0\d$/, '')] || null; }
// Decide whether (and where) a crashed normal-floor run can be rewound. Only applies to a *_CRASH pause in
// S_HVN on a floor without a mid boss (mbsmax == 0). Walks the visited floors backwards (skipping the current
// one) for the latest boss floor; prefers one with a known arrival point, counting skipped map-B floors.
// Returns { idx, flrid, areaid, floor, cur, pos, dropped, skipped } or null; `pos` null means unsupported.
function rewindInfo(root) {
  const s = root && root.soul;
  if (!s || !/_CRASH$/.test(String(s.pause || '')) || s.stgid !== 'S_HVN') return null;
  const cur = hvnFloor(s.flrid);
  if (!cur || Number(cur.mbsmax) > 0) return null; // only for crashes on a normal floor
  const user = arr(root.floor && root.floor.rlg && root.floor.rlg.user);
  // the most recent boss floor whose map has a known arrival point (NEO map B has none yet, so a crash
  // after a map B floor goes back to the map A floor before it)
  let last = null, skipped = 0;
  for (let i = user.length - 2; i >= 0; i--) {
    const f = hvnFloor(user[i].flrid);
    if (!f || !(Number(f.mbsmax) > 0)) continue;
    const pos = rewindPos(user[i].areaid);
    const hit = { idx: i, flrid: user[i].flrid, areaid: user[i].areaid, floor: f, cur, pos, dropped: user.length - 1 - i, skipped };
    if (pos) return hit;
    if (!last) last = hit;
    skipped++;
  }
  return last;
}
// Mutating step of the rewind, applied to the download clone. Truncates floor.rlg (user list and archive) to
// the boss floor, drops spawn data of later floors, resets the boss floor to its post-boss state, optionally
// refills soul.hvntrinfo for skipped map B floors, and pauses the fighter at the arena arrival point
// (HEAVEN_PAUSE). Does nothing if the toggle is off, stale, or End the run is also on.
function applyRewind(root) {
  if (REWIND.root !== RAW_SAV_ROOT || !REWIND.on || !root || !root.soul) return root;
  if (RUN_END.root === RAW_SAV_ROOT && RUN_END.on) return root;
  const ri = rewindInfo(root);
  if (!ri || !ri.pos) return root;
  const s = root.soul, fl = root.floor || (root.floor = {}), uid = String(RAW_SAV_MAIN_UID);
  // set of "flrid|areaid" for floors that survive; kept(id) tests by floor id only
  const keep = new Set(arr(fl.rlg && fl.rlg.user).slice(0, ri.idx + 1).map(u => u.flrid + '|' + u.areaid));
  const kept = id => [ ...keep ].some(k => k.startsWith(id + '|'));
  // the run's floor list and archive end at the boss floor
  if (fl.rlg) {
    if (Array.isArray(fl.rlg.user)) fl.rlg.user = fl.rlg.user.slice(0, ri.idx + 1);
    if (Array.isArray(fl.rlg.archive)) fl.rlg.archive = fl.rlg.archive.filter(a => a && keep.has(a.flrid + '|' + a.areaid));
  }
  // spawn lists of the dropped floors go
  if (fl.pop && typeof fl.pop === 'object') {
    for (const k of Object.keys(fl.pop)) {
      const v = fl.pop[k];
      if (Array.isArray(v)) fl.pop[k] = v.filter(e => !e || !e.flrid || kept(e.flrid));
      else if (v && typeof v === 'object') for (const kk of Object.keys(v)) { const id = kk.split('-')[0]; if (/^HVN_FLR_/.test(id) && !kept(id)) delete v[kk]; }
    }
  }
  // the boss floor as the game leaves it once its boss is beaten and you've moved on: nothing waiting
  // the boss floor as the game leaves it after the boss is beaten: containers empty, only the dust markers remain
  fl.trbox = {}; fl.item = {};
  fl.mboss = { mbss: {}, mbszmbs: {}, flrmbss: {} };
  fl.zako = { zks: {}, flrzks: {}, trbox: {} };
  fl.bo = { bos: {}, flrbos: {} };
  if (fl.vm) fl.vm = { vms: {}, flrvms: {} };
  if (fl.ffm) fl.ffm = { ffms: {}, flrffms: {}, kill_areas: {} };
  fl.dust = [ 'BOSS_START', 'BOSS_GOAL' ].map(unit => ({ flrid: ri.flrid, areaid: ri.areaid, unit, pntid: 'HVN_DST_TGT_00', type: 'CHARGE' }));
  const z = root.zombie && root.zombie.flrzmbs;
  if (z && typeof z === 'object') for (const k of Object.keys(z)) z[k] = {};
  // boss floors between the one we go back to and the map's first upcoming entry (a skipped NEO map B floor)
  // get their reward entry, drawn from that floor's own tables the way the game rolls them
  if (ri.skipped && Array.isArray(s.hvntrinfo)) {
    // the root's soul still shares the loaded save's hvntrinfo array: copy it first, or every build would add to
    // the loaded save; and keep a Lock boss floors list that runs further than the game's usual four entries
    flmOwnHvn(root);
    const before = s.hvntrinfo.length;
    const L = flmRouteBoss(ri.flrid), from = L.findIndex(f => f.id === ri.flrid);
    const have = new Set(s.hvntrinfo.map(e => e && e.flrid));
    const firstUp = s.hvntrinfo.map(e => L.findIndex(f => f.id === (e && e.flrid))).filter(i => i >= 0).sort((a, b) => a - b)[0];
    const stop = firstUp != null ? firstUp : from + 1;
    for (let i = from + 1; i < stop; i++) {
      const f = L[i];
      if (!f || have.has(f.id) || !/^HVN_AREA_002_/.test(f.areaid)) continue;
      // rolled once and kept, so the review and every download show the same rewards
      if (REWIND.extra.root !== RAW_SAV_ROOT) REWIND.extra = { root: RAW_SAV_ROOT, by: {} };
      let ent = REWIND.extra.by[f.id];
      if (!ent) {
        // the map B floor's one fixed arena, which differs by route (D.O.D. MET, W.E ARC, C.W AMS, M.I.L.K. RFT)
        const ar = blkPick(arr(AP && AP.hvnBossAreas).filter(r => r.flrid === f.id));
        if (!ar) continue;
        const ref = ar.refareaid, rare = Math.random() < HVN_RARE_CHANCE ? 1 : 0;
        const feat = flmDraw(f.id, f.areaid, ref, rare ? 'PTGENTP_TRBOX_SPXL_RARE' : 'PTGENTP_SPXL');
        const boxes = [ 0, 1, 2 ].map(() => flmDraw(f.id, f.areaid, ref, 'PTGENTP_TRBOX_L'));
        if (!feat || boxes.some(b => !b)) continue;
        ent = REWIND.extra.by[f.id] = { flrid: f.id, areaid: f.areaid, refareaid: ref, rwdtype: 'TBRWD_ITEM', rwdid: feat, is_rare: rare, created: 0, rwds: boxes.map(b => ({ gentype: 'PTGENTP_TRBOX_L', rwdtype: 'TBRWD_ITEM', rwdid: b })) };
      }
      s.hvntrinfo.push(JSON.parse(JSON.stringify(ent)));
    }
    // the game keeps the next four boss floors; later ones are added again as you climb
    s.hvntrinfo.sort((a, b) => L.findIndex(f => f.id === a.flrid) - L.findIndex(f => f.id === b.flrid));
    // (a Lock boss floors list that runs further is kept whole)
    if (before <= 4 && s.hvntrinfo.length > 4) s.hvntrinfo.length = 4;
  }
  // where the fighter is: paused on the boss floor's arrival point
  s.flrid = ri.flrid; s.areaid = ri.areaid; s.unitid = 'D0'; s.relief_point = 'D0';
  s.pause = 'HEAVEN_PAUSE';
  s.pause_x = ri.pos.x; s.pause_y = ri.pos.y; s.pause_z = ri.pos.z; s.pause_yaw = ri.pos.yaw;
  if ('pause_pitch' in s) s.pause_pitch = 0;
  if ('pause_roll' in s) s.pause_roll = 0;
  return root;
}
// HTML card for the rewind option (checkbox #run-rewind). Returns '' if not applicable; when the arrival
// point is unknown it shows an explanatory note instead of the checkbox.
function rewindHtml() {
  const ri = rewindInfo(RAW_SAV_ROOT);
  if (!ri) return '';
  const on = REWIND.root === RAW_SAV_ROOT && REWIND.on;
  const ended = RUN_END.root === RAW_SAV_ROOT && RUN_END.on;
  const name = hvnFloorLabel(ri.floor), curNo = ri.cur.no + 'F';
  if (!ri.pos) return `<div class="subDetails" style="padding:10px; margin-bottom:12px;"><div class="eyebrow" style="margin-bottom:6px;">Go back to the last boss floor</div><div class="capNote" style="margin-top:0;">The last boss floor of this run is ${escapeHtml(name)}, but the editor doesn't know where the game places a fighter on that map yet, so this isn't offered. End the run instead.</div></div>`;
  return `<div class="subDetails" style="padding:10px; margin-bottom:12px;"><div class="eyebrow" style="margin-bottom:6px;">Go back to the last boss floor <span style="text-transform:none; letter-spacing:0;">(confirmed in game)</span></div>
    <div class="capNote" style="margin-top:0;">Keeps the run: the fighter is put back on <b>${escapeHtml(name)}</b>, paused the way the game pauses there, with its boss already beaten. The ${ri.dropped} floor${ri.dropped === 1 ? '' : 's'} after it (up to ${curNo}) are dropped, so you play them again.${ri.skipped ? ` (A later boss floor uses NEO map B, where the editor doesn't know the arrival point yet, so it goes back to this map A floor. That map B floor gets its rewards on the map, drawn from its own tables.)` : ''} The Death Bag, carried Kill Coins and Bloodnium stay. If the game still crashes, use End the run instead.</div>
    <label style="cursor:pointer;"><input type="checkbox" id="run-rewind" ${on ? 'checked' : ''} ${ended ? 'disabled' : ''} style="width:auto; margin-right:6px;">Go back to ${escapeHtml(ri.floor.no + 'F')} when I download</label>${ended ? ' <span class="id">(off while End the run is ticked)</span>' : ''}</div>`;
}
// Hook up the rewind checkbox: stores the choice (tagged with the current root), rerenders and re-runs the save check.
function wireRewind() {
  const b = document.getElementById('run-rewind');
  if (b) b.addEventListener('change', () => { REWIND.root = RAW_SAV_ROOT; REWIND.on = b.checked; renderLocation(); runSaveCheck(); toast(b.checked ? 'On download the fighter goes back to the last boss floor' : 'Rewind off'); });
}
// HTML card for "End the run" (checkbox #run-end) with a summary from runEndInfo: Kill Coins that fit in the
// Bank vs lost, Bloodnium, floors and items cleared. Highlighted when the save closed without pausing (*_CRASH).
function runEndHtml(cur) {
  const info = runEndInfo(RAW_SAV_ROOT);
  if (!info) return '';
  const on = RUN_END.root === RAW_SAV_ROOT && RUN_END.on;
  const nm = info.chr ? escapeHtml(info.chr.name || 'the fighter') : 'the fighter';
  const crash = /_CRASH$/.test(info.pause);
  let h = `<div class="subDetails" style="padding:10px; margin-bottom:12px;${crash ? ' border-color:var(--accent);' : ''}"><div class="eyebrow" style="margin-bottom:6px;">End the run <span style="text-transform:none; letter-spacing:0;">(confirmed in game)</span></div>
    <div class="capNote" style="margin-top:0;">Send ${nm} back to the Waiting Room, the way the game leaves a save after a run ends. Everything in the Death Bag stays; the ${info.money.toLocaleString()} Kill Coins carried go to the Bank${info.lost > 0 ? ` <b>up to its limit (${info.cap.toLocaleString()}), so ${info.lost.toLocaleString()} are lost</b> (raise the Bank level on the Account tab first to keep them)` : ''} and the ${info.blood.toLocaleString()} Bloodnium to the account. The run's floor data (${info.floors} floor${info.floors === 1 ? '' : 's'}) and the ${info.made.toLocaleString()} item${info.made === 1 ? '' : 's'} it left on floors, in chests and on Jackals are cleared, like the game does. The run's Exploration Bonus isn't paid.${crash ? ' <b>This save ended without pausing (' + escapeHtml(info.pause) + '):</b> if the game crashes when it loads the run, ending it here lets the save load in the Waiting Room.' : ''}</div>
    <label style="cursor:pointer;"><input type="checkbox" id="run-end" ${on ? 'checked' : ''} style="width:auto; margin-right:6px;">End the run when I download</label></div>`;
  return h;
}
// Hook up the End-the-run checkbox (toggle is applied at download by applyRunEnd).
function wireRunEnd() {
  const b = document.getElementById('run-end');
  if (b) b.addEventListener('change', () => { RUN_END.root = RAW_SAV_ROOT; RUN_END.on = b.checked; renderLocation(); toast(b.checked ? 'The run will end on download (fighter back to the Waiting Room)' : 'Run kept'); });
}
// Render the whole Location tab into #loc-body: paused-on summary, End the run, Rewind, then (if no run
// action is ticked) the boss-floor move form with target select, reward reroll and spoiler table.
// Floor moves themselves are staged in FLOOR_MOVE and applied at download; this function only edits UI state.
function renderLocation() {
  const host = document.getElementById('loc-body');
  if (!host || !SAVE || !RAW_SAV_ROOT) return;
  const sp = document.getElementById('loc-spoil');
  if (sp && !sp.dataset.wired) { sp.dataset.wired = '1'; sp.checked = LOC_SPOIL; sp.addEventListener('change', () => { locSetSpoil(sp.checked); renderLocation(); }); }
  // refresh the floor-move model from the current SAVE, then the Lock boss floors panel
  flmSync();
  renderBossLock();
  const cur = flmCurrent();
  const f = cur && hvnFloor(cur.flrid);
  let h = `<div class="capNote" style="margin-top:0;">Move a fighter paused on a Heaven boss floor to another boss floor of the same route and map (confirmed in game). Keep a backup of your save. The run's Exploration Bonus is based on the floor you end on, so moving deeper raises the Bloodnium bonus.</div>`;
  // nothing to show when the save is at the Waiting Room (no soul.pause)
  if (!cur || !cur.pause) {
    h += `<div class="capNote" style="margin-top:0;">The fighter isn't paused in a run (the save is at the Waiting Room), so there's nothing to move. Quit the game while standing on a Heaven boss floor, then load that save here.</div>`;
    host.innerHTML = h; return;
  }
  const where = f ? hvnFloorLabel(f) : `${cur.flrid || '?'} (${cur.stgid || '?'})`;
  const chr = arr(SAVE.soul.chrs).find(c => c.state === 'USE');
  h += `<div class="field" style="margin-bottom:10px;"><label>Paused on</label><div style="padding:6px 0; font-size:14px;"><b>${escapeHtml(where)}</b>${chr ? ` <span class="id">— ${escapeHtml(chr.name || '')}</span>` : ''}${/_CRASH$/.test(cur.pause) ? ' <span class="badge" style="background:var(--accent); color:#fff;">closed without pausing</span>' : ''}</div></div>`;
  h += runEndHtml(cur);
  h += rewindHtml();
  // End-the-run / Rewind take precedence: hide the floor-move form while either is ticked
  if ((RUN_END.root === RAW_SAV_ROOT && RUN_END.on) || (REWIND.root === RAW_SAV_ROOT && REWIND.on)) { h += `<div class="capNote">Floor moves are off while the run is set to ${RUN_END.root === RAW_SAV_ROOT && RUN_END.on ? 'end' : 'go back to its last boss floor'}.</div>`; host.innerHTML = h; wireRunEnd(); wireRewind(); return; }
  if (FLOOR_MOVE.msg) h += `<pre class="stewLog">${escapeHtml(FLOOR_MOVE.msg)}</pre>`;
  // candidate target floors: same route and map, with the already-built arena able to appear there
  const targets = flmTargets();
  // floors left out because the arena already built here can't appear on them (e.g. a Don below 100F)
  const curRef = flmCurRef(), sameMap = f ? arr(AP && AP.hvnFloors).filter(x => x.areaid === f.areaid && x.id !== f.id && hvnRoute(x.id).key === hvnRoute(f.id).key).length : 0;
  const arenaNote = curRef && sameMap > targets.length ? `<div class="capNote" style="margin-top:0;">This floor is a <b>${escapeHtml(blkKind(curRef).label)}</b> floor and it's already built, so only floors where that arena can appear are listed (${sameMap - targets.length} left out${(() => { const k = blkKind(curRef).kind, main = hvnRoute(f.id).key === 'main'; const nos = targets.map(x => x.no).concat([ f.no ]); const span = `this arena only appears on ${Math.min(...nos)}F-${Math.max(...nos)}F`; return k === 'boss' && main ? ': regular Heaven has no Dons below 100F' : k === 'pit' && main ? `: ${span}` : `: ${span}`; })()}).</div>` : '';
  if (cur.stgid !== 'S_HVN' || !f) h += `<div class="capNote">Only Heaven boss floors can be moved (the fighter is paused outside Heaven).</div>`;
  else if (!(Number(f.mbsmax) > 0)) h += `<div class="warnNote" style="margin:0 0 10px;"><b>Floor move needs a boss floor.</b> The fighter is on ${escapeHtml(f.no + 'F')}, a normal Heaven floor. Normal floors are built at random, so only boss floors (which always use the same map) can be moved. To move, play to a boss floor (every 5th floor: 55F, 60F, 65F …), quit while standing on it, and load that save here. <b>Lock boss floors</b> below works from this floor.</div>`;
  else if (!targets.length) h += arenaNote || `<div class="capNote">No other boss floor uses this map.</div>`;
  else {
    const sel = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);';
    const t = FLOOR_MOVE.target ? hvnFloor(FLOOR_MOVE.target) : null;
    const twinN = flmPitNo(flmPitTwin(curRef)), conv = targets.filter(x => flmSwapRef(x.id));
    const pitNote = conv.length ? `<div class="capNote" style="margin-top:0;">This floor is a <b>Screamer Pit</b> (RUSH${flmPitNo(curRef)}). Regular Heaven uses RUSH1-5 pits only below 100F and RUSH6-10 only from 100F, so on ${conv[0].no < f.no ? 'floors below 100F' : '100F and up'} the pit is turned into its twin, <b>RUSH${twinN}</b>: same map and spawn points, the ${twinN > 5 ? 'deeper' : 'shallower'} floors' enemy set. Those floors are marked <b>pit converted (experimental)</b>: not yet tested in game, so keep a backup. A mid-boss floor moves anywhere without this.</div>` : '';
    h += `<div class="capNote" style="margin-top:0;">Only boss floors of the same route that use the same map are listed (${escapeHtml(hvnRoute(f.id).name)}, ${escapeHtml(hvnMapLabel(f.areaid))}). The boss waiting on the floor is set to the new floor's boss level. Your records (deepest floor, clear times) are left as they are.</div>${arenaNote}
${pitNote}
      <div class="toolbar"><select id="loc-target" style="${sel} min-width:min(340px, 100%); max-width:100%;"><option value="">— keep ${escapeHtml(f.no + 'F')} —</option>${targets.map(x => `<option value="${x.id}" ${FLOOR_MOVE.target === x.id ? 'selected' : ''}>${escapeHtml(hvnFloorLabel(x))} · boss Lv ${x.mbslvlmin}${x.no < f.no ? ' (lower)' : ''}${flmSwapRef(x.id) ? ' · pit converted (experimental)' : ''}</option>`).join('')}</select>
      <button class="action" id="loc-apply">${FLOOR_MOVE.armed ? 'Click again to confirm' : 'Move to this floor'}</button>${FLOOR_MOVE.target ? '<button class="subtle" id="loc-undo">Undo</button>' : ''}</div>`;
    if (t) {
      h += `<div class="capNote">On download the fighter will be on <b>${escapeHtml(hvnFloorLabel(t))}</b> (from ${escapeHtml(f.no + 'F')}), boss Lv ${t.mbslvlmin}.</div>`;
      if (flmSwapRef(t.id)) h += `<div class="warnNote" style="margin:6px 0;"><b>EXPERIMENTAL: pit converted.</b> ${escapeHtml(t.no + 'F')} can't have this floor's pit (RUSH${flmPitNo(curRef)}), so it's turned into its twin RUSH${flmPitNo(flmSwapRef(t.id))} (arena ${escapeHtml(flmSwapRef(t.id))}): the built arena, its spawn points and the floor's reward plan are renamed to it. The map and its layout don't change. Not yet tested in game; keep a backup and tell us how it goes.</div>`;
      const r = FLOOR_MOVE.rolls, nm = rwdNameHtml;
      const n = r ? r.boxes.length + (r.boss ? 1 : 0) + (r.featured ? 1 : 0) + arr(r.upcoming).length : 0;
      const up = flmUpcoming(t.id);
      h += `<div class="capNote">The map's upcoming rewards move with you: ${up.length ? up.map(u => u.floor.no + 'F').join(', ') : 'no further boss floors on this route'}.</div>`;
      const fx = Object.entries((r && r.refix) || {});
      if (fx.length) h += `<div class="capNote">Planned boss floors re-picked for their new floor (their arena can't appear there): ${fx.map(([ id, x ]) => `${escapeHtml((hvnFloor(id) || {}).no + 'F')} ${escapeHtml(blkKind(x.from).label)} → <b>${escapeHtml(blkKind(x.to).label)}</b>`).join(', ')}. Rewards are drawn from the new floor's tables.</div>`;
      h += `<div class="subDetails" style="padding:10px; margin-top:8px;"><label style="cursor:pointer;"><input type="checkbox" id="loc-reroll" ${FLOOR_MOVE.reroll ? 'checked' : ''} style="width:auto; margin-right:6px;">Reroll the boss floor rewards for ${escapeHtml(t.no + 'F')}</label>`;
      if (!n) h += `<div class="capNote">No unopened rewards on this floor to reroll.</div>`;
      else if (FLOOR_MOVE.reroll && !LOC_SPOIL) {
        h += `<div class="capNote">${n} reward${n === 1 ? '' : 's'} will be rerolled from ${escapeHtml(t.no + 'F')}'s own drop table (${r.boxes.length} on this floor${r.boss ? ' plus the boss drop' : ''}${arr(r.upcoming).length ? `, and the map's upcoming ${arr(r.upcoming).map(u => u.no + 'F').join(', ')}` : ''}). Tick <b>Show rewards (spoilers)</b> to see them.</div><div class="toolbar" style="margin-top:6px;"><button class="subtle" id="loc-reroll-again">Reroll again</button></div>`;
      } else if (FLOOR_MOVE.reroll) {
        h += `<table class="stewTable" style="margin-top:6px;"><thead><tr><th>Reward</th><th>Rolled for ${escapeHtml(f.no + 'F')}</th><th>Rerolled for ${escapeHtml(t.no + 'F')}</th></tr></thead><tbody>`;
        h += r.boxes.map((b, i) => `<tr><td>${b.gentype === 'PTGENTP_TRZAKO' ? 'Treasure enemy' : b.gentype === 'featured' ? 'Legendary Chest (extra large)' : 'Treasure box ' + (i + 1)}</td><td>${nm(b.from)}</td><td>${nm(b.to)}</td></tr>`).join('');
        if (r.boss) h += `<tr><td>Boss drop</td><td>${nm(r.boss.from)}</td><td>${nm(r.boss.to)}</td></tr>`;
        if (r.featured) h += `<tr><td>Legendary Chest (map)</td><td>${nm(r.featured.from)}</td><td>${nm(r.featured.to)}</td></tr>`;
        const lockP = BOSS_LOCK.root === RAW_SAV_ROOT && BOSS_LOCK.mode ? blkPlanFresh() : null;
        const lockWrites = id => !!(lockP && lockP.items.some(it => it.floor.id === id && it.entry));
        for (const u of arr(r.upcoming)) h += `<tr${lockWrites(u.id) ? ' style="opacity:.55;"' : ''}><td>Upcoming ${u.no}F${u.rare && !lockWrites(u.id) ? legendTag() : ''}${u.refix ? `<br><span class="id">${escapeHtml(blkKind(u.refix.from).label)} → ${escapeHtml(blkKind(u.refix.to).label)}</span>` : ''}</td><td class="id">${lockWrites(u.id) ? 'replaced by Lock boss floors below' : 'shown on the map'}</td><td>${lockWrites(u.id) ? '<span class="id">—</span>' : `${u.featured ? 'Legendary Chest: ' + nm(u.featured.to) : '—'} ${flmUpText(u.rwds, nm)}`}</td></tr>`;
        h += `</tbody></table><div class="toolbar" style="margin-top:6px;"><button class="subtle" id="loc-reroll-again">Reroll again</button><span class="capNote" style="margin:0;">Drawn from ${escapeHtml(t.no + 'F')}'s own drop table, the way the game rolls them.</span></div>`;
      } else h += `<div class="capNote">The rewards rolled for ${escapeHtml(f.no + 'F')} are kept.</div>`;
      h += '</div>';
    }
  }
  host.innerHTML = h;
  wireRunEnd();
  wireRewind();
  // wire the move form: select, two-step apply (arm then confirm), reroll toggles and undo
  const tsel = document.getElementById('loc-target');
  let pick = FLOOR_MOVE.target;
  if (tsel) tsel.addEventListener('change', () => { pick = tsel.value; FLOOR_MOVE.armed = false; });
  const ap = document.getElementById('loc-apply');
  if (ap) ap.addEventListener('click', () => {
    pick = tsel ? tsel.value : '';
    if (!pick) { FLOOR_MOVE.target = ''; FLOOR_MOVE.armed = false; FLOOR_MOVE.msg = ''; renderLocation(); toast('Staying on the current floor'); return; }
    if (!FLOOR_MOVE.armed) { FLOOR_MOVE.armed = true; renderLocation(); document.getElementById('loc-target').value = pick; return; }
    FLOOR_MOVE.armed = false;
    FLOOR_MOVE.target = pick;
    FLOOR_MOVE.rolls = flmRoll(pick);
    FLOOR_MOVE.msg = `Set to move to ${hvnFloorLabel(hvnFloor(pick))}. Download the .sav to apply it.`;
    renderLocation();
    toast('Floor move set — download to apply');
  });
  const rr = document.getElementById('loc-reroll');
  if (rr) rr.addEventListener('change', () => { FLOOR_MOVE.reroll = rr.checked; if (rr.checked && !FLOOR_MOVE.rolls) FLOOR_MOVE.rolls = flmRoll(FLOOR_MOVE.target); renderLocation(); });
  const ra = document.getElementById('loc-reroll-again');
  if (ra) ra.addEventListener('click', () => { FLOOR_MOVE.rolls = flmRoll(FLOOR_MOVE.target); renderLocation(); });
  const un = document.getElementById('loc-undo');
  if (un) un.addEventListener('click', () => { FLOOR_MOVE.target = ''; FLOOR_MOVE.armed = false; FLOOR_MOVE.msg = ''; FLOOR_MOVE.rolls = null; renderLocation(); });
}
// Tab hook: render only when the Location tab is active.
function wireLocation() { if (activeTab === 'location') renderLocation(); }

