// ==== Compare & Copy tab state ====
// CMP: the second save (B). rootB = its raw JSON, adB = the same adapted to the editor's friendly shape, uidB = its main uid,
// account = which account the download belongs to ('A' = edited save, 'B' = second save), forRoot = the raw root this state belongs to.
let CMP = { rootB: null, adB: null, uidB: '', file: '', account: 'A', forRoot: null, msg: '' };
// CMP_EXTRA: raw B-side instances (by new eid, per kind) and Death Bag layouts of items/fighters copied from B, used
// at download so copied items keep every field B had. Reset when a different save is loaded.
// raw instances of items copied from B, used by the build so copied items keep
// every field B had (keyed by eid)
let CMP_EXTRA = { root: null, pts: {}, msrs: {}, bsts: {}, items: {}, bags: {} };
// Account values that can be compared/copied: [soul field, label].
const CMP_ACCOUNT_FIELDS = [ [ 'free_money', 'Kill Coins' ], [ 'spirit', 'SPLithium' ], [ 'safe_level', 'Kill Coin bank level' ], [ 'spirit_tank_level', 'SPLithium tank level' ], [ 'bloodnium_point', 'Bloodnium' ], [ 'recycle_point', 'Recycle Points' ], [ 'rank', 'Rank' ], [ 'rank_point', 'Rank points' ], [ 'tdm_point', 'TDM points' ], [ 'tdm_rank', 'TDM rank' ] ];
// user.* fields that identify the account (name, platform ids, login keys); swapped when the account is switched or cloned.
const CMP_IDENTITY_FIELDS = [ 'nm', 'psnacid', 'sid', 'skey', 'uuid', 'olid' ];

// Resets CMP / CMP_EXTRA whenever the edited save (RAW_SAV_ROOT) changes.
function cmpSync() {
  if (CMP.forRoot !== RAW_SAV_ROOT) CMP = { rootB: null, adB: null, uidB: '', file: '', account: 'A', forRoot: RAW_SAV_ROOT, msg: '' };
  if (CMP_EXTRA.root !== RAW_SAV_ROOT) CMP_EXTRA = { root: RAW_SAV_ROOT, pts: {}, msrs: {}, bsts: {}, items: {}, bags: {} };
}

// Loads save B from a File (.sav BRG container or plain JSON), validates it, and adapts it. The adapter overwrites
// RAW_EMPTY_SHAPES for the loaded save, so A's value is restored afterwards. Throws if it is not a LET IT DIE save.
async function cmpLoadFile(file) {
  const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
  const root = isBrgSav(bytes) ? await parseBrgSav(bytes) : parseSaveJsonText(new TextDecoder('utf-8').decode(bytes));
  if (!looksLikeFullDump(root)) throw new Error('not a LET IT DIE save');
  // the adapter records the loaded save's empty shapes; keep A's
  const keepShapes = RAW_EMPTY_SHAPES;
  let ad;
  try { ad = adaptFullDumpToLegacyShape(root); } finally { RAW_EMPTY_SHAPES = keepShapes; }
  CMP.rootB = root;
  CMP.adB = ad;
  CMP.uidB = String(ad.__rawSavMainUid || '');
  CMP.file = file.name;
  CMP.account = 'A';
  CMP.msg = '';
  CLONE_ARMED = false;
}

// Deep clone via JSON, and A's main uid as a string.
const cmpClone = o => JSON.parse(JSON.stringify(o));
const cmpUidA = () => String(RAW_SAV_MAIN_UID);

// ---- account re-key (used at download when B's account is chosen) ---------
// Recursively (depth <= 12) re-keys uid: values of fields ending in 'uid' and object keys equal to `from` become `to`.
// Mutates `node` in place. Number/string type of the value is preserved.
function cmpRekeyUid(node, from, to, depth) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) { for (const v of node) cmpRekeyUid(v, from, to, depth + 1); return; }
  for (const k of Object.keys(node)) {
    let v = node[k];
    if (/uid$/i.test(k) && (v === Number(from) || v === from)) node[k] = typeof v === 'number' ? Number(to) : String(to);
    else if (v && typeof v === 'object') cmpRekeyUid(v, from, to, depth + 1);
    if (k === from) { node[to] = node[k]; delete node[k]; }
  }
}
// Applied at download when account 'B' is chosen: moves every uid-keyed part of root to B's uid and copies B's identity fields.
// No-op if A is chosen, no B loaded, or both uids match. Returns root.
function applyAccountChoice(root) {
  if (!CMP.rootB || CMP.forRoot !== RAW_SAV_ROOT || CMP.account !== 'B') return root;
  const from = cmpUidA(), to = CMP.uidB;
  if (!to || from === to) return root;
  cmpRekeyUid(root, from, to, 0);
  const ub = CMP.rootB.user || {};
  root.user = root.user || {};
  for (const f of CMP_IDENTITY_FIELDS) if (f in ub) root.user[f] = ub[f];
  return root;
}

