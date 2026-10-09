// ==== Editor shape -> game JSON (download path) ====
/**
 * Build the JSON root to write back to the .sav: deep-clone the pristine raw root and merge every edit
 * from SAVE into it, so fields the editor does not understand are preserved untouched.
 *
 * Roughly the inverse of adaptFullDumpToLegacyShape: fighters are split back into soul.chr, bodyuser,
 * skl.eqskl; instance rows (part/mushroom/beast/item) for every fighter and the Storage Box are
 * rebuilt while rows not owned by the editor are preserved; Death Bags are laid out again keeping the
 * game's original slot positions; prison/VIP/research/user/team/defense settings are merged; and
 * empty-shape and ordering quirks are kept so the diff against the original stays small.
 *
 * @param {object} SAVE      the editor's working copy (shadows the global on purpose)
 * @param {object} rawRoot   untouched parsed save (RAW_SAV_ROOT)
 * @param {string} mainUid   account uid key used under bodyuser/part/deathbag/etc.
 * @returns {object} new root (rawRoot is not mutated)
 */
function buildRawSavRootFromSave(SAVE, rawRoot, mainUid) {
  // the on-screen placeholder fighter of a save with no fighters (see startSave) is never written
  if (arr(SAVE.soul && SAVE.soul.chrs).some(c => c && c.__placeholder)) {
    const chrs = SAVE.soul.chrs.filter(c => !(c && c.__placeholder));
    SAVE = Object.assign({}, SAVE, { soul: Object.assign({}, SAVE.soul, { chrs, crntcid: chrs.some(c => c.cid === SAVE.soul.crntcid) ? SAVE.soul.crntcid : '' }) });
  }
  // work on a deep copy so the raw root stays pristine
  const root = JSON.parse(JSON.stringify(rawRoot));
  const now = Math.floor(Date.now() / 1e3);
  // start from raw soul overlaid with the editor's soul; editor-only keys are deleted again at the end
  root.soul = Object.assign({}, root.soul, SAVE.soul);
  root.soul.chr = root.soul.chr || {};
  // soul.chr.chrs[uid] <- fighters, with the nested/derived fields stripped (they live elsewhere in the real save)
  root.soul.chr.chrs = Object.assign({}, root.soul.chr.chrs, {
    [mainUid]: SAVE.soul.chrs.map(c => {
      const c2 = Object.assign({}, c);
      delete c2.lvl;
      delete c2.bodylvl;
      delete c2.bodybonus;
      delete c2.rage;
      delete c2.pspts;
      delete c2.eqpts;
      delete c2.psmsrs;
      delete c2.psbsts;
      delete c2.psitems;
      delete c2.eqskls;
      delete c2.armslots;
      return c2;
    })
  });
  // fighter slot order (soul.chr.slots)
  root.soul.chr.slots = Object.assign({}, root.soul.chr.slots, {
    [mainUid]: SAVE.soul.chrslots
  });
  // bodyuser rows: stats come from bodylvl/bodybonus; fall back to the old row, then to 1/0
  const oldBodyuserByCid = {};
  for (const b of arr(root.bodyuser && root.bodyuser[mainUid])) oldBodyuserByCid[b.cid] = b;
  root.bodyuser = root.bodyuser || {};
  root.bodyuser[mainUid] = SAVE.soul.chrs.map(c => {
    const bl = c.bodylvl || {}, bb = c.bodybonus || {};
    const old = oldBodyuserByCid[c.cid] || {};
    return {
      uid: Number(mainUid),
      cid: c.cid,
      lvl: c.lvl != null ? c.lvl : old.lvl || 1,
      hp: bl.hp != null ? bl.hp : old.hp || 1,
      str: bl.str != null ? bl.str : old.str || 1,
      dex: bl.dex != null ? bl.dex : old.dex || 1,
      vit: bl.vit != null ? bl.vit : old.vit || 1,
      stm: bl.stm != null ? bl.stm : old.stm || 1,
      luk: bl.luk != null ? bl.luk : old.luk || 1,
      skill: bl.skill != null ? bl.skill : old.skill || 0,
      bag: bl.bag != null ? bl.bag : old.bag || 0,
      rage: c.rage != null ? c.rage : old.rage || 0,
      hp_bonus: bb.hp_bonus || 0,
      str_bonus: bb.str_bonus || 0,
      dex_bonus: bb.dex_bonus || 0,
      vit_bonus: bb.vit_bonus || 0,
      stm_bonus: bb.stm_bonus || 0,
      luk_bonus: bb.luk_bonus || 0
    };
  });
  // equipped decals (skl.eqskl): flatten per fighter, then restore the game's original order
  root.soul.skl = root.soul.skl || {};
  root.soul.skl.eqskl = root.soul.skl.eqskl || {};
  const newEqskl = [];
  for (const c of SAVE.soul.chrs) {
    for (const e of c.eqskls || []) {
      const sklid = e.sklid || e.id;
      if (sklid) newEqskl.push({
        cid: c.cid,
        sklid: sklid,
        slot: e.slot != null ? e.slot : 0
      });
    }
  }
  // keep the game's order (the rebuild above groups decals by fighter); new or changed ones go last
  const eqsklKey = e => `${e.cid}|${e.slot}|${e.sklid}`;
  const eqsklAt = new Map(arr(root.soul.skl.eqskl[mainUid]).map((e, i) => [ eqsklKey(e), i ]));
  const eqsklPos = e => eqsklAt.has(eqsklKey(e)) ? eqsklAt.get(eqsklKey(e)) : Number.MAX_SAFE_INTEGER;
  root.soul.skl.eqskl[mainUid] = newEqskl.map((e, i) => [ e, i ]).sort((a, b) => eqsklPos(a[0]) - eqsklPos(b[0]) || a[1] - b[1]).map(x => x[0]);
  // passive skills (psskl): keep the old 'updated' timestamp when the skill already existed
  const oldPssklBySklid = {};
  for (const s of arr(root.soul.skl.psskl)) oldPssklBySklid[s.sklid] = s;
  root.soul.skl.psskl = (SAVE.soul.psskls || []).map(e => {
    const old = oldPssklBySklid[e.id];
    return {
      sklid: e.id,
      cnt: e.cnt,
      updated: old ? old.updated : now,
      is_checked: e.is_checked ? 1 : 0
    };
  });
  // make sure the containers for instance tables exist
  root.part = root.part || {};
  root.part.pts = root.part.pts || {};
  root.mushroom = root.mushroom || {};
  root.beast = root.beast || {};
  root.item = root.item || {};
  // eids of every instance the editor now owns (fighters + Storage Box); those rows are rebuilt below,
  // all other existing rows are preserved verbatim. Deleted-fighter eids are dropped entirely.
  const rebuiltPtEids = new Set, rebuiltMsrEids = new Set, rebuiltBstEids = new Set, rebuiltItemEids = new Set;
  for (const c of SAVE.soul.chrs) {
    for (const p of c.pspts || []) rebuiltPtEids.add(p.eptid);
    for (const m of c.psmsrs || []) rebuiltMsrEids.add(m.emsrid);
    for (const b of c.psbsts || []) rebuiltBstEids.add(b.ebstid);
    for (const it of c.psitems || []) rebuiltItemEids.add(it.eitemid);
  }
  for (const p of SAVE.cl && SAVE.cl.pts || []) rebuiltPtEids.add(p.eptid);
  for (const m of SAVE.cl && SAVE.cl.msrs || []) rebuiltMsrEids.add(m.emsrid);
  for (const b of SAVE.cl && SAVE.cl.bsts || []) rebuiltBstEids.add(b.ebstid);
  for (const it of SAVE.cl && SAVE.cl.items || []) rebuiltItemEids.add(it.eitemid);
  // delEids: instance ids belonging to fighters deleted in the editor (only valid for this raw root)
  const delEids = FIGHTER_DELETES.root === rawRoot ? FIGHTER_DELETES.eids : new Set;
  const preservedPts = arr(root.part.pts[mainUid]).filter(p => !rebuiltPtEids.has(p.eid) && !delEids.has(p.eid));
  const preservedMsrs = arr(root.mushroom.msrs).filter(m => !rebuiltMsrEids.has(m.eid) && !delEids.has(m.eid));
  const preservedBsts = arr(root.beast.bsts).filter(b => !rebuiltBstEids.has(b.eid) && !delEids.has(b.eid));
  const preservedItems = arr(root.item.items).filter(it => !rebuiltItemEids.has(it.eid) && !delEids.has(it.eid));
  // outputs: rebuilt instance lists and the new per-fighter Death Bag map
  const newPts = [], newMsrs = [], newBsts = [], newItems = [];
  const newDeathbag = {};
  // Create/refresh one instance row: keep the original row's fields (and gettime/created) if it
  // existed, overlay the editor's values, stamp modified=now, and drop keys the old row never had.
  function pushInst(list, existingByEid, eid, base) {
    const old = existingByEid[eid];
    const row = Object.assign({
      gettime: old ? old.gettime : now,
      created: old ? old.created : now,
      modified: now
    }, old, base);
    if (old) {
      for (const k of Object.keys(row)) if (!(k in old)) delete row[k];
    } else if (list === newMsrs || list === newItems) {
      // brand-new mushroom / item rows get exactly the fields the game writes for them
      // (mushroom: eid gettime msrid owner state eefcid tefcid posonce; item: eid gettime itemid owner)
      const shape = list === newMsrs ? { eid: '', gettime: now, msrid: '', owner: '', state: 0, eefcid: '', tefcid: '', posonce: 0 } : { eid: '', gettime: now, itemid: '', owner: '' };
      for (const k of Object.keys(shape)) if (k in row) shape[k] = row[k];
      list.push(shape);
      return;
    }
    list.push(row);
  }
  // previous rows by eid, used to preserve unknown fields on rebuilt items
  const oldPtsByEid = {};
  for (const p of arr(rawRoot.part && rawRoot.part.pts && rawRoot.part.pts[mainUid])) oldPtsByEid[p.eid] = p;
  const oldMsrsByEid = {};
  for (const m of arr(rawRoot.mushroom && rawRoot.mushroom.msrs)) oldMsrsByEid[m.eid] = m;
  const oldBstsByEid = {};
  for (const b of arr(rawRoot.beast && rawRoot.beast.bsts)) oldBstsByEid[b.eid] = b;
  const oldItemsByEid = {};
  for (const it of arr(rawRoot.item && rawRoot.item.items)) oldItemsByEid[it.eid] = it;
  // items copied from a second save on the Compare tab keep all their fields
  if (typeof CMP_EXTRA !== 'undefined' && CMP_EXTRA.root === rawRoot) {
    Object.assign(oldPtsByEid, CMP_EXTRA.pts); Object.assign(oldMsrsByEid, CMP_EXTRA.msrs);
    Object.assign(oldBstsByEid, CMP_EXTRA.bsts); Object.assign(oldItemsByEid, CMP_EXTRA.items);
  }
  // Per-fighter Death Bag rebuild
  const oldDeathbagByCid = rawRoot.soul && rawRoot.soul.deathbag && rawRoot.soul.deathbag[mainUid] || {};
  // each fighter: re-emit instance rows and a slot list (parts, then mushrooms, beasts, items)
  for (const c of SAVE.soul.chrs) {
    const slots = [];
    // eqBySite: eptid -> equipped site; armSlotByEptid: eptid -> weapon quick slot (-1 none)
    const eqBySite = {}, armSlotByEptid = {};
    if (c.armslots && typeof c.armslots === 'object') {
      // weapon quick slots are managed by the editor (arm_slot 0-2 right hand, 3-5 left)
      for (const e of c.eqpts || []) { eqBySite[e.eptid] = e.site; armSlotByEptid[e.eptid] = -1; }
      for (const [k, eid] of Object.entries(c.armslots)) if (eid) armSlotByEptid[eid] = Number(k);
    } else {
      for (const s of arr(oldDeathbagByCid[c.cid])) {
        if (s && s.type === 0 && s.eid && !s.site && s.arm_slot != null) armSlotByEptid[s.eid] = s.arm_slot;
      }
      for (const e of c.eqpts || []) {
        eqBySite[e.eptid] = e.site;
        armSlotByEptid[e.eptid] = e.arm_slot != null ? e.arm_slot : -1;
      }
    }
    for (const p of c.pspts || []) {
      pushInst(newPts, oldPtsByEid, p.eptid, {
        uid: Number(mainUid),
        eid: p.eptid,
        owner: 'USER',
        ptid: p.ptid,
        rest: p.rest || 0,
        spare: p.spare || 0,
        grade: p.grade || 0,
        dur: p.dur,
        lvl: p.lvl
      });
      slots.push({
        uid: Number(mainUid),
        cid: c.cid,
        slot: slots.length,
        type: 0,
        eid: p.eptid,
        site: eqBySite[p.eptid] || '',
        arm_slot: armSlotByEptid[p.eptid] != null ? armSlotByEptid[p.eptid] : -1
      });
    }
    for (const m of c.psmsrs || []) {
      pushInst(newMsrs, oldMsrsByEid, m.emsrid, {
        uid: Number(mainUid),
        eid: m.emsrid,
        owner: 'USER',
        msrid: m.msrid,
        state: m.cooked ? 1 : 0
      });
      slots.push({
        uid: Number(mainUid),
        cid: c.cid,
        slot: slots.length,
        type: 1,
        eid: m.emsrid,
        site: '',
        arm_slot: -1
      });
    }
    for (const b of c.psbsts || []) {
      pushInst(newBsts, oldBstsByEid, b.ebstid, {
        uid: Number(mainUid),
        eid: b.ebstid,
        owner: 'USER',
        bstid: b.bstid,
        state: b.cooked ? 1 : 0
      });
      slots.push({
        uid: Number(mainUid),
        cid: c.cid,
        slot: slots.length,
        type: 2,
        eid: b.ebstid,
        site: '',
        arm_slot: -1
      });
    }
    for (const it of c.psitems || []) {
      pushInst(newItems, oldItemsByEid, it.eitemid, {
        uid: Number(mainUid),
        eid: it.eitemid,
        owner: 'USER',
        itemid: it.itemId
      });
      slots.push({
        uid: Number(mainUid),
        cid: c.cid,
        slot: slots.length,
        type: 3,
        eid: it.eitemid,
        site: '',
        arm_slot: -1
      });
    }
    // Death Bag layout: capacity (deathBagCapacity) + 10 spare slots is what the game usually stores.
    // Existing items keep their original slot index; new ones fill the first empty slot.
    const bagArrayLen = deathBagCapacity(c) + 10;
    // Keep the slot count the game wrote unless this fighter's bag capacity went
    // up in the editor (or we don't know what it was); then pad to capacity + 10,
    // which is what the game itself stores for most fighters. Extra items beyond
    // the old length still get room because slots.length is always included.
    const origCap = ORIG_BAG_CAP[c.cid];
    const capGrew = origCap == null || deathBagCapacity(c) > origCap;
    // a deleted fighter's bag is {} in the game's saves; a fighter copied from a
    // second save (Compare tab) keeps that save's bag layout
    const cmpBag = typeof CMP_EXTRA !== 'undefined' && CMP_EXTRA.root === rawRoot && CMP_EXTRA.bags && CMP_EXTRA.bags[c.cid];
    const oldBag = arr(cmpBag || oldDeathbagByCid[c.cid]);
    const targetSlotCount = oldBag.length ? Math.max(oldBag.length, slots.length, capGrew ? bagArrayLen : 0) : Math.max(slots.length, deathBagCapacity(c));
    const origSlotByEid = {};
    oldBag.forEach((s, i) => {
      if (s && s.eid) origSlotByEid[s.eid] = s.slot != null ? s.slot : i;
    });
    const laid = new Array(Math.max(targetSlotCount, slots.length)).fill(null);
    const pending = [];
    for (const it of slots) {
      const o = origSlotByEid[it.eid];
      if (o != null && o >= 0 && o < laid.length && !laid[o]) laid[o] = it; else pending.push(it);
    }
    for (const it of pending) {
      let i = laid.indexOf(null);
      if (i < 0) {
        laid.push(null);
        i = laid.length - 1;
      }
      laid[i] = it;
    }
    newDeathbag[c.cid] = laid.map((it, i) => it ? Object.assign(it, {
      slot: i
    }) : {
      uid: Number(mainUid),
      cid: c.cid,
      slot: i,
      type: -1,
      eid: '',
      site: '',
      arm_slot: -1
    });
  }
  // Death Bags of fighters no longer in SAVE
  root.soul.deathbag = root.soul.deathbag || {};
  for (const cid of Object.keys(oldDeathbagByCid)) {
    if (cid in newDeathbag) continue;
    // drop death bags of broken fighters the old "Add Character" created
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cid)) continue;
    const old = oldDeathbagByCid[cid];
    const hasItems = Array.isArray(old) ? old.some(s => s && s.eid) : Object.keys(old || {}).length > 0;
    if (!hasItems) newDeathbag[cid] = old;
  }
  // the game keeps a deleted fighter's death bag key, emptied to {}
  if (FIGHTER_DELETES.root === rawRoot) for (const cid of FIGHTER_DELETES.cids) newDeathbag[cid] = {};
  root.soul.deathbag[mainUid] = newDeathbag;
  // fighters recovered from the Hater/dead list are cleaned out of diedchara
  applyFighterRecovers(root, rawRoot, mainUid);
  // Storage Box slot table (soul.cl) and its owned instances (owner COIN_LOCKER)
  const clSrc = SAVE.cl && SAVE.cl.slots || [];
  root.soul.cl = clSrc.map(s => {
    if (s.eptid && s.eptid !== '-1') return {
      slot: s.slot,
      type: 0,
      eid: s.eptid
    };
    if (s.emsrid && s.emsrid !== '-1') return {
      slot: s.slot,
      type: 1,
      eid: s.emsrid
    };
    if (s.ebstid && s.ebstid !== '-1') return {
      slot: s.slot,
      type: 2,
      eid: s.ebstid
    };
    if (s.eitemid && s.eitemid !== '-1') return {
      slot: s.slot,
      type: 3,
      eid: s.eitemid
    };
    return {
      slot: s.slot,
      type: -1,
      eid: ''
    };
  });
  // Only write Storage Box instances that a slot still points to: removing an item (✕, Clear all, shrinking
  // the box) only empties its slot, and game-written saves have no unreferenced COIN_LOCKER rows. Rows that
  // were already unreferenced in the loaded save are kept as they were, so an unedited save round-trips exactly.
  const boxRefs = new Set();
  for (const s of clSrc) for (const k of [ 'eptid', 'emsrid', 'ebstid', 'eitemid' ]) if (s[k] && s[k] !== '-1') boxRefs.add(s[k]);
  const rawBoxRefs = new Set(arr(rawRoot.soul && rawRoot.soul.cl).map(s => s && s.eid).filter(Boolean));
  const rawLockerRows = [].concat(arr(rawRoot.part && rawRoot.part.pts && rawRoot.part.pts[mainUid]), arr(rawRoot.mushroom && rawRoot.mushroom.msrs), arr(rawRoot.beast && rawRoot.beast.bsts), arr(rawRoot.item && rawRoot.item.items));
  const rawBoxOrphans = new Set(rawLockerRows.filter(r => r && r.owner === 'COIN_LOCKER' && !rawBoxRefs.has(r.eid)).map(r => r.eid));
  const inBox = id => boxRefs.has(id) || rawBoxOrphans.has(id);
  for (const p of SAVE.cl && SAVE.cl.pts || []) if (inBox(p.eptid)) pushInst(newPts, oldPtsByEid, p.eptid, {
    uid: Number(mainUid),
    eid: p.eptid,
    owner: 'COIN_LOCKER',
    ptid: p.ptid,
    rest: p.rest || 0,
    spare: p.spare || 0,
    grade: p.grade || 0,
    dur: p.dur,
    lvl: p.lvl
  });
  for (const m of SAVE.cl && SAVE.cl.msrs || []) if (inBox(m.emsrid)) pushInst(newMsrs, oldMsrsByEid, m.emsrid, {
    uid: Number(mainUid),
    eid: m.emsrid,
    owner: 'COIN_LOCKER',
    msrid: m.msrid,
    state: m.cooked ? 1 : 0
  });
  for (const b of SAVE.cl && SAVE.cl.bsts || []) if (inBox(b.ebstid)) pushInst(newBsts, oldBstsByEid, b.ebstid, {
    uid: Number(mainUid),
    eid: b.ebstid,
    owner: 'COIN_LOCKER',
    bstid: b.bstid,
    state: b.cooked ? 1 : 0
  });
  for (const it of SAVE.cl && SAVE.cl.items || []) if (inBox(it.eitemid)) pushInst(newItems, oldItemsByEid, it.eitemid, {
    uid: Number(mainUid),
    eid: it.eitemid,
    owner: 'COIN_LOCKER',
    itemid: it.itemId
  });
  // keep each list in the order the game wrote it (rebuilt entries would otherwise move to the end); entries
  // the editor added go last, in the order they were built
  const inOrigOrder = (list, orig) => {
    const at = new Map(arr(orig).map((x, i) => [ x && x.eid, i ]));
    const pos = x => at.has(x && x.eid) ? at.get(x.eid) : Number.MAX_SAFE_INTEGER;
    return list.map((x, i) => [ x, i ]).sort((a, b) => pos(a[0]) - pos(b[0]) || a[1] - b[1]).map(e => e[0]);
  };
  root.part.pts[mainUid] = inOrigOrder(preservedPts.concat(newPts), rawRoot.part && rawRoot.part.pts && rawRoot.part.pts[mainUid]);
  root.mushroom.msrs = inOrigOrder(preservedMsrs.concat(newMsrs), rawRoot.mushroom && rawRoot.mushroom.msrs);
  root.beast.bsts = inOrigOrder(preservedBsts.concat(newBsts), rawRoot.beast && rawRoot.beast.bsts);
  root.item.items = inOrigOrder(preservedItems.concat(newItems), rawRoot.item && rawRoot.item.items);
  // presents / prison; released prisoners are removed from root.abduct
  root.soul.present = SAVE.presents;
  root.soul.prison = Object.assign({}, root.soul.prison, {
    [mainUid]: SAVE.prison.map(p => {
      const c = Object.assign({}, p);
      delete c.state;
      delete c.abduct;
      return c;
    })
  });
  const origPrisonAbids = new Set(arr((rawRoot.soul || {}).prison && (rawRoot.soul || {}).prison[mainUid]).map(p => p.abid).filter(Boolean));
  const currentPrisonAbids = new Set(SAVE.prison.map(p => p.abid).filter(Boolean));
  const releasedAbids = new Set([ ...origPrisonAbids ].filter(a => !currentPrisonAbids.has(a)));
  if (releasedAbids.size) root.abduct = (Array.isArray(root.abduct) ? root.abduct : []).filter(a => !releasedAbids.has(a.abid));
  // VIP: write back under the game's key names, keeping unknown VIP fields from the raw save
  const v = SAVE.soul.vip || {};
  root.soul.vip = Object.assign({}, rawRoot.soul && rawRoot.soul.vip || {}, {
    flag: v.vip_flag || 0,
    type: v.vip_type || 0,
    pass_num: v.vip_pass_num || 0,
    oneday_pass_num: v.oneday_vip_pass_num || 0,
    expired_time: v.expired_time || 0,
    automatic_renewal: v.automatic_renewal || 0,
    friendship: v.friendship || 0
  });
  // research, and cleanup of editor-only soul keys that do not exist in the real save
  root.soul.partresearch = Object.assign({}, root.soul.partresearch, {
    user: SAVE.user_research
  });
  delete root.soul.chrs;
  delete root.soul.chrslots;
  delete root.soul.vip_flag;
  root.soul.expert = SAVE.soul.mstlvl || [];
  delete root.soul.mstlvl;
  delete root.soul.jointeams;
  delete root.soul.tid;
  delete root.soul.psskls;
  // do not introduce keys the original save never had
  const rawSoul = rawRoot && rawRoot.soul || {};
  for (const k of [ 'dchrs', 'quests', 'freezer_level', 'crntcid' ]) if (!(k in rawSoul)) delete root.soul[k];
  if (rawSoul.waiting && !Array.isArray(rawSoul.waiting) && !(SAVE.soul.waiting || []).length) root.soul.waiting = rawSoul.waiting;
  // user profile; if the player name changed also update places that copy the name (olid, zombies)
  root.user = Object.assign({}, root.user, SAVE.user);
  const oldName = rawRoot.user && rawRoot.user.nm;
  const newName = SAVE.user.nm;
  if (oldName && newName && oldName !== newName) {
    if (root.user.olid === oldName) root.user.olid = newName;
    const zmbs = root.zombie && root.zombie.zmbs;
    if (zmbs && typeof zmbs === 'object') {
      for (const k of Object.keys(zmbs)) for (const z of arr(zmbs[k])) if (z && z.name === oldName) z.name = newName;
    }
  }
  // defense lineup (Defense tab): the game writes {} when nobody defends
  root.fortzmbsetting = SAVE.fortsetting.length ? (typeof defRefreshSnapshots === 'function' ? defRefreshSnapshots(SAVE.fortsetting) : SAVE.fortsetting) : (Array.isArray(rawRoot.fortzmbsetting) && !rawRoot.fortzmbsetting.length ? [] : {});
  root.playlog = SAVE.playlog[0] || root.playlog;
  if (SAVE.teams.length) root.team = SAVE.teams;
  return root;
}

/** Read a File as text via FileReader (Promise). */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader;
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}

/** Read a File as an ArrayBuffer via FileReader (Promise). */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader;
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

/** Toggle the green 'ok' state of a status chip element by id. */
function markChip(id, ok) {
  const chip = document.getElementById(id);
  chip.classList.toggle('ok', !!ok);
}

