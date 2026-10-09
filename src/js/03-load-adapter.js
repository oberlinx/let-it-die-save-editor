// ==== Full dump -> editor shape adapter ====
/**
 * Convert the game's real JSON ("full dump") into the legacy/friendly shape the editor works with.
 *
 * The real save keeps everything keyed by account uid and split into flat tables (bodyuser, part.pts,
 * mushroom.msrs, beast.bsts, item.items by eid, soul.deathbag slots, soul.cl, ...). Here each fighter
 * gets nested pspts/eqpts/psmsrs/psbsts/psitems/armslots, bodylvl/bodybonus, eqskls; the Storage Box
 * (coin locker, save key cl) becomes SAVE.cl; prison rows get an abduct record; VIP keys are renamed.
 * Mushroom/beast state 0=raw, 1=grilled becomes a boolean 'cooked'.
 *
 * Side effect: records RAW_EMPTY_SHAPES (which empty collections were {} vs []) before anything else.
 * The returned object also carries __rawSavRoot / __rawSavMainUid so loadSaveFiles can keep the
 * untouched original for the later merge in buildRawSavRootFromSave().
 * @param {object} rawRoot parsed JSON of the save (never modified; the adapter works on a deep copy)
 */
function adaptFullDumpToLegacyShape(rawRoot) {
  // Work on a deep copy so nothing in the editor shape (SAVE) shares objects with the raw save.
  // Without this, edits to SAVE (mastery, research, defense, quests...) also changed RAW_SAV_ROOT,
  // which is meant to stay exactly as loaded (Raw data view, JSON compare, change detection).
  const root = JSON.parse(JSON.stringify(rawRoot));
  // Shapes are recorded against the raw root itself: restoreEmptyShapes only runs when RAW_EMPTY_SHAPES.root
  // is the RAW_SAV_ROOT being downloaded.
  RAW_EMPTY_SHAPES = captureEmptyShapes(rawRoot);
  // main account uid: items are keyed by it throughout the save
  const mainUid = String(root.soul && root.soul.uid || root.user && root.user.uid || '');
  const chrTable = root.soul && root.soul.chr || {};
  const chrs = arr(chrTable.chrs && chrTable.chrs[mainUid]);
  const chrslots = arr(chrTable.slots && chrTable.slots[mainUid]);
  // index auxiliary tables by their keys so fighters can be joined cheaply
  const bodyuserByCid = {};
  for (const b of arr(root.bodyuser && root.bodyuser[mainUid])) bodyuserByCid[b.cid] = b;
  const eqsklByCid = {};
  for (const e of arr(root.soul && root.soul.skl && root.soul.skl.eqskl && root.soul.skl.eqskl[mainUid])) {
    (eqsklByCid[e.cid] = eqsklByCid[e.cid] || []).push(e);
  }
  const ptInstByEid = {};
  for (const p of arr(root.part && root.part.pts && root.part.pts[mainUid])) ptInstByEid[p.eid] = p;
  const msrInstByEid = {};
  for (const m of arr(root.mushroom && root.mushroom.msrs)) msrInstByEid[m.eid] = m;
  const bstInstByEid = {};
  for (const b of arr(root.beast && root.beast.bsts)) bstInstByEid[b.eid] = b;
  const itemInstByEid = {};
  for (const it of arr(root.item && root.item.items)) itemInstByEid[it.eid] = it;
  // deathbag: { uid: { cid: [slots...] } } where slot.type 0=part 1=mushroom 2=beast 3=item, -1=empty
  const deathbagByCid = root.soul && root.soul.deathbag && root.soul.deathbag[mainUid] || {};
  // Collect one fighter's inventory from its Death Bag slots. A slot with a site is equipped;
  // arm_slot 0-5 are weapon quick slots (0-2 right hand, 3-5 left).
  function buildFighterInventory(cid) {
    const slots = arr(deathbagByCid[cid]);
    const pspts = [], eqpts = [], psmsrs = [], psbsts = [], psitems = [];
    const armslots = {};
    for (const s of slots) {
      if (s.type === 0 && s.eid && s.arm_slot != null && s.arm_slot >= 0 && s.arm_slot <= 5 && ptInstByEid[s.eid]) armslots[s.arm_slot] = s.eid;
      if (s.type === 0 && s.eid) {
        const inst = ptInstByEid[s.eid];
        if (inst) pspts.push({
          eptid: inst.eid,
          ptid: inst.ptid,
          dur: inst.dur,
          lvl: inst.lvl,
          grade: inst.grade,
          rest: inst.rest,
          spare: inst.spare,
          gettime: inst.gettime
        });
        if (s.site) eqpts.push({
          site: s.site,
          eptid: s.eid,
          arm_slot: s.arm_slot != null ? s.arm_slot : -1
        });
      } else if (s.type === 1 && s.eid) {
        const inst = msrInstByEid[s.eid];
        if (inst) psmsrs.push({
          emsrid: inst.eid,
          msrid: inst.msrid,
          cooked: Number(inst.state) === 1,
          gettime: inst.gettime
        });
      } else if (s.type === 2 && s.eid) {
        const inst = bstInstByEid[s.eid];
        if (inst) psbsts.push({
          ebstid: inst.eid,
          bstid: inst.bstid,
          cooked: Number(inst.state) === 1,
          lvl: inst.lvl,
          gettime: inst.gettime
        });
      } else if (s.type === 3 && s.eid) {
        const inst = itemInstByEid[s.eid];
        if (inst) psitems.push({
          eitemid: inst.eid,
          itemId: inst.itemid,
          gettime: inst.gettime
        });
      }
    }
    return {
      pspts: pspts,
      eqpts: eqpts,
      psmsrs: psmsrs,
      psbsts: psbsts,
      psitems: psitems,
      armslots: armslots
    };
  }
  // merge each fighter record with its bodyuser row (levels/stats/bonuses) and inventory
  const mergedChrs = chrs.map(c => {
    const bu = bodyuserByCid[c.cid];
    const inv = buildFighterInventory(c.cid);
    const eqskls = arr(eqsklByCid[c.cid]).map(e => ({
      sklid: e.sklid,
      slot: e.slot
    }));
    return Object.assign({}, c, {
      lvl: bu ? bu.lvl : c.lvl,
      rage: bu ? bu.rage || 0 : c.rage || 0,
      bodylvl: bu ? {
        lvl: bu.lvl,
        hp: bu.hp,
        str: bu.str,
        dex: bu.dex,
        vit: bu.vit,
        stm: bu.stm,
        luk: bu.luk,
        skill: bu.skill,
        bag: bu.bag
      } : c.bodylvl || {},
      bodybonus: bu ? {
        hp_bonus: bu.hp_bonus,
        str_bonus: bu.str_bonus,
        dex_bonus: bu.dex_bonus,
        vit_bonus: bu.vit_bonus,
        stm_bonus: bu.stm_bonus,
        luk_bonus: bu.luk_bonus
      } : c.bodybonus || {},
      pspts: inv.pspts,
      eqpts: inv.eqpts,
      psmsrs: inv.psmsrs,
      psbsts: inv.psbsts,
      psitems: inv.psitems,
      armslots: inv.armslots,
      eqskls: eqskls
    });
  });
  // passive skill stock ("decals" the player owns); lvl is not stored so default 1
  const psskl = arr(root.soul && root.soul.skl && root.soul.skl.psskl);
  const psskls = psskl.map(s => ({
    id: s.sklid,
    lvl: 1,
    cnt: s.cnt,
    is_checked: s.is_checked
  }));
  // Storage Box slots (soul.cl): type picks which id column is filled; '-1' means none
  const clRaw = arr(root.soul && root.soul.cl);
  const clSlots = clRaw.map(r => ({
    slot: r.slot,
    eptid: r.type === 0 ? r.eid : '-1',
    emsrid: r.type === 1 ? r.eid : '-1',
    ebstid: r.type === 2 ? r.eid : '-1',
    eitemid: r.type === 3 ? r.eid : '-1'
  }));
  // Storage Box contents are the same instance tables, distinguished by owner === 'COIN_LOCKER'
  const clPts = arr(root.part && root.part.pts && root.part.pts[mainUid]).filter(p => p.owner === 'COIN_LOCKER').map(p => ({
    eptid: p.eid,
    ptid: p.ptid,
    dur: p.dur,
    lvl: p.lvl,
    grade: p.grade,
    rest: p.rest,
    spare: p.spare,
    gettime: p.gettime
  }));
  const clMsrs = arr(root.mushroom && root.mushroom.msrs).filter(m => m.owner === 'COIN_LOCKER').map(m => ({
    emsrid: m.eid,
    msrid: m.msrid,
    cooked: Number(m.state) === 1,
    gettime: m.gettime
  }));
  const clBsts = arr(root.beast && root.beast.bsts).filter(b => b.owner === 'COIN_LOCKER').map(b => ({
    ebstid: b.eid,
    bstid: b.bstid,
    cooked: Number(b.state) === 1,
    lvl: b.lvl,
    gettime: b.gettime
  }));
  const clItems = arr(root.item && root.item.items).filter(it => it.owner === 'COIN_LOCKER').map(it => ({
    eitemid: it.eid,
    itemId: it.itemid,
    gettime: it.gettime
  }));
  // prisoners: join each kidnapped-fighter row to its abduct record (state defaults CONCILIATE; EMPTY when no abid)
  const prisonRaw = arr(root.soul && root.soul.prison && root.soul.prison[mainUid]);
  const abductByAbid = {};
  for (const a of Array.isArray(root.abduct) ? root.abduct : []) abductByAbid[a.abid] = a;
  const prison = prisonRaw.map(p => {
    const abduct = p.abid ? abductByAbid[p.abid] : null;
    return Object.assign({
      state: abduct ? abduct.state || 'CONCILIATE' : 'EMPTY',
      abduct: abduct || null
    }, p);
  });
  // Express Pass / VIP block renamed to the editor's vip_* keys
  const vipSrc = root.soul && root.soul.vip || {};
  const vip = {
    vip_flag: vipSrc.flag || 0,
    vip_type: vipSrc.type || 0,
    vip_pass_num: vipSrc.pass_num || 0,
    oneday_vip_pass_num: vipSrc.oneday_pass_num || 0,
    expired_time: vipSrc.expired_time || 0,
    automatic_renewal: vipSrc.automatic_renewal || 0,
    friendship: vipSrc.friendship || 0
  };
  // build the editor-side soul: drop game-only containers that were re-homed above
  const soul = Object.assign({}, root.soul, {
    chrs: mergedChrs,
    chrslots: chrslots,
    vip: vip,
    psskls: psskls,
    mail: arr(root.soul && root.soul.mail),
    jointeams: [ {
      tid: root.soul && root.soul.team_id || '',
      name: ''
    } ],
    tid: root.soul && root.soul.team_id || '',
    mstlvl: arr(root.soul && root.soul.expert)
  });
  delete soul.chr;
  delete soul.prison;
  delete soul.present;
  delete soul.partresearch;
  delete soul.skl;
  delete soul.deathbag;
  delete soul.cl;
  delete soul.expert;
  // adapted object; fields prefixed __raw keep the pristine original
  return {
    soul: soul,
    user: Object.assign({}, root.user || {}),
    playlog: [ root.playlog || {} ],
    presents: arr(root.soul && root.soul.present),
    prison: prison,
    cl: {
      slots: clSlots,
      pts: clPts,
      msrs: clMsrs,
      bsts: clBsts,
      items: clItems
    },
    fortsetting: arr(root.fortzmbsetting),
    dests: {
      revenge: []
    },
    teams: arr(root.team),
    user_research: arr(root.soul && root.soul.partresearch && root.soul.partresearch.user),
    accountId: mainUid,
    __rawSavRoot: rawRoot,
    __rawSavMainUid: mainUid
  };
}