// ---- helpers ---------------------------------------------------------------
// Set of every item eid (parts, mushrooms, beasts, items) held by A's fighters (optionally skipping one) and Storage Box,
// used to avoid eid collisions when copying from B.
function cmpEidsInA(skipCid) {
  const s = new Set;
  for (const c of arr(SAVE.soul.chrs)) {
    if (skipCid && c.cid === skipCid) continue;
    for (const p of arr(c.pspts)) s.add(p.eptid);
    for (const m of arr(c.psmsrs)) s.add(m.emsrid);
    for (const b of arr(c.psbsts)) s.add(b.ebstid);
    for (const it of arr(c.psitems)) s.add(it.eitemid);
  }
  const cl = SAVE.cl || {};
  for (const p of arr(cl.pts)) s.add(p.eptid);
  for (const m of arr(cl.msrs)) s.add(m.emsrid);
  for (const b of arr(cl.bsts)) s.add(b.ebstid);
  for (const it of arr(cl.items)) s.add(it.eitemid);
  return s;
}
// Finds B's raw instance for an eid. kind: 'pts' | 'msrs' | 'bsts' | 'items' (parts are keyed by uid in part.pts).
function cmpRawInstB(kind, eid) {
  const r = CMP.rootB;
  const list = kind === 'pts' ? arr(r.part && r.part.pts && r.part.pts[CMP.uidB]) : kind === 'msrs' ? arr(r.mushroom && r.mushroom.msrs) : kind === 'bsts' ? arr(r.beast && r.beast.bsts) : arr(r.item && r.item.items);
  return list.find(x => x.eid === eid) || null;
}
// Stores a clone in CMP_EXTRA[kind][newEid] so the build keeps all of B's raw fields.
// remember B's raw instance (uid switched to A's) under the eid it gets in A
function cmpKeepInst(kind, oldEid, newEid) {
  const inst = cmpRawInstB(kind, oldEid);
  if (!inst) return;
  const c = cmpClone(inst);
  c.eid = newEid;
  if ('uid' in c && c.uid === Number(CMP.uidB)) c.uid = Number(cmpUidA());
  CMP_EXTRA[kind][newEid] = c;
}
// Highest FINISHED research level of a part in a research list (0 if none).
function cmpTopFinished(list, ptid) {
  let t = 0;
  for (const r of list) if (r.ptid === ptid && r.research_type === 'FINISHED' && r.lvl > t) t = r.lvl;
  return t;
}
// One-line summary of a fighter for the diff table: class, grade, limit break, level, item and decal counts, state.
function cmpChrSummary(c) {
  if (!c) return '—';
  const items = arr(c.pspts).length + arr(c.psmsrs).length + arr(c.psbsts).length + arr(c.psitems).length;
  return `${CLASS_NAMES[c.type] || c.type} g${c.grade}${c.limit_break ? ' LB' + c.limit_break : ''} · Lv${c.lvl != null ? c.lvl : '?'} · ${items} items · ${arr(c.eqskls).length} decals${c.state && c.state !== 'FREE' ? ' · ' + c.state : ''}`;
}
// Comparison key for a fighter: its JSON without 'state' and without the owning account's uid (on the fighter and
// on anything nested under it), so state-only differences and comparing two different accounts are ignored.
function cmpChrKey(c) {
  const strip = x => { const o = cmpClone(x); delete o.state; return o; };
  return JSON.stringify(strip(c), (k, v) => k === 'uid' ? undefined : v);
}
// Human label for a Reward Box (present) entry: money/SPLithium amounts, or the item/part/decal/mushroom/beast name plus count.
function cmpPresentLabel(p) {
  if (!p) return '?';
  if (p.type === 'MONEY') return `${Number(p.num || 0).toLocaleString()} Kill Coins`;
  if (p.type === 'SPIRIT') return `${Number(p.num || 0).toLocaleString()} SPLithium`;
  const v = p.val0;
  const ptLvl = PT_INDEX[v] && (p.type === 'PT' || String(p.type).startsWith('PTTP_')) ? ' +' + displayFromRaw(PT_INDEX[v], Number(p.val1) || 1) : '';
  const nm = (ITEM_INDEX[v] && itemDisplayName(v)) || (PT_INDEX[v] && PT_INDEX[v].name + ptLvl) || (SKL_INDEX[v] && 'Decal: ' + SKL_INDEX[v].name) || (MSR_INDEX[v] && MSR_INDEX[v].name) || (BST_INDEX[v] && BST_INDEX[v].name) || v || p.kind || p.type;
  return `${nm}${p.num > 1 ? ' ×' + p.num : ''}`;
}
// Label for a Storage Box slot by looking up the instance it points at (part with +level, item, mushroom or beast with cooked state).
function cmpStorageLabel(cl, s) {
  if (s.eptid && s.eptid !== '-1') { const i = arr(cl.pts).find(p => p.eptid === s.eptid); const r = i && PT_INDEX[i.ptid]; return r ? `${r.name} +${displayFromRaw(r, i.lvl)}` : (i ? i.ptid : 'part'); }
  if (s.eitemid && s.eitemid !== '-1') { const i = arr(cl.items).find(p => p.eitemid === s.eitemid); return i ? itemDisplayName(i.itemId) : 'item'; }
  if (s.emsrid && s.emsrid !== '-1') { const i = arr(cl.msrs).find(p => p.emsrid === s.emsrid); return i ? msrDisplayName(i.msrid, i.cooked) : 'mushroom'; }
  if (s.ebstid && s.ebstid !== '-1') { const i = arr(cl.bsts).find(p => p.ebstid === s.ebstid); return i ? bstDisplayName(i.bstid, i.cooked) : 'beast'; }
  return null;
}
// The first real eid referenced by a storage slot ('-1' means empty).
const cmpSlotEid = s => [ s.eptid, s.eitemid, s.emsrid, s.ebstid ].find(e => e && e !== '-1') || '';

// ---- the differences --------------------------------------------------------
// ---- the differences --------------------------------------------------------
// Computes what differs between A (SAVE) and B (adapted): account values, fighters, research (top finished level),
// decal counts, owned Waiting Room decorations, rewards (by pid), storage items (by eid) and a list of other top-level parts.
// Pure read; returns {account, fighters, research, decals, hub, rewards, storage, other}.
function cmpDiff() {
  const A = SAVE, B = CMP.adB, rB = CMP.rootB;
  const d = { account: [], fighters: [], research: [], decals: [], hub: [], rewards: [], storage: [], other: [] };
  for (const [f, label] of CMP_ACCOUNT_FIELDS) {
    const a = A.soul[f], b = B.soul[f];
    if (b !== undefined && JSON.stringify(a) !== JSON.stringify(b)) d.account.push({ key: f, label, a, b });
  }
  const aByCid = {}, bByCid = {};
  for (const c of arr(A.soul.chrs)) aByCid[c.cid] = c;
  for (const c of arr(B.soul.chrs)) bByCid[c.cid] = c;
  for (const cid of new Set(Object.keys(aByCid).concat(Object.keys(bByCid)))) {
    const a = aByCid[cid], b = bByCid[cid];
    if (a && b && cmpChrKey(a) === cmpChrKey(b)) continue;
    d.fighters.push({ key: cid, a, b });
  }
  const resA = arr(A.user_research), resB = arr(B.user_research);
  for (const ptid of new Set(resA.concat(resB).map(r => r.ptid))) {
    const ta = cmpTopFinished(resA, ptid), tb = cmpTopFinished(resB, ptid);
    if (ta !== tb) d.research.push({ key: ptid, a: ta, b: tb });
  }
  const skA = {}, skB = {};
  for (const s of arr(A.soul.psskls)) skA[s.id] = s.cnt || 0;
  for (const s of arr(B.soul.psskls)) skB[s.id] = s.cnt || 0;
  for (const id of new Set(Object.keys(skA).concat(Object.keys(skB)))) if ((skA[id] || 0) !== (skB[id] || 0)) d.decals.push({ key: id, a: skA[id] || 0, b: skB[id] || 0 });
  const hA = {}, hB = {};
  for (const e of arr(A.soul.hubcustom)) hA[e.cstmid] = e;
  for (const e of arr(B.soul.hubcustom)) hB[e.cstmid] = e;
  for (const id of Object.keys(hB)) if (hubOwned(hB[id]) && !hubOwned(hA[id])) d.hub.push({ key: id });
  const pidsA = new Set(arr(A.presents).map(p => p.pid));
  for (const p of arr(B.presents)) if (!pidsA.has(p.pid)) d.rewards.push({ key: p.pid, p });
  const eidsA = new Set(arr(A.cl && A.cl.slots).map(cmpSlotEid).filter(Boolean));
  for (const s of arr(B.cl && B.cl.slots)) { const e = cmpSlotEid(s); if (e && !eidsA.has(e)) d.storage.push({ key: e, s }); }
  // everything else: just say which parts differ
  const rA = RAW_SAV_ROOT;
  const handled = new Set([ 'soul', 'user', 'part', 'mushroom', 'beast', 'item', 'bodyuser', 'playlog' ]);
  for (const k of new Set(Object.keys(rA).concat(Object.keys(rB)))) {
    if (handled.has(k)) continue;
    if (JSON.stringify(rA[k]) !== JSON.stringify(rB[k])) d.other.push(k);
  }
  const soulHandled = new Set([ 'chr', 'deathbag', 'skl', 'partresearch', 'hubcustom', 'present', 'cl', 'modified', ...CMP_ACCOUNT_FIELDS.map(x => x[0]) ]);
  for (const k of new Set(Object.keys(rA.soul || {}).concat(Object.keys(rB.soul || {})))) {
    if (soulHandled.has(k)) continue;
    if (JSON.stringify((rA.soul || {})[k]) !== JSON.stringify((rB.soul || {})[k])) d.other.push('soul.' + k);
  }
  return d;
}

// ---- copying B → A ----------------------------------------------------------
// Copies one account value from B into A.
function cmpCopyAccount(key) {
  SAVE.soul[key] = cmpClone(CMP.adB.soul[key]);
}
// Copies B's research for a part and the earlier parts of its upgrade chain (replacing A's records for them).
// The caller then renormalizes the next-level markers and Funshots.
function cmpCopyResearch(ptid) {
  // copy the part and the earlier parts of its upgrade chain, as B has them
  const chain = chainOf(ptid);
  const upto = chain.slice(0, chain.indexOf(ptid) + 1);
  const resB = arr(CMP.adB.user_research);
  const research = SAVE.user_research;
  for (const id of upto) {
    if (!resB.some(r => r.ptid === id) && id !== ptid) continue;
    for (let i = research.length - 1; i >= 0; i--) if (research[i].ptid === id) research.splice(i, 1);
    for (const r of resB) if (r.ptid === id) research.push(cmpClone(r));
  }
}
// Sets A's decal stock count for a decal to B's count (creating the entry if needed).
function cmpCopyDecal(id) {
  const b = arr(CMP.adB.soul.psskls).find(s => s.id === id);
  SAVE.soul.psskls = arr(SAVE.soul.psskls);
  let a = SAVE.soul.psskls.find(s => s.id === id);
  if (!a) SAVE.soul.psskls.push(a = { id, lvl: 1, cnt: 0, is_checked: 1 });
  a.cnt = b ? b.cnt : 0;
}
// Marks a Waiting Room decoration as owned in A (flg = 2).
function cmpCopyHub(id) {
  const list = SAVE.soul.hubcustom;
  let e = list.find(x => x.cstmid === id);
  if (!e) list.push(e = { cstmid: id, flg: 0 });
  e.flg = 2;
}
// Adds B's reward-box entry to A unless A already has that pid.
function cmpCopyReward(pid) {
  const p = arr(CMP.adB.presents).find(x => x.pid === pid);
  if (p && !SAVE.presents.some(x => x.pid === pid)) SAVE.presents.push(cmpClone(p));
}
// Copies a Storage Box item from B into a free A slot, giving it a new uuid if the eid is already used in A.
// Returns an error string ('not found' / box full) or null on success.
function cmpCopyStorage(eid) {
  const clB = CMP.adB.cl, clA = SAVE.cl;
  const sB = arr(clB.slots).find(s => cmpSlotEid(s) === eid);
  if (!sB) return 'not found';
  const idx = storageFreeSlotIndex();
  if (idx < 0) return 'the Storage Box is full';
  const taken = cmpEidsInA();
  const newEid = taken.has(eid) ? presentUuid() : eid;
  const slot = clA.slots[idx];
  for (const [k, list, kind, idKey] of [ [ 'eptid', 'pts', 'pts', 'eptid' ], [ 'eitemid', 'items', 'items', 'eitemid' ], [ 'emsrid', 'msrs', 'msrs', 'emsrid' ], [ 'ebstid', 'bsts', 'bsts', 'ebstid' ] ]) {
    if (sB[k] && sB[k] !== '-1') {
      const inst = arr(clB[list]).find(x => x[idKey] === eid);
      if (inst) { clA[list] = arr(clA[list]); const c = cmpClone(inst); c[idKey] = newEid; clA[list].push(c); }
      slot[k] = newEid;
      cmpKeepInst(kind, eid, newEid);
    } else slot[k] = '-1';
  }
  return null;
}
// Why a fighter in B cannot be copied (missing, dead, DUMMY, kidnapped), or null if copyable.
function cmpFighterBlock(b) {
  if (!b) return 'not in the other save';
  if (b.state === 'ENEMY') return 'dead in the other save (recover it there first)';
  if (b.state === 'DUMMY') return 'not a normal fighter';
  if (b.abid) return 'kidnapped in the other save';
  return null;
}
// Copies fighter `cid` from B into A (replacing A's version, or using a free freezer hanger). Items get new eids when they collide.
// Arrives as FREE. When replacing, the old fighter's leftover items are queued in FIGHTER_DELETES. Returns an error string or null.
function cmpCopyFighter(cid) {
  const b = arr(CMP.adB.soul.chrs).find(c => c.cid === cid);
  const why = cmpFighterBlock(b);
  if (why) return why;
  const aIdx = SAVE.soul.chrs.findIndex(c => c.cid === cid);
  const a = aIdx >= 0 ? SAVE.soul.chrs[aIdx] : null;
  if (!a && !freeHangers().length) return 'no empty hanger in the freezer (raise the freezer level first)';
  if (a && (a.state === 'GUARD' || a.state === 'USE')) return `your ${a.name} is ${a.state === 'GUARD' ? 'on defense' : 'the fighter you are playing'}; change that in game first`;
  // work on a clone of B's fighter, re-owned by A's uid
  const c = cmpClone(b);
  c.uid = Number(cmpUidA());
  if (c.state !== 'FREE') c.state = 'FREE';
  // item ids: keep B's unless they're already used elsewhere in this save
  const taken = cmpEidsInA(cid);
  const remap = {};
  const fix = (kind, idKey, list) => {
    for (const x of arr(list)) {
      const old = x[idKey];
      const neu = taken.has(old) ? presentUuid() : old;
      remap[old] = neu;
      x[idKey] = neu;
      cmpKeepInst(kind, old, neu);
    }
  };
  fix('pts', 'eptid', c.pspts);
  fix('msrs', 'emsrid', c.psmsrs);
  fix('bsts', 'ebstid', c.psbsts);
  fix('items', 'eitemid', c.psitems);
  for (const e of arr(c.eqpts)) if (remap[e.eptid]) e.eptid = remap[e.eptid];
  // keep the other save's Death Bag layout (slot positions and length)
  const bagB = arr(CMP.rootB.soul && CMP.rootB.soul.deathbag && CMP.rootB.soul.deathbag[CMP.uidB] && CMP.rootB.soul.deathbag[CMP.uidB][cid]);
  if (bagB.length) CMP_EXTRA.bags[cid] = bagB.map(s => Object.assign({}, s, s && s.eid && remap[s.eid] ? { eid: remap[s.eid] } : {}));
  if (c.armslots) for (const k of Object.keys(c.armslots)) if (remap[c.armslots[k]]) c.armslots[k] = remap[c.armslots[k]];
  if (a) {
    // replacing: the old fighter's items that the copy doesn't carry are removed
    const keep = new Set(Object.values(remap));
    if (FIGHTER_DELETES.root !== RAW_SAV_ROOT) FIGHTER_DELETES = { root: RAW_SAV_ROOT, cids: new Set, eids: new Set };
    for (const p of arr(a.pspts)) if (!keep.has(p.eptid)) FIGHTER_DELETES.eids.add(p.eptid);
    for (const m of arr(a.psmsrs)) if (!keep.has(m.emsrid)) FIGHTER_DELETES.eids.add(m.emsrid);
    for (const x of arr(a.psbsts)) if (!keep.has(x.ebstid)) FIGHTER_DELETES.eids.add(x.ebstid);
    for (const x of arr(a.psitems)) if (!keep.has(x.eitemid)) FIGHTER_DELETES.eids.add(x.eitemid);
    SAVE.soul.chrs[aIdx] = c;
  } else {
    // a fighter deleted earlier in this session and copied back isn't "deleted" any more
    if (FIGHTER_DELETES.root === RAW_SAV_ROOT) FIGHTER_DELETES.cids.delete(c.cid);
    // same hanger as in the other save when it's free here, else the first empty one
    const slotB = arr(CMP.adB.soul.chrslots).find(h => h && h.cid === cid);
    const same = slotB && arr(SAVE.soul.chrslots).find(h => h && h.slot === slotB.slot && h.cid === '');
    (same || freeHangers()[0]).cid = c.cid;
    SAVE.soul.chrs.push(c);
    SAVE.soul.chrs.sort((x, y) => String(x.cid).localeCompare(String(y.cid)));
  }
  return null;
}

// ==== Clone the whole second save onto this account ====
// ---- clone the whole second save onto this account ----------------------------
// Everything comes from the second save (fighters, gear, research, decals, money,
// quests, flags, settings...). Only the account itself stays: the uid everywhere
// the save is keyed by it, plus the account name, Steam/PSN ids and login ids.
// The clone is then loaded as if it were opened from a file, so every tab, the
// save check and the download work on it as usual. Nothing is written until you
// download, and neither original file is changed.
// Notice text shown after a clone, tied to the root it describes.
let CLONE_NOTE = { root: null, text: '' };
// Two-click confirmation flag for the clone button (auto-disarms after 8 s).
let CLONE_ARMED = false;
// PlayStation saves: PS-only content belongs there, so the "Include PS-only" boxes start ticked
// and the save check / clone notes don't warn about it. PC saves start with them unticked.
// True when the loaded save is from PlayStation (see savePlatform).
function isPsSave() { return savePlatform(RAW_SAV_ROOT) === 'PS'; }
// Platform-specific defaults: PS saves start with the 'Include PS-only' options ticked, PC saves unticked.
function applyPlatformDefaults() {
  const ps = isPsSave();
  RESEARCH_FORM.includePs = DECAL_FORM.includePs = RB_FORM.includePs = HUB_FORM.includePs = ps;
  STAMP_ELIGIBLE_SET = null;
}
// Label suffix for PS-only options.
const psLabelNote = () => isPsSave() ? '(PlayStation save)' : '(modded PC games)';
// Guesses the platform from user ids: a 17-digit Steam id starting 7656119 in psnacid means PC; any other psnacid/olid means PS; else '?'.
function savePlatform(root) {
  const u = (root && root.user) || {};
  if (/^7656119\d{10}$/.test(String(u.psnacid || ''))) return 'PC';
  if (u.olid || u.psnacid) return 'PS';
  return '?';
}
// Display name for a platform code.
const platformName = p => p === 'PC' ? 'PC (Steam)' : p === 'PS' ? 'PlayStation' : 'unknown platform';
// Lists PlayStation-only content (platform === 1 in masters.db) in an adapted save, grouped as [{where, names}].
// PlayStation-only things in an adapted save, grouped by where they are
function psOnlyContent(ad) {
  const out = [];
  const ptPs = id => PT_INDEX[id] && Number(PT_INDEX[id].platform) === 1;
  const sklPs = id => SKL_INDEX[id] && Number(SKL_INDEX[id].platform) === 1;
  const ptName = id => (PT_INDEX[id] && PT_INDEX[id].name) || id;
  const add = (where, names) => { if (names.length) out.push({ where, names }); };
  for (const c of arr(ad.soul && ad.soul.chrs)) {
    if (c.state === 'DUMMY') continue;
    add(`${c.name || 'fighter'}'s gear and Death Bag`, arr(c.pspts).filter(p => ptPs(p.ptid)).map(p => ptName(p.ptid)));
    add(`${c.name || 'fighter'}'s equipped decals`, arr(c.eqskls).map(x => x.id || x.sklid).filter(sklPs).map(id => SKL_INDEX[id].name));
  }
  add('Storage Box', arr(ad.cl && ad.cl.pts).filter(p => ptPs(p.ptid)).map(p => ptName(p.ptid)));
  add('Decal stock (Decals tab)', arr(ad.soul && ad.soul.psskls).filter(x => x.cnt > 0 && sklPs(x.id)).map(x => `${SKL_INDEX[x.id].name} ×${x.cnt}`));
  const res = new Set(arr(ad.user_research).filter(r => r.research_type === 'FINISHED' && ptPs(r.ptid)).map(r => r.ptid));
  add('Research', [ ...new Set([ ...res ].map(ptName)) ]);
  const meta = hubMeta();
  add('Waiting Room decorations', arr(ad.soul && ad.soul.hubcustom).filter(e => hubOwned(e) && meta[e.cstmid] && Number(meta[e.cstmid].platform) === 1).map(e => resolveName(meta[e.cstmid].name) || e.cstmid));
  add('Reward Box', arr(ad.presents).filter(p => {
    const t = String(p.type || ''), v = p.val0;
    if (t === 'SKILL') return sklPs(v);
    if (t === 'PT' || t.startsWith('PTTP_')) return ptPs(v);
    if (t === 'ITTP_RMAP') return ptPs('PT_' + String(v).replace(/^ITMP_/, '').replace(/U$/, ''));
    return false;
  }).map(cmpPresentLabel));
  return out;
}
// Builds the raw JSON of the clone: B's whole save, re-keyed to A's uid, with A's identity fields (uid, name, platform ids,
// login ids) kept, and B's name in its zombies replaced by A's.
function cmpBuildClone() {
  const A = RAW_SAV_ROOT, uA = cmpUidA(), uB = CMP.uidB;
  const root = cmpClone(CMP.rootB);
  const nmB = (root.user || {}).nm;
  if (uA && uB && uA !== uB) cmpRekeyUid(root, uB, uA, 0);
  const ua = A.user || {};
  root.user = root.user || {};
  for (const f of [ 'uid', ...CMP_IDENTITY_FIELDS ]) {
    if (f in ua) root.user[f] = cmpClone(ua[f]);
    else delete root.user[f];
  }
  // the save's own zombies carry the player's name
  const zm = root.zombie && root.zombie.zmbs;
  if (zm && nmB && ua.nm != null) for (const k of Object.keys(zm)) for (const z of arr(zm[k])) if (z && z.name === nmB) z.name = ua.nm;
  return root;
}
// Replaces the edited save with a clone of B on A's account. It builds the clone, feeds it through the normal file input
// as if the user opened a file, waits for the load, then shows notes (PS-only content, leftover uid values).
// Nothing is written until download.
async function cmpCloneWhole() {
  const nmA = (RAW_SAV_ROOT.user || {}).nm || 'this account', uA = cmpUidA();
  const platA = savePlatform(RAW_SAV_ROOT), platB = savePlatform(CMP.rootB);
  const fileB = CMP.file, nmB = (CMP.rootB.user || {}).nm || 'other save';
  const ps = psOnlyContent(CMP.adB);
  const root = cmpBuildClone();
  const left = JSON.stringify(root).split('"' + CMP.uidB + '"').length - 1;
  const file = new File([ JSON.stringify(root) ], `clone of ${fileB.replace(/\.(sav|json)$/i, '')}.json`, { type: 'application/json' });
  // reuse the normal load path by injecting the clone as a File into the hidden file input
  const inp = document.getElementById('file-save');
  const dt = new DataTransfer();
  dt.items.add(file);
  inp.files = dt.files;
  const before = RAW_SAV_ROOT, origBefore = ORIG_SAVE;
  inp.dispatchEvent(new Event('change'));
  // wait up to ~10 s for the async load to swap RAW_SAV_ROOT
  for (let i = 0; i < 200 && RAW_SAV_ROOT === before; i++) await new Promise(r => setTimeout(r, 50));
  if (RAW_SAV_ROOT === before) { toast('The clone could not be loaded', true); return; }
  // the pre-download review compares against the save you had loaded, so it shows what the clone replaces
  ORIG_SAVE = Object.assign({}, origBefore, { root: RAW_SAV_ROOT });
  let t = `This save is now a full copy of ${fileB} (${nmB}, ${platformName(platB)}) on ${nmA}'s account (uid ${uA}, ${platformName(platA)}). Nothing is written until you download the .sav; both original files are unchanged.`;
  if (left) t += `\nNote: the other account's uid still appears ${left} time${left === 1 ? '' : 's'} as a plain value (not a uid field) -- usually harmless.`;
  if (platB === 'PS' && platA !== 'PS') t += `\n\nWARNING: the cloned save is a PlayStation save.${ps.length ? ' It has PlayStation-only content that an unmodded PC game doesn\'t have -- it may not show up or may cause problems:' : ' No PlayStation-only weapons, armor, decals, research, decorations or rewards were found in it.'}`;
  else if (ps.length && platA !== 'PS') t += '\n\nIt has PlayStation-only content that an unmodded PC game doesn\'t have:';
  if (platA !== 'PS') for (const g of ps) t += `\n  - ${g.where}: ${g.names.slice(0, 12).join(', ')}${g.names.length > 12 ? ` and ${g.names.length - 12} more` : ''}`;
  if (ps.length && platA !== 'PS') t += '\nTo clean up: Decals tab "Set them to 0", the save check\'s Reward Box fix, and remove PS-only gear from the fighters and Storage Box tabs.';
  CLONE_NOTE = { root: RAW_SAV_ROOT, text: t };
  activeTab = 'compare';
  renderAll();
  toast(`Cloned ${fileB} onto ${nmA}'s account -- check it, then download`);
}
// HTML for the 'Clone the whole save' box, including a PS-only content warning when cloning a PS save onto PC.
function cloneBlockHtml() {
  const nmA = (RAW_SAV_ROOT.user || {}).nm || 'this save', nmB = (CMP.rootB.user || {}).nm || 'other save';
  const platA = savePlatform(RAW_SAV_ROOT), platB = savePlatform(CMP.rootB);
  const ps = psOnlyContent(CMP.adB);
  const psCount = ps.reduce((n, g) => n + g.names.length, 0);
  let warn = '';
  if (platB === 'PS' && platA !== 'PS') warn = `<div class="warnNote" style="margin:6px 0;"><b>${escapeHtml(nmB)}'s save is a PlayStation save</b> and this account is ${platformName(platA)}. ${psCount ? `It has ${psCount} PlayStation-only thing${psCount === 1 ? '' : 's'} an unmodded PC game doesn't have (${ps.map(g => escapeHtml(g.where)).slice(0, 5).join('; ')}${ps.length > 5 ? '…' : ''}). They'll be listed after cloning so you can clean them up.` : 'No PlayStation-only weapons, armor, decals, research, decorations or rewards were found in it.'}</div>`;
  else if (psCount && platA !== 'PS') warn = `<div class="warnNote" style="margin:6px 0;">${escapeHtml(nmB)}'s save has ${psCount} PlayStation-only thing${psCount === 1 ? '' : 's'} an unmodded PC game doesn't have. They'll be listed after cloning.</div>`;
  return `<div class="subDetails" style="padding:10px; margin-bottom:12px;"><div class="eyebrow" style="margin-bottom:6px;">Clone the whole save</div>
    <div class="capNote" style="margin-top:0;">Replace everything in the save you're editing with <b>${escapeHtml(nmB)}</b>'s save (${platformName(platB)}): fighters, gear, research, decals, money, quests, settings and flags. Only the account stays <b>${escapeHtml(nmA)}</b>'s (uid ${escapeHtml(cmpUidA())}, ${platformName(platA)}): the account id is moved everywhere the save uses it, and the name, Steam/PSN ids and login ids are kept. Changes you made to this save that you haven't downloaded are lost. Nothing is written until you download.</div>
    ${warn}
    <button class="action" id="cmp-clone">${CLONE_ARMED ? 'Click again to replace this save with the clone' : `Clone ${escapeHtml(nmB)}'s save onto ${escapeHtml(nmA)}'s account`}</button></div>`;
}

// ---- UI ---------------------------------------------------------------------
// ---- UI ---------------------------------------------------------------------
// HTML shell for the Compare & Copy tab; filled by renderCompare().
function blockCompare() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Two saves</div><h2>Compare &amp; Copy</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Load a second save to see what differs from the one you're editing, and copy the parts you tick into it. The second save is only read, never changed. Keep backups of both.</div>
      <div id="cmp-body"></div>
    </div>
  </section>`;
}

// Renders the compare tab: file loader, clone box, account selector and one collapsible table per difference section
// (tick-and-copy). Fighters that cannot be copied are shown with disabled checkboxes and a reason.
function renderCompare() {
  const host = document.getElementById('cmp-body');
  if (!host || !SAVE || !RAW_SAV_ROOT) return;   // a new save is still loading
  cmpSync();
  const uA = cmpUidA(), nmA = (RAW_SAV_ROOT.user || {}).nm || 'this save';
  let h = `<div class="toolbar"><label class="subtle" style="cursor:pointer; padding:6px 10px; border:1px solid var(--panel-border);">Load second save (.sav or .json)<input type="file" id="cmp-file" accept=".sav,.json" style="display:none;"></label>
    <span class="count">${CMP.rootB ? `Comparing with <b>${escapeHtml(CMP.file)}</b>` : 'No second save loaded'}</span></div>`;
  if (CLONE_NOTE.root === RAW_SAV_ROOT && CLONE_NOTE.text) h += `<pre class="stewLog"${/WARNING|PlayStation-only/.test(CLONE_NOTE.text) ? ' style="border-color:var(--accent);"' : ''}>${escapeHtml(CLONE_NOTE.text)}</pre>`;
  if (CMP.msg) h += `<pre class="stewLog">${escapeHtml(CMP.msg)}</pre>`;
  if (!CMP.rootB) { host.innerHTML = h; cmpWire(); return; }
  h += cloneBlockHtml();
  const nmB = (CMP.rootB.user || {}).nm || 'other save';
  const same = uA === CMP.uidB;
  h += `<div class="subDetails" style="padding:10px; margin-bottom:12px;"><div class="field" style="max-width:520px;"><label>The downloaded save belongs to</label>
    <select id="cmp-account" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);" ${same ? 'disabled' : ''}>
      <option value="A" ${CMP.account === 'A' ? 'selected' : ''}>${escapeHtml(nmA)} (uid ${escapeHtml(uA)}) — the save you're editing</option>
      <option value="B" ${CMP.account === 'B' ? 'selected' : ''}>${escapeHtml(nmB)} (uid ${escapeHtml(CMP.uidB)}) — the second save's account</option>
    </select></div>
    <div class="capNote">${same ? 'Both saves are the same account.' : CMP.account === 'B' ? `On download, every part of the save tied to uid ${escapeHtml(uA)} is moved to uid ${escapeHtml(CMP.uidB)}, and the account name, Steam ID and login ids are taken from ${escapeHtml(nmB)}'s save. Use this to put this save's progress on that account.` : `The save keeps ${escapeHtml(nmA)}'s account. Pick the other account to move this save's progress onto it.`}</div></div>`;
  const d = cmpDiff();
  const sect = (id, title, rows, head, rowHtml, note) => {
    h += `<details class="subDetails" style="margin-bottom:10px;" ${rows.length && rows.length <= 40 ? 'open' : ''}><summary>▸ ${title} (${rows.length} difference${rows.length === 1 ? '' : 's'})</summary><div class="subDetailsBody">`;
    if (!rows.length) { h += '<div class="dtRel">Same in both saves.</div></div></details>'; return; }
    if (note) h += `<div class="capNote" style="margin-top:0;">${note}</div>`;
    h += `<div class="toolbar" style="margin:4px 0;"><button class="subtle" data-cmp-all="${id}">Tick all</button><button class="subtle" data-cmp-none="${id}">Untick all</button><span style="flex:1;"></span><button class="action" data-cmp-copy="${id}">Copy ticked from ${escapeHtml(nmB)}'s save</button></div>`;
    h += `<table class="stewTable"><thead><tr><th></th>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>`;
    h += rows.map(r => `<tr><td><input type="checkbox" data-cmp-sec="${id}" data-cmp-key="${escapeHtml(r.key)}" ${r.disabled ? `disabled title="${escapeHtml(r.disabled)}"` : ''}></td>${rowHtml(r).map(x => `<td>${x}</td>`).join('')}</tr>`).join('');
    h += '</tbody></table></div></details>';
  };
  const fmt = v => typeof v === 'number' ? v.toLocaleString() : escapeHtml(v == null ? '—' : String(v));
  sect('account', 'Account values', d.account, [ 'Value', 'This save', nmB ], r => [ escapeHtml(r.label), fmt(r.a), fmt(r.b) ]);
  for (const r of d.fighters) {
    if (!r.b) r.disabled = 'only in this save';
    else r.disabled = cmpFighterBlock(r.b) || (r.a && (r.a.state === 'GUARD' || r.a.state === 'USE') ? `your copy is ${r.a.state === 'GUARD' ? 'on defense' : 'being played'}` : null) || (!r.a && !freeHangers().length ? 'no empty hanger' : null);
  }
  sect('fighters', 'Fighters', d.fighters, [ 'Fighter', 'This save', nmB ], r => [ escapeHtml((r.b || r.a).name || '?'), escapeHtml(cmpChrSummary(r.a)), escapeHtml(cmpChrSummary(r.b)) ],
    `Copying a fighter brings its stats, gear, Death Bag and equipped decals. A fighter that exists in both saves is replaced; a new one goes into the first empty hanger (${freeHangers().length} empty now). Copied fighters arrive as free (not on defense, not selected). Equipped decals are copied as they are; your decal stock isn't changed.`);
  const resName = id => (PT_INDEX[id] && PT_INDEX[id].name) || id;
  const lvl = (id, t) => t ? '+' + displayFromRaw(PT_INDEX[id], t) : 'not researched';
  sect('research', 'Research', d.research, [ 'Blueprint', 'This save', nmB ], r => [ escapeHtml(resName(r.key)), lvl(r.key, r.a), lvl(r.key, r.b) ], 'Copying a blueprint also copies the earlier parts of its upgrade chain as the other save has them. The "next level" markers and research stamps are rebuilt afterwards.');
  sect('decals', 'Decal stock', d.decals, [ 'Decal', 'This save', nmB ], r => [ escapeHtml((SKL_INDEX[r.key] || {}).name || r.key), fmt(r.a), fmt(r.b) ]);
  sect('hub', 'Waiting Room decorations', d.hub, [ 'Decoration (owned only in the other save)' ], r => { const m = arr(AP && AP.hubCustom).find(x => x.id === r.key); return [ escapeHtml((m && resolveName(m.name)) || r.key) ]; });
  sect('rewards', 'Reward Box', d.rewards, [ 'Item only in the other save' ], r => [ escapeHtml(cmpPresentLabel(r.p)) ]);
  sect('storage', 'Storage Box', d.storage, [ 'Item only in the other save' ], r => [ escapeHtml(cmpStorageLabel(CMP.adB.cl, r.s) || '?') ], `Copied items go into empty Storage slots (${arr(SAVE.cl.slots).filter(s => !cmpSlotEid(s)).length} empty now).`);
  h += `<details class="subDetails"><summary>▸ Other parts that differ (view only, ${d.other.length})</summary><div class="subDetailsBody">${d.other.length ? d.other.map(k => `<span class="badge" style="margin:2px;">${escapeHtml(k)}</span>`).join('') : '<div class="dtRel">Nothing else differs.</div>'}</div></details>`;
  host.innerHTML = h;
  cmpWire();
}

// Wires the tab: second-save loader, two-click clone, account select, tick-all / none, and the Copy button, which runs the
// right cmpCopyX per ticked key, then renormalizes research/rewards and re-runs the save check.
function cmpWire() {
  const fileInp = document.getElementById('cmp-file');
  if (fileInp) fileInp.addEventListener('change', async () => {
    const f = fileInp.files && fileInp.files[0];
    if (!f) return;
    try { await cmpLoadFile(f); toast(`Loaded ${f.name} for comparing`); } catch (e) { CMP.rootB = null; CMP.adB = null; CMP.msg = `Couldn't read ${f.name}: ${e.message}`; }
    renderCompare();
  });
  const cl = document.getElementById('cmp-clone');
  if (cl) cl.addEventListener('click', () => {
    if (!CLONE_ARMED) { CLONE_ARMED = true; renderCompare(); setTimeout(() => { if (CLONE_ARMED) { CLONE_ARMED = false; if (activeTab === 'compare') renderCompare(); } }, 8000); return; }
    CLONE_ARMED = false;
    cmpCloneWhole();
  });
  const acc = document.getElementById('cmp-account');
  if (acc) acc.addEventListener('change', () => { CMP.account = acc.value; renderCompare(); toast(acc.value === 'B' ? 'The download will use the other save\'s account' : 'The download keeps this save\'s account'); });
  document.querySelectorAll('[data-cmp-all]').forEach(b => b.addEventListener('click', () => document.querySelectorAll(`[data-cmp-sec="${b.dataset.cmpAll}"]:not(:disabled)`).forEach(x => { x.checked = true; })));
  document.querySelectorAll('[data-cmp-none]').forEach(b => b.addEventListener('click', () => document.querySelectorAll(`[data-cmp-sec="${b.dataset.cmpNone}"]`).forEach(x => { x.checked = false; })));
  document.querySelectorAll('[data-cmp-copy]').forEach(b => b.addEventListener('click', () => {
    const sec = b.dataset.cmpCopy;
    const keys = [ ...document.querySelectorAll(`[data-cmp-sec="${sec}"]:checked`) ].map(x => x.dataset.cmpKey);
    if (!keys.length) { toast('Tick something to copy first', true); return; }
    const fails = [];
    let n = 0;
    for (const k of keys) {
      let err = null;
      if (sec === 'account') cmpCopyAccount(k);
      else if (sec === 'fighters') err = cmpCopyFighter(k);
      else if (sec === 'research') cmpCopyResearch(k);
      else if (sec === 'decals') cmpCopyDecal(k);
      else if (sec === 'hub') cmpCopyHub(k);
      else if (sec === 'rewards') cmpCopyReward(k);
      else if (sec === 'storage') err = cmpCopyStorage(k);
      if (err) fails.push(`${k}: ${err}`); else n++;
    }
    if (sec === 'research') { normalizeResearchMarkers(SAVE.user_research); syncStampFromResearch(); }
    if (sec === 'rewards') normalizePresents(SAVE.presents);
    CMP.msg = `Copied ${n} ${sec} difference${n === 1 ? '' : 's'} from ${CMP.file}. Download the .sav to keep it.${fails.length ? '\nNot copied:\n' + fails.join('\n') : ''}`;
    runSaveCheck();
    renderAll();
    toast(`Copied ${n}${fails.length ? `, ${fails.length} skipped` : ''}`, !!fails.length);
  }));
}

// Tab hook: render only when the Compare tab is active.
function wireCompare() { if (activeTab === 'compare') renderCompare(); }

// ---------------------------------------------------------------------------
// DEFENSE (Tokyo Death Metro). From real saves:
//   root.fortzmbsetting = the defense lineup, one entry per defender:
//     {wave 0|1, order 0.., cid, body, grade, type, lvl, max_limit_break, is_equip_whistle}
//     ({} when nobody is set). Every defender's chr.state is "GUARD".
//   soul.whistle_id    = the alarm bought (master_fort_whistle, e.g. ALARM_OC003_05)
//   soul.whistle_limit = when the alarm runs out (unix time). Each purchase gives
//     WHISTLE_AVAILABLE_SECOND (1 day); the most it can hold is
//     WHISTLE_AVAILABLE_SECOND_LIMIT (5 days) -- master_const_int.
//   is_equip_whistle   = the defender the alarm is set on (Set an alarm to a fighter)
//   soul.abduct_guard_time = kidnap protection end (ABDUCT_GUARD_TIME = 12 h)
// Lineups in saves use 2 waves with order 0-4 (5 places), seen in the attack
// lineups (fortorder) of the same game.
// ---------------------------------------------------------------------------

// Lineup geometry: 2 waves of 5 places, but at most 9 defenders in total.
const DEF_WAVES = 2, DEF_SLOTS = 5, DEF_MAX = 9;   // 9 defenders at most: one wave has 5, the other 4
// Defense tab state: last status message, reset when another save is loaded.
let DEF_STATE = { root: null, msg: '' };

// Reads an integer constant from master_const_int (AP.constInt) with a fallback.
function defConst(id, fb) { const r = arr(AP && AP.constInt).find(x => x.id === id); return r ? Number(r.value) : fb; }
// The lineup array (SAVE.fortsetting), coerced to an array ({} when empty in raw saves).
function defLineup() { SAVE.fortsetting = arr(SAVE.fortsetting); return SAVE.fortsetting; }
// Fighter by cid, or null.
function defChr(cid) { return arr(SAVE.soul.chrs).find(c => c.cid === cid) || null; }
// A fighter can defend when FREE or already GUARD, and not kidnapped (abid).
function defEligible(c) { return c && (c.state === 'FREE' || c.state === 'GUARD') && !c.abid; }
// Unlocks (the game's own rules):
//   Tokyo Death Metro / defense opens once soul.is_fort_ready = 1 (after the mid-boss COEN).
//   Each alarm is sold once the deepest floor reached (playlog.base.max_floor) is at least
//   its master_fort_whistle.shop_open_floor.
// Defense unlocked flag; deepest floor reached; alarm row/unlock helpers.
function defUnlocked() { const v = SAVE && SAVE.soul && SAVE.soul.is_fort_ready; return v == null ? true : Number(v) === 1; }
function defMaxFloor() { const b = SAVE && SAVE.playlog && SAVE.playlog[0] && SAVE.playlog[0].base; return b ? Number(b.max_floor) || 0 : 0; }
function defAlarmRow(id) { return arr(AP && AP.fortWhistle).find(x => x.id === id) || null; }
function defAlarmOpen(id) { const w = defAlarmRow(id); return !!w && Number(w.shop_open_floor || 0) <= defMaxFloor(); }
// Display name of an alarm: localized group name plus level, or the id.
function defAlarmName(id) {
  const w = arr(AP && AP.fortWhistle).find(x => x.id === id);
  if (!w) return id || 'None';
  return `${resolveName('FORT_TERMINAL.' + w.name) || w.group} Lv${w.lvl}`;
}
// Builds a lineup entry for fighter c at (wave, order), copying class/grade/level and keeping alarm/limit-break from `old`.
function defSnapshot(c, wave, order, old) {
  return Object.assign({}, old || {}, {
    wave, order, cid: c.cid, body: c.body, grade: c.grade, type: c.type,
    lvl: c.lvl != null ? c.lvl : (old && old.lvl) || 1,
    max_limit_break: old && old.max_limit_break != null ? old.max_limit_break : 0,
    is_equip_whistle: old && old.is_equip_whistle ? 1 : 0
  });
}
// Mutates the entries in place (and returns the list); fighters missing from the save are skipped.
// keep the lineup's copies of class/grade/level in step with the fighters
function defRefreshSnapshots(list) {
  for (const e of arr(list)) {
    const c = defChr(e.cid);
    if (!c) continue;
    if (e.body !== c.body) e.body = c.body;
    if (e.grade !== c.grade) e.grade = c.grade;
    if (e.type !== c.type) e.type = c.type;
    if (c.lvl != null && e.lvl !== c.lvl) e.lvl = c.lvl;
  }
  return list;
}
// Places a fighter (or empties with cid '') at (wave, order). Moves the fighter if already in the lineup, frees any replaced
// defender (GUARD to FREE), sets the new one to GUARD, carries the alarm flag along. Returns an error string or null.
function defPlace(wave, order, cid) {
  const list = defLineup();
  const at = list.findIndex(e => e.wave === wave && e.order === order);
  const old = at >= 0 ? list[at] : null;
  if (old && old.cid === cid) return null;
  if (cid) {
    const c = defChr(cid);
    if (!defEligible(c)) return `${(c && c.name) || 'That fighter'} can't defend (${c ? c.state : 'not found'})`;
    // a fighter can only be in one place
    const prev = list.findIndex(e => e.cid === cid);
    if (prev < 0 && !old && list.length >= DEF_MAX) return `Only ${DEF_MAX} fighters can defend (one wave 5, the other 4). Empty a place first.`;
    let carried = 0;
    if (prev >= 0) { carried = list[prev].is_equip_whistle ? 1 : 0; list.splice(prev, 1); }
    const at2 = list.findIndex(e => e.wave === wave && e.order === order);
    const replaced = at2 >= 0 ? list.splice(at2, 1)[0] : null;
    if (replaced) { const rc = defChr(replaced.cid); if (rc && rc.state === 'GUARD') rc.state = 'FREE'; }
    const e = defSnapshot(c, wave, order, replaced || null);
    e.is_equip_whistle = carried || (replaced && replaced.is_equip_whistle) ? 1 : 0;
    list.push(e);
    c.state = 'GUARD';
  } else if (old) {
    list.splice(at, 1);
    const oc = defChr(old.cid);
    if (oc && oc.state === 'GUARD') oc.state = 'FREE';
  }
  list.sort((a, b) => a.wave - b.wave || a.order - b.order);
  return null;
}
// Puts the alarm on exactly one defender (cid '' clears it).
function defSetAlarmHolder(cid) {
  for (const e of defLineup()) e.is_equip_whistle = e.cid === cid ? 1 : 0;
}

// HTML shell for the Defense tab; filled by renderDefense().
function blockDefense() {
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Tokyo Death Metro</div><h2>Defense</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">Defense lineup, alarm and kidnap protection. Defenders are set to "on defense" in the freezer, and taken off defense when removed. Not yet confirmed in game; keep a backup.</div>
      <div id="def-body"></div>
    </div>
  </section>`;
}

// Renders alarm, lineup and kidnap-protection controls, then wires them. Times are unix seconds; 'max' actions use
// master_const_int values (alarm up to 5 days, one purchase 1 day, kidnap guard 12 h). Locked if is_fort_ready is not 1.
function renderDefense() {
  const host = document.getElementById('def-body');
  if (!host || !SAVE) return;
  if (DEF_STATE.root !== RAW_SAV_ROOT) DEF_STATE = { root: RAW_SAV_ROOT, msg: '' };
  const soul = SAVE.soul, now = Math.floor(Date.now() / 1000);
  if (!defUnlocked()) {
    host.innerHTML = `<div class="capNote" style="margin-top:0;">Tokyo Death Metro isn't unlocked on this save yet (it opens after beating the mid-boss COEN), so defense can't be edited. Play to that point first.</div>`;
    return;
  }
  const list = defRefreshSnapshots(defLineup());
  const maxFlr = defMaxFloor();
  const maxAlarm = defConst('WHISTLE_AVAILABLE_SECOND_LIMIT', 432000), dayAlarm = defConst('WHISTLE_AVAILABLE_SECOND', 86400), kidnap = defConst('ABDUCT_GUARD_TIME', 43200);
  const when = t => t > 0 ? `${escapeHtml(dtFmt(t))} (${t > now ? dtRel(t, now) : 'ended ' + dtRel(t, now)})` : 'not set';
  const sel = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:6px 8px; font-family:var(--mono); font-size:12px;';
  let h = DEF_STATE.msg ? `<pre class="stewLog">${escapeHtml(DEF_STATE.msg)}</pre>` : '';
  // alarm
  const alarms = arr(AP && AP.fortWhistle);
  const holder = list.find(e => e.is_equip_whistle);
  h += `<div class="subDetails" style="padding:10px; margin-bottom:12px;"><b>Defense Alarm</b>
    <div class="grid" style="margin-top:8px;">
      <div class="field"><label>Alarm</label><select id="def-alarm" style="width:100%; ${sel}"><option value="" ${!soul.whistle_id ? 'selected' : ''}>None</option>${alarms.map(w => { const open = defAlarmOpen(w.id), cur = w.id === soul.whistle_id; return `<option value="${w.id}" ${cur ? 'selected' : ''} ${open || cur ? '' : 'disabled'}>${escapeHtml(defAlarmName(w.id))}${open ? '' : ` (locked: reach ${w.shop_open_floor}F)`}</option>`; }).join('')}</select></div>
      <div class="field"><label>Runs until</label><div style="padding:7px 0; font-size:12px;">${when(soul.whistle_limit || 0)}</div></div>
      <div class="field"><label>Set on defender</label><select id="def-holder" ${soul.whistle_id ? '' : 'disabled'} style="width:100%; ${sel}"><option value="">Nobody</option>${list.map(e => `<option value="${e.cid}" ${holder && holder.cid === e.cid ? 'selected' : ''}>${escapeHtml((defChr(e.cid) || {}).name || e.cid)}</option>`).join('')}</select></div>
    </div>
    <div class="toolbar"><button class="action" id="def-alarm-max" ${soul.whistle_id ? '' : 'disabled'}>Max time (${Math.round(maxAlarm / 86400)} days from now)</button><button class="subtle" id="def-alarm-day" ${soul.whistle_id ? '' : 'disabled'}>+1 day (one purchase)</button><button class="subtle" id="def-alarm-off">End now</button></div>
    <div class="capNote">Only alarms sold at your deepest floor (${maxFlr}F) can be picked; the rest are greyed out. Time and "Set on defender" need an alarm. The game gives ${Math.round(dayAlarm / 3600)} hours per purchase and holds at most ${Math.round(maxAlarm / 86400)} days. Buying a different alarm in game resets the time.</div></div>`;
  // lineup
  const fighters = arr(soul.chrs).filter(defEligible);
  h += `<div class="subDetails" style="padding:10px; margin-bottom:12px;"><b>Defense Lineup</b> <span class="id">${list.length} of ${DEF_MAX} defenders</span>
    <div class="grid" style="margin-top:8px; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));">`;
  for (let w = 0; w < DEF_WAVES; w++) {
    h += `<div class="field"><label>Wave ${w + 1}</label>`;
    for (let o = 0; o < DEF_SLOTS; o++) {
      const e = list.find(x => x.wave === w && x.order === o);
      const full = !e && list.length >= DEF_MAX;
      h += `<div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;"><span class="id" style="width:18px;">${o + 1}.</span><select data-def-slot="${w}:${o}" ${full ? 'disabled title="9 defenders already set"' : ''} style="flex:1; ${sel}${full ? ' opacity:.4;' : ''}"><option value="">${full ? '— full (9 max) —' : '— empty —'}</option>${fighters.map(c => `<option value="${c.cid}" ${e && e.cid === c.cid ? 'selected' : ''}>${escapeHtml(c.name || '?')} · ${escapeHtml(CLASS_NAMES[c.type] || c.type)} g${c.grade} Lv${c.lvl != null ? c.lvl : '?'}${c.state === 'GUARD' && !(e && e.cid === c.cid) ? ' (in another place)' : ''}</option>`).join('')}${e && !fighters.some(c => c.cid === e.cid) ? `<option value="${e.cid}" selected>${escapeHtml(e.cid)} (not a usable fighter)</option>` : ''}</select>${e && e.is_equip_whistle ? '<span class="badge" title="Alarm is set on this defender">alarm</span>' : ''}</div>`;
    }
    h += '</div>';
  }
  h += `</div><div class="toolbar"><button class="subtle" id="def-clear">Clear lineup</button></div>
    <div class="capNote">Up to ${DEF_MAX} defenders: one wave can have 5 and the other 4 (either way round). Once ${DEF_MAX} are set, the empty place is locked until you empty another. Pick from fighters in the freezer that aren't being played, dead or kidnapped. Choosing a fighter already in the lineup moves it. Removed defenders go back to normal.</div></div>`;
  // kidnap protection
  h += `<div class="subDetails" style="padding:10px;"><b>Kidnap protection</b>
    <div style="font-size:12px; margin:6px 0;">Protected until: ${when(soul.abduct_guard_time || 0)}</div>
    <div class="toolbar"><button class="subtle" id="def-kid-max">Max (${Math.round(kidnap / 3600)} hours from now)</button><button class="subtle" id="def-kid-off">End now</button></div></div>`;
  host.innerHTML = h;

  // redo(): common tail for every control: store message, re-run the save check, re-render everything and toast.
  const redo = msg => { DEF_STATE.msg = msg || ''; runSaveCheck(); renderAll(); if (msg) toast(msg.split('\n')[0]); };
  document.getElementById('def-alarm').addEventListener('change', e => { if (e.target.value && !defAlarmOpen(e.target.value)) { toast('That alarm is not unlocked yet', true); renderDefense(); return; } soul.whistle_id = e.target.value; if (!e.target.value) defSetAlarmHolder(''); if (e.target.value && !(soul.whistle_limit > now)) soul.whistle_limit = now + dayAlarm; redo(e.target.value ? `Alarm set to ${defAlarmName(e.target.value)}.` : 'Alarm removed.'); });
  document.getElementById('def-holder').addEventListener('change', e => { if (!soul.whistle_id) { renderDefense(); return; } defSetAlarmHolder(e.target.value); redo(e.target.value ? `Alarm set on ${(defChr(e.target.value) || {}).name}.` : 'Alarm not set on any defender.'); });
  document.getElementById('def-alarm-max').addEventListener('click', () => { if (!soul.whistle_id) return; soul.whistle_limit = now + maxAlarm; redo(`Alarm runs until ${dtFmt(soul.whistle_limit)} (the ${Math.round(maxAlarm / 86400)}-day max).`); });
  document.getElementById('def-alarm-day').addEventListener('click', () => { if (!soul.whistle_id) return; soul.whistle_limit = Math.min(Math.max(soul.whistle_limit || 0, now) + dayAlarm, now + maxAlarm); redo(`Alarm runs until ${dtFmt(soul.whistle_limit)}.`); });
  document.getElementById('def-alarm-off').addEventListener('click', () => { soul.whistle_limit = now - 60; redo('Alarm time ended.'); });
  document.getElementById('def-kid-max').addEventListener('click', () => { soul.abduct_guard_time = now + kidnap; redo(`Kidnap protection until ${dtFmt(soul.abduct_guard_time)}.`); });
  document.getElementById('def-kid-off').addEventListener('click', () => { soul.abduct_guard_time = now - 60; redo('Kidnap protection ended.'); });
  document.getElementById('def-clear').addEventListener('click', () => {
    for (const e of defLineup().slice()) defPlace(e.wave, e.order, '');
    redo('Defense lineup cleared.');
  });
  host.querySelectorAll('[data-def-slot]').forEach(s => s.addEventListener('change', () => {
    const [w, o] = s.dataset.defSlot.split(':').map(Number);
    const err = defPlace(w, o, s.value);
    if (err) { toast(err, true); renderDefense(); return; }
    redo(s.value ? `${(defChr(s.value) || {}).name} defends wave ${w + 1}, place ${o + 1}.` : `Wave ${w + 1}, place ${o + 1} emptied.`);
  }));
}

function wireDefense() { if (activeTab === 'defense') renderDefense(); }

