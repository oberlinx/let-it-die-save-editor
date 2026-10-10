// ==== More safety checks (decals, parts, stats, levels, dangling references, defense, in-use fighter, bank) ====
// More safety checks, each verified against masters.db and the game-made records of 16 real saves (none of them
// fires on a game-made record): fighters the game plays with (not ENEMY, DUMMY or CONCILIATE, which keep other
// rules), every rule from master_body_detail / master_part.
// True for fighters the player really plays with (not ENEMY / DUMMY / CONCILIATE records).
function safetyFighter(c) { return !!c && c.state !== 'ENEMY' && c.state !== 'DUMMY' && c.state !== 'CONCILIATE'; }
// Number of decal slots a fighter has: base slots plus bought (bodylvl.skill), limited by the cap.
function decalSlotsOf(c) {
  const R = fighterRanges(c.type || 'BAL', c.grade != null ? c.grade : 1, c.limit_break || 0);
  return Math.min(R.skillBase + (Number(c.bodylvl && c.bodylvl.skill) || 0), R.skillCap);
}
// decals equipped beyond the fighter's slots (skill_slots + slots bought): the ones past the last slot
function decalsOverSlots() {
  const out = [];
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) {
    if (!safetyFighter(c) || !arr(c.eqskls).length) continue;
    const slots = decalSlotsOf(c), list = arr(c.eqskls).slice().sort((a, b) => (Number(a.slot) || 0) - (Number(b.slot) || 0));
    const keep = list.filter(e => (Number(e.slot) || 0) < slots).slice(0, slots), extra = list.filter(e => !keep.includes(e));
    if (extra.length) out.push({ c, slots, extra });
  }
  return out;
}
// Removes decals beyond the slots. A premium decal goes back to the stock (psskls count, capped at DECAL_CAP),
// like unequipping in game; normal decals are simply lost. Returns the number of decals removed.
function fixDecalsOverSlots() {
  let n = 0;
  SAVE.soul.psskls = arr(SAVE.soul.psskls);
  for (const o of decalsOverSlots()) {
    o.c.eqskls = arr(o.c.eqskls).filter(e => !o.extra.includes(e));
    for (const e of o.extra) {
      n++;
      // like taking it off in game: a premium decal goes back to the stock, a normal one is lost
      const id = e.id || e.sklid;
      if (!(SKL_INDEX[id] && Number(SKL_INDEX[id].premium) === 1)) continue;
      let st = SAVE.soul.psskls.find(x => x.id === id);
      if (!st) SAVE.soul.psskls.push(st = { id, lvl: 1, cnt: 0, is_checked: 1 });
      st.cnt = Math.min((st.cnt || 0) + 1, DECAL_CAP);
    }
  }
  return n;
}
// Finds weapons/armor (in Death Bags and the Storage Box) whose durability, ammo (rest) or spare ammo exceed master_part limits.
// Entries: {inst, rec, md (max durability), why: ['dur'|'rest'|'spare'], where (label)}.
// weapons / armor with more durability, ammo or spare ammo than master_part allows (dur x dur_c^(lvl-1), capacity, spare)
function partsOverMax() {
  const out = [];
  const look = (inst, where) => {
    const rec = inst && PT_INDEX[inst.ptid];
    if (!rec) return;
    const md = partMaxDur(rec, inst.lvl), why = [];
    if (md > 0 && Number(inst.dur) > md) why.push('dur');
    // parts with no magazine / no spare store 0 (all 11,852 game-made parts in the test saves)
    if (Number(inst.rest) > (Number(rec.capacity) || 0)) why.push('rest');
    if (Number(inst.spare) > (Number(rec.spare) || 0)) why.push('spare');
    if (why.length) out.push({ inst, rec, md, why, where });
  };
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) if (c && c.state !== 'ENEMY') for (const p of arr(c.pspts)) look(p, `${c.name || 'a fighter'}'s Death Bag`);
  for (const p of arr(SAVE && SAVE.cl && SAVE.cl.pts)) look(p, 'Storage Box');
  return out;
}
// Sets offending durability / ammo / spare to the part's maximum. Returns number of parts fixed.
function fixPartsOverMax() {
  const list = partsOverMax();
  for (const o of list) {
    if (o.why.includes('dur')) o.inst.dur = o.md;
    if (o.why.includes('rest')) o.inst.rest = Number(o.rec.capacity) || 0;
    if (o.why.includes('spare')) o.inst.spare = Number(o.rec.spare) || 0;
  }
  return list.length;
}
// Stat keys checked against the grade/limit-break cap.
// statsOverCap(): fighters with a stat level above R.statCap. Stored stats include the bonus, so the cap is applied to (stat - bonus).
// stat levels above the cap for the type, grade and limit break (param_lv_max); the save stores each stat with its
// bonus added, so the cap applies to the stat minus its bonus
const SAFETY_STATS = [ 'hp', 'str', 'dex', 'vit', 'stm', 'luk' ];
function statsOverCap() {
  const out = [];
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) {
    if (!safetyFighter(c) || !c.bodylvl) continue;
    const R = fighterRanges(c.type || 'BAL', c.grade != null ? c.grade : 1, c.limit_break || 0), bb = c.bodybonus || {};
    const over = SAFETY_STATS.filter(k => (Number(c.bodylvl[k]) || 0) - (Number(bb[k + '_bonus']) || 0) > R.statCap);
    if (over.length) out.push({ c, R, over });
  }
  return out;
}
// Lowers over-cap stats to cap + bonus, then recomputes the fighter's level. Returns number of fighters fixed.
function fixStatsOverCap() {
  const list = statsOverCap();
  for (const o of list) {
    for (const k of o.over) o.c.bodylvl[k] = o.R.statCap + (Number((o.c.bodybonus || {})[k + '_bonus']) || 0);
    recomputeLevel(o.c);
  }
  return list.length;
}
// Fighters whose saved lvl differs from computedLevel(c). Over-limit fighters are skipped (their own fix sets the level).
// the level the game shows is the six stats (with bonuses) - 5 + the slots, bag and rage bought (true for every one
// of 509 game-made fighters checked); fighters over their limits are left to that check, whose fix sets the level
function levelMismatches() {
  const skip = new Set(fightersOverCap().concat(statsOverCap()).map(o => o.c));
  return arr(SAVE && SAVE.soul && SAVE.soul.chrs).filter(c => c && c.bodylvl && c.state !== 'ENEMY' && !skip.has(c) && Number(c.lvl) !== computedLevel(c));
}
// Recomputes level for every mismatched fighter; returns the count.
function fixLevelMismatches() { const list = levelMismatches(); for (const c of list) recomputeLevel(c); return list.length; }
// SAFETY_CL: [slot field, list name] pairs for Storage Box slots (parts, mushrooms, beasts, items).
// danglingSlots(): returns {hangers: freezer hangers naming a missing/duplicate fighter, storage: [{sl,k}] slots naming an
// eid that is not in the matching list}. Empty slot marker is the string '-1'.
// freezer hangers naming a fighter that isn't in the save, or the same fighter twice; Storage Box slots naming an
// item that isn't stored
const SAFETY_CL = [ [ 'eptid', 'pts' ], [ 'emsrid', 'msrs' ], [ 'ebstid', 'bsts' ], [ 'eitemid', 'items' ] ];
function danglingSlots() {
  const out = { hangers: [], storage: [] };
  const cids = new Set(arr(SAVE && SAVE.soul && SAVE.soul.chrs).map(c => c && c.cid)), seen = new Set();
  for (const h of arr(SAVE && SAVE.soul && SAVE.soul.chrslots)) {
    if (!h || !h.cid) continue;
    if (!cids.has(h.cid) || seen.has(h.cid)) out.hangers.push(h);
    seen.add(h.cid);
  }
  const cl = (SAVE && SAVE.cl) || {};
  const have = {}; for (const [ k, list ] of SAFETY_CL) have[k] = new Set(arr(cl[list]).map(x => x && x[k]));
  for (const sl of arr(cl.slots)) for (const [ k ] of SAFETY_CL) { const v = sl && sl[k]; if (v && v !== '-1' && !have[k].has(v)) out.storage.push({ sl, k }); }
  return out;
}
// Empties dangling hangers (cid '') and storage slots ('-1'). Returns the number emptied.
function fixDanglingSlots() {
  const d = danglingSlots();
  for (const h of d.hangers) h.cid = '';
  for (const x of d.storage) x.sl[x.k] = '-1';
  return d.hangers.length + d.storage.length;
}
// Validates the defense lineup (SAVE.fortsetting entries {wave, order, cid, is_equip_whistle}).
// Returns {bad: [{e,c,why}] unusable entries, stray: GUARD fighters missing from the lineup, alarms: number of alarm carriers}.
// defense lineup (fortzmbsetting) in step with the fighters: every entry a GUARD fighter that exists, every GUARD
// fighter in the lineup, one per place (2 waves of 5 places, 9 at most: checked separately), one alarm carrier.
// All 7 game saves with a lineup follow these.
function defenseProblems() {
  const list = arr(SAVE && SAVE.fortsetting), out = { bad: [], stray: [], alarms: 0 };
  const seenPos = new Set(), seenCid = new Set();
  for (const e of list) {
    const c = arr(SAVE.soul.chrs).find(x => x && x.cid === e.cid), pos = e.wave + ':' + e.order;
    const why = !c ? 'not in the save' : c.state !== 'GUARD' ? `not a defender (${c.state})` : !(e.wave >= 0 && e.wave < DEF_WAVES && e.order >= 0 && e.order < DEF_SLOTS) ? 'not a real place' : seenPos.has(pos) ? 'two defenders in one place' : seenCid.has(e.cid) ? 'in two places' : '';
    if (why) out.bad.push({ e, c, why });
    else { seenPos.add(pos); seenCid.add(e.cid); }
  }
  for (const c of arr(SAVE && SAVE.soul && SAVE.soul.chrs)) if (c && c.state === 'GUARD' && !list.some(e => e.cid === c.cid)) out.stray.push(c);
  out.alarms = list.filter(e => e.is_equip_whistle).length;
  return out;
}
// Repairs the lineup: drops bad entries, frees stray GUARD fighters, keeps a single alarm holder, re-sorts. Returns problems fixed.
function fixDefenseProblems() {
  const d = defenseProblems(), list = defLineup();
  for (const b of d.bad) { const i = list.indexOf(b.e); if (i >= 0) list.splice(i, 1); }
  // the game puts a defender taken off the lineup back in the freezer (including one whose place was removed above)
  for (const c of arr(SAVE.soul.chrs)) if (c && c.state === 'GUARD' && !list.some(e => e.cid === c.cid)) c.state = 'FREE';
  let kept = false;
  for (const e of list) { if (e.is_equip_whistle && kept) e.is_equip_whistle = 0; else if (e.is_equip_whistle) kept = true; }
  list.sort((a, b) => a.wave - b.wave || a.order - b.order);
  return d.bad.length + d.stray.length + Math.max(0, d.alarms - 1);
}
// Exactly one fighter must be in state USE. Returns null if fine, else {use: fighters in USE, chrs: all fighters}.
// exactly one fighter in use (state USE): every game save has one, in a run or not
function inUseProblem() {
  const chrs = arr(SAVE && SAVE.soul && SAVE.soul.chrs), use = chrs.filter(c => c && c.state === 'USE');
  return use.length === 1 ? null : { use, chrs };
}
// Picks the fighter that stays in use (run owner via c.pause, else soul.crntcid, else first) or, when none, a free
// non-kidnapped fighter. Returns a message string for the UI ('' if nothing to fix).
function fixInUse() {
  const p = inUseProblem();
  if (!p) return '';
  let keep;
  if (p.use.length > 1) {
    // the fighter the run belongs to, else the current fighter, else the first
    keep = p.use.find(c => c.pause) || p.use.find(c => c.cid === SAVE.soul.crntcid) || p.use[0];
    for (const c of p.use) if (c !== keep) c.state = 'FREE';
  } else {
    keep = p.chrs.find(c => c && c.cid === SAVE.soul.crntcid && c.state === 'FREE' && !c.abid) || p.chrs.find(c => c && c.state === 'FREE' && !c.abid);
    if (!keep) return 'No fighter in the freezer could be picked.';
    keep.state = 'USE';
  }
  SAVE.soul.crntcid = keep.cid;
  return `${keep.name || 'A fighter'} is the fighter in use.`;
}
// Returns soul.whistle_id when it is not in the loaded masters.db (master_fort_whistle), else ''.
// the alarm bought (soul.whistle_id) must be one master_fort_whistle knows
function alarmUnknown() {
  const id = SAVE && SAVE.soul && SAVE.soul.whistle_id;
  return id && arr(AP && AP.fortWhistle).length && !defAlarmRow(id) ? id : '';
}
// Compares stored safe_limit / spirit_tank_limit (rarely present) with the capacity for the stored level.
// Returns [{kf: limit field, lf: level field, label, have, want}].
// a Bank / SPLithium tank limit the save stores must be the limit for its level (master_safe_level /
// master_spirit_tank_level); the game stores only the level, so most saves have no *_limit field at all
function bankLimitMismatches() {
  const soul = (SAVE && SAVE.soul) || {}, out = [];
  for (const [ lf, label ] of [ [ 'safe_level', 'Bank' ], [ 'spirit_tank_level', 'SPLithium tank' ] ]) {
    const kf = lf.replace('_level', '_limit');
    if (!(kf in soul) || soul[kf] == null || soul[kf] === '') continue;
    const want = bankCapacityForLevel(soul[lf] != null ? soul[lf] : 1, lf);
    if (want && Number(soul[kf]) !== want) out.push({ kf, lf, label, have: Number(soul[kf]), want });
  }
  return out;
}

// ==== SAVE CHECK engine ====
// Runs every check against SAVE / RAW_SAV_ROOT and rebuilds HEALTH.items sorted problem > warning > note.
// Each item: {level, text (HTML, caller-escaped), tab (tab id to jump to), fix: {label, run()} optional}.
// run() mutates SAVE (or arms a download-time rule) and returns a message. Every check is wrapped by safe() so a
// failing check becomes a note instead of breaking the rest. Side effects: replaces the HEALTH global only.
function runSaveCheck() {
  const out = [];
  // add(): push one finding. safe(): run a check, converting exceptions into a 'couldn't run' note.
  const add = (level, text, tab, fix) => out.push({ level, text, tab, fix });
  if (!SAVE) { HEALTH = { items: [], ranAt: 0, open: HEALTH.open }; return; }
  const soul = SAVE.soul || {};
  const tabLabel = id => (TABS.find(t => t.id === id) || {}).label || id;
  const safe = (name, fn) => { try { fn(); } catch (err) { console.warn('save check failed:', name, err); add('note', `Couldn't run the ${name} check (${err.message}).`); } };

  // load-time repairs
  if (HEALTH_LOAD.repairedChars) add('note', `${HEALTH_LOAD.repairedChars} broken character${HEALTH_LOAD.repairedChars === 1 ? '' : 's'} in text fields were repaired while loading. The rest of the save loaded normally.`);

  // fighters with more decal slots, Death Bag or rage than their type, grade and limit break allow
  safe('fighter limits', () => {
    const over = fightersOverCap();
    if (!over.length) return;
    const nm = { skill: 'decal slots', bag: 'Death Bag', rage: 'rage' };
    const tot = (o, k) => k === 'skill' ? [ o.R.skillBase + o.has.skill, o.R.skillCap ] : k === 'bag' ? [ o.R.bagBase + o.has.bag, o.R.bagCap ] : [ o.R.rageBase + o.has.rage, o.R.rageCap ];
    const lbl = o => `${escapeHtml(o.c.name || 'a fighter')} (${escapeHtml(o.c.type || '?')} Grade ${o.c.grade} Limit Break ${o.c.limit_break || 0}: ${o.over.map(k => { const [ h, m ] = tot(o, k); return `${nm[k]} ${h}, max ${m}`; }).join(', ')})`;
    add('warning', `${over.length} fighter${over.length === 1 ? ' has' : 's have'} more decal slots, Death Bag or rage than ${over.length === 1 ? 'its' : 'their'} type, grade and limit break allow: ${over.slice(0, 4).map(lbl).join('; ')}${over.length > 4 ? '; …' : ''}. The game never makes these values (only Skill Masters gain rage, up to 8 at Limit Break 4); they come from another editor or an old editor version. The editor shows these fighters at their limits and leaves the save as it is unless you fix it.`, 'fighters', {
      label: 'Bring them back within the limits', run: () => { const n = fixFightersOverCap(); return `${n} fighter${n === 1 ? '' : 's'} set back within the limits for their limit break.`; }
    });
  });

  // decals equipped beyond the fighter's decal slots
  safe('decal slots', () => {
    const over = decalsOverSlots();
    if (!over.length) return;
    const n = over.reduce((k, o) => k + o.extra.length, 0);
    add('warning', `${over.length} fighter${over.length === 1 ? ' has' : 's have'} more decals equipped than ${over.length === 1 ? 'its' : 'their'} decal slots: ${over.slice(0, 4).map(o => `${escapeHtml(o.c.name || 'a fighter')} (${arr(o.c.eqskls).length} decals, ${o.slots} slots)`).join('; ')}${over.length > 4 ? '; …' : ''}. The game never equips more than the slots.`, 'fighters', {
      label: 'Take off the extra decals', run: () => { const k = fixDecalsOverSlots(); return `Took off ${k} decal${k === 1 ? '' : 's'} (premium ones went back to the decal stock).`; }
    });
  });

  // weapons / armor with more durability or ammo than the part allows
  safe('durability', () => {
    const over = partsOverMax();
    if (!over.length) return;
    const what = { dur: 'durability', rest: 'ammo', spare: 'spare ammo' };
    const lbl = o => `${escapeHtml(o.rec.name || o.inst.ptid)} (${escapeHtml(o.where)}: ${o.why.map(w => w === 'dur' ? `durability ${o.inst.dur} of ${o.md}` : w === 'rest' ? `ammo ${o.inst.rest} of ${o.rec.capacity}` : `spare ammo ${o.inst.spare} of ${o.rec.spare}`).join(', ')})`;
    add('warning', `${over.length} weapon${over.length === 1 ? '' : 's'}/armor ${over.length === 1 ? 'has' : 'have'} more ${[ ...new Set(over.flatMap(o => o.why)) ].map(w => what[w]).join(' or ')} than the part allows: ${over.slice(0, 4).map(lbl).join('; ')}${over.length > 4 ? '; …' : ''}. The game never goes above the part's maximum.`, 'storage', {
      label: 'Set them to the maximum', run: () => { const k = fixPartsOverMax(); return `${k} weapon${k === 1 ? '' : 's'}/armor set to the part's maximum.`; }
    });
  });

  // stat levels above the cap for the limit break
  safe('stat caps', () => {
    const over = statsOverCap();
    if (!over.length) return;
    const nm = { hp: 'HP', str: 'STR', dex: 'DEX', vit: 'VIT', stm: 'STM', luk: 'LUK' };
    add('warning', `${over.length} fighter${over.length === 1 ? ' has' : 's have'} stats above the cap for ${over.length === 1 ? 'its' : 'their'} grade and limit break: ${over.slice(0, 4).map(o => `${escapeHtml(o.c.name || 'a fighter')} (${o.over.map(k => `${nm[k]} ${o.c.bodylvl[k]}`).join(', ')}; cap ${o.R.statCap} plus bonus)`).join('; ')}${over.length > 4 ? '; …' : ''}. The game never raises a stat past the cap.`, 'fighters', {
      label: 'Set them to the cap', run: () => { const k = fixStatsOverCap(); return `${k} fighter${k === 1 ? '' : 's'} set to the stat cap, with the level recalculated.`; }
    });
  });

  // saved level not matching the stats and upgrades
  safe('fighter level', () => {
    const bad = levelMismatches();
    if (!bad.length) return;
    add('warning', `${bad.length} fighter${bad.length === 1 ? "'s level doesn't" : "s' levels don't"} match ${bad.length === 1 ? 'its' : 'their'} stats and upgrades: ${bad.slice(0, 4).map(c => `${escapeHtml(c.name || 'a fighter')} (saved ${c.lvl}, should be ${computedLevel(c)})`).join('; ')}${bad.length > 4 ? '; …' : ''}. The game's level is the six stats minus 5 plus the slots, bag and rage bought.`, 'fighters', {
      label: 'Recalculate the levels', run: () => { const k = fixLevelMismatches(); return `${k} level${k === 1 ? '' : 's'} recalculated.`; }
    });
  });

  // freezer hangers and Storage Box slots pointing at nothing
  safe('dangling slots', () => {
    const d = danglingSlots();
    if (!d.hangers.length && !d.storage.length) return;
    const parts = [ d.hangers.length && `${d.hangers.length} freezer hanger${d.hangers.length === 1 ? ' names a fighter' : 's name fighters'} that ${d.hangers.length === 1 ? "isn't" : "aren't"} in the save (or one already in another hanger)`, d.storage.length && `${d.storage.length} Storage Box slot${d.storage.length === 1 ? ' names an item' : 's name items'} that ${d.storage.length === 1 ? "isn't" : "aren't"} stored` ].filter(Boolean);
    add('problem', `${parts.join('; ')}. The game expects every hanger and slot to point at something real.`, d.hangers.length ? 'fighters' : 'storage', {
      label: 'Empty them', run: () => { const k = fixDanglingSlots(); return `Emptied ${k} hanger${k === 1 ? '' : 's'}/slot${k === 1 ? '' : 's'}.`; }
    });
  });

  // exactly one fighter in use
  safe('fighter in use', () => {
    const p = inUseProblem();
    if (!p) return;
    add('problem', p.use.length ? `${p.use.length} fighters are set as the fighter in use (${escapeHtml(p.use.map(c => c.name || '?').join(', '))}). The game always has exactly one.` : `No fighter is set as the fighter in use. The game always has exactly one.`, 'fighters', {
      label: p.use.length ? 'Keep one in use' : 'Pick one', run: fixInUse
    });
  });

  // defense lineup in step with the defenders
  safe('defense lineup', () => {
    const d = defenseProblems();
    if (!d.bad.length && !d.stray.length && d.alarms <= 1) return;
    const parts = [];
    if (d.bad.length) parts.push(`${d.bad.length} lineup place${d.bad.length === 1 ? '' : 's'} can't be used (${escapeHtml(d.bad.slice(0, 3).map(b => `${(b.c && b.c.name) || 'a missing fighter'}: ${b.why}`).join('; '))})`);
    if (d.stray.length) parts.push(`${d.stray.length} fighter${d.stray.length === 1 ? ' is' : 's are'} set to defend but not in the lineup (${escapeHtml(d.stray.slice(0, 3).map(c => c.name || '?').join(', '))})`);
    if (d.alarms > 1) parts.push(`${d.alarms} defenders carry the alarm (only one can)`);
    add('problem', `Defense lineup: ${parts.join('; ')}.`, 'defense', {
      label: 'Fix the lineup', run: () => { const k = fixDefenseProblems(); return `Fixed ${k} lineup problem${k === 1 ? '' : 's'} (defenders not in the lineup went back to the freezer).`; }
    });
  });

  // the defense alarm must be one this masters.db knows
  safe('defense alarm', () => {
    const id = alarmUnknown();
    if (!id) return;
    add('warning', `The defense alarm (${escapeHtml(id)}) isn't in this masters.db, so the game can't use it.`, 'defense', {
      label: 'Remove the alarm', run: () => { SAVE.soul.whistle_id = ''; for (const e of defLineup()) e.is_equip_whistle = 0; return 'Alarm removed.'; }
    });
  });

  // stored Bank / tank limits must match the level
  safe('bank limits', () => {
    const bad = bankLimitMismatches();
    if (!bad.length) return;
    add('warning', `${bad.map(b => `${b.label} limit is saved as ${b.have.toLocaleString()} but level ${SAVE.soul[b.lf]} holds ${b.want.toLocaleString()}`).join('; ')}.`, 'account', {
      label: 'Set the limit for the level', run: () => { for (const b of bankLimitMismatches()) SAVE.soul[b.kf] = b.want; return 'Limits set to match the levels.'; }
    });
  });

  // dates
  safe('dates', () => {
    if (!RAW_SAV_ROOT) return;
    const root = dtBuildRoot();
    const ref = Math.floor(Date.now() / 1000);
    const c = { future: 0, post2038: 0, wrapped: 0 };
    for (const g of dtScan(root)) for (const e of g.entries) { const p = dtProblem(g, e.v, ref); if (p) c[p]++; }
    const n = c.future + c.post2038 + c.wrapped;
    if (n) {
      const parts = [ c.wrapped && `${c.wrapped} overflowed (negative)`, c.post2038 && `${c.post2038} past the 2038 limit`, c.future && `${c.future} in the future` ].filter(Boolean).join(', ');
      add(c.wrapped || c.post2038 ? 'problem' : 'warning', `${n} date${n === 1 ? '' : 's'} left by time jumping: ${parts}. These can crash the game.`, 'dates', {
        label: 'Fix all dates', run: () => { DATE_RULES.push({ action: 'fix', pattern: '*', ref: Math.floor(Date.now() / 1000) }); return 'Bad dates will be set to now when you download.'; }
      });
    }
  });

  // research markers
  safe('research', () => {
    const research = arr(SAVE.user_research);
    if (!research.length) return;
    const n = normalizeResearchMarkers(JSON.parse(JSON.stringify(research)));
    if (n) add('warning', `${n} researched part${n === 1 ? ' is' : 's are'} missing the "next level" marker, so the game may not let you upgrade ${n === 1 ? 'it' : 'them'} further.`, 'research', {
      label: 'Fix markers', run: () => { const k = normalizeResearchMarkers(SAVE.user_research); return `Fixed the research markers on ${k} part${k === 1 ? '' : 's'}.`; }
    });
  });

  // PC save: PS-only parts missing their "next level" marker. A normal PC game never writes
  // these (it doesn't have the parts), so this is only a note -- it matters on PC games modded
  // to have the PlayStation parts.
  safe('research-ps', () => {
    if (!RESEARCH_GAME_SKIP.size) return;
    const found = [];
    normalizeResearchMarkers(JSON.parse(JSON.stringify(arr(SAVE.user_research))), found, new Map());
    const ids = [ ...new Set(found.map(f => f[0]).filter(id => RESEARCH_GAME_SKIP.has(id))) ];
    if (!ids.length) return;
    const names = [ ...new Set(ids.map(id => (PT_INDEX[id] && PT_INDEX[id].name) || id)) ];
    add('note', `${ids.length} PlayStation-only part${ids.length === 1 ? ' is' : 's are'} missing the "next level" marker (${names.slice(0, 5).map(escapeHtml).join(', ')}${names.length > 5 ? ', …' : ''}). A normal PC game doesn't have these parts, so this only matters if your PC game is modded to have them.`, 'research', {
      label: 'Fix PS-only markers', run: () => {
        const keep = new Map([ ...RESEARCH_GAME_SKIP ].filter(([ id ]) => !ids.includes(id)));
        const k = normalizeResearchMarkers(SAVE.user_research, null, keep);
        RESEARCH_GAME_SKIP = keep;
        return `Added the research markers on ${k} part${k === 1 ? '' : 's'}.`;
      }
    });
  });

  // rewards the PC game can't hand over (placeholders, unnamed, PS-only)
  safe('rewards-unfit', () => {
    const bad = arr(SAVE.presents).map(p => [ p, presentUnfit(p, isPsSave()) ]).filter(x => x[1]);
    if (!bad.length) return;
    const ps = bad.filter(x => x[1] === 'PlayStation-only').length, other = bad.length - ps;
    add(other ? 'warning' : 'note', `${bad.length} Reward Box item${bad.length === 1 ? '' : 's'} the PC game may not hand over properly: ${bad.slice(0, 4).map(([p, why]) => `${escapeHtml(cmpPresentLabel(p))} (${escapeHtml(why)})`).join(', ')}${bad.length > 4 ? '…' : ''}.${ps ? ' PlayStation-only ones only work in PC games modded to have them.' : ''}`, 'rewards', {
      label: other ? 'Remove the ones that can\'t work' : 'Remove them', run: () => { const drop = new Set(arr(SAVE.presents).filter(p => { const w = presentUnfit(p, isPsSave()); return w && (!other || w !== 'PlayStation-only'); })); SAVE.presents = SAVE.presents.filter(p => !drop.has(p)); return `Removed ${drop.size} reward${drop.size === 1 ? '' : 's'}.`; }
    });
  });

  // weapon / armor rewards with no durability (older editor versions sent them that way)
  safe('rewards-parts', () => {
    const bad = arr(SAVE.presents).filter(presentPartEmpty);
    if (bad.length) add('warning', `${bad.length} weapon/armor reward${bad.length === 1 ? '' : 's'} in the Reward Box would arrive with 0 durability and no ammo.`, 'rewards', {
      label: 'Fill durability and ammo', run: () => { let k = 0; for (const p of arr(SAVE.presents)) if (presentPartEmpty(p) && presentPartFull(p)) k++; return `Set full durability and ammo on ${k} reward${k === 1 ? '' : 's'}.`; }
    });
  });

  // Funshots: the game's one-time setup double-counts editor research; stored values above what research gives
  safe('stamps', () => {
    if (!RAW_SAV_ROOT || !AP || !AP.pts || !AP.pts.length) return;
    const comp = computeStampTotals(), cur = {};
    for (const e of arr(SAVE.soul.researchstamp)) cur[e.type] = Number(e.rate) || 0;
    const high = RESEARCH_STAMP_TYPES.filter(t => (cur[t] || 0) > (comp[t] || 0) + 0.05);
    if (!stampInitDone() && !stampMarked() && Object.values(cur).some(v => v > 0)) {
      add('problem', `Funshots are set, but the game hasn't run its one-time Funshot setup on this save. When it does (first Choku-Funsha visit) it counts research made by the editor twice, doubling the Funshots.`, 'research', {
        label: 'Set Funshots and mark the setup done', run: () => { syncStampFromResearch(); return 'Funshots set from research; the setup will be marked as done when you download.'; }
      });
    } else if (high.length) {
      add('warning', `Funshots are higher than your research gives: ${high.map(t => `${STAMP_LABELS[t]} ${cur[t]} (research gives ${comp[t]})`).join(', ')}. This is what the game's setup does on research made by the editor.`, 'research', {
        label: 'Set Funshots from research', run: () => { syncStampFromResearch(); return 'Funshots set from research.'; }
      });
    } else {
      // long-played saves often hold less than their research gives (seen in many real saves, never more)
      const low = RESEARCH_STAMP_TYPES.filter(t => (cur[t] || 0) < (comp[t] || 0) - 0.05);
      if (low.length) add('note', `Funshots are lower than your research gives: ${low.map(t => `${STAMP_LABELS[t]} ${cur[t] || 0} (research gives ${comp[t]})`).join(', ')}. Long-played saves often have this; the game shows what's saved. Research changes on the Research tab only add or remove what that change gives; the fix below sets all six to what research gives.`, 'research', {
        label: 'Set Funshots from research', run: () => { syncStampFromResearch(); return 'Funshots set from research.'; }
      });
    }
  });

  // weapon mastery above the game's top level (20): written by other tools; the game has no data for those levels
  safe('mastery-max', () => {
    const over = mstOverMax(), zov = mstZombieOverMax(RAW_SAV_ROOT);
    const capped = MASTERY_CAP.root === RAW_SAV_ROOT && MASTERY_CAP.on;
    if (!over.length && (!zov.length || capped)) return;
    const nm = id => { const r = arr(AP && AP.ptarmtps).find(x => x.id === id); return (r && resolveName(r.name)) || id; };
    const list = over.slice(0, 4).map(e => `${escapeHtml(nm(e.ptarmtp))} Lv ${e.lvl}`).join(', ') + (over.length > 4 ? ', …' : '');
    add('problem', `Weapon mastery is above the game's highest level (${mstMaxLevel((over[0] || {}).ptarmtp)})${over.length ? ` on ${over.length} weapon type${over.length === 1 ? '' : 's'} (${list})` : ''}${zov.length && !capped ? `${over.length ? ', and' : ' on'} ${zov.length} entr${zov.length === 1 ? 'y' : 'ies'} copied into your Haters` : ''}. The game has no data for those levels, which can break the save; another editor probably wrote them.`, 'account', {
      label: 'Set them to the top level', run: () => {
        for (const e of over) mstSetLevel(e, mstMaxLevel(e.ptarmtp));
        if (zov.length) MASTERY_CAP.root = RAW_SAV_ROOT, MASTERY_CAP.on = true;
        return `Weapon mastery capped at the top level (${over.length} weapon type${over.length === 1 ? '' : 's'}${zov.length ? `, ${zov.length} Hater entr${zov.length === 1 ? 'y' : 'ies'} on download` : ''}). Points over the top are kept, as the game does.`;
      }
    });
  });

  // weapon mastery: the level must match the mastery points (the game works it out from them)
  safe('mastery', () => {
    const bad = mstMismatches().filter(e => Number(e.lvl) <= mstMaxLevel(e.ptarmtp));
    if (!bad.length) return;
    const nm = id => { const r = arr(AP && AP.ptarmtps).find(x => x.id === id); return (r && resolveName(r.name)) || id; };
    add('warning', `Weapon mastery level doesn't match its mastery points on ${bad.length} weapon type${bad.length === 1 ? '' : 's'} (${bad.slice(0, 4).map(e => `${escapeHtml(nm(e.ptarmtp))} Lv ${e.lvl} with ${Number(e.abp)} pts`).join(', ')}${bad.length > 4 ? ', …' : ''}). Older editor versions set only the level; the game goes by the points.`, 'account', {
      label: 'Set points to match the levels', run: () => { for (const e of bad) mstSetLevel(e, Number(e.lvl) || 1); return `Mastery points set for ${bad.length} weapon type${bad.length === 1 ? '' : 's'}.`; }
    });
  });

  // research (R&D) recorded above the highest level the part can reach
  safe('research-levels', () => {
    const over = researchOverCap();
    if (!over.length) return;
    const parts = [ ...new Set(over.map(r => r.ptid)) ];
    const lbl = id => { const rec = PT_INDEX[id], top = Math.max(...over.filter(r => r.ptid === id).map(r => r.lvl)); return `${escapeHtml((rec || {}).name || id)} (researched to level ${top}, goes up to +${maxDisplayLevel(rec)})`; };
    add('warning', `${parts.length} blueprint${parts.length === 1 ? ' is' : 's are'} researched past the highest level ${parts.length === 1 ? 'its' : 'their'} part can reach: ${parts.slice(0, 4).map(lbl).join('; ')}${parts.length > 4 ? '; …' : ''}. The game wasn't made for these levels.`, 'research', {
      label: 'Cap the research at the highest level', run: () => { const n = fixResearchOverCap(); return `Removed ${n} research level${n === 1 ? '' : 's'} above the cap.`; }
    });
  });

  // weapons / armor above the highest level the part can reach (e.g. a +4 weapon at +10). The
  // editor and the game show them clamped to the part's cap, so they're easy to miss.
  safe('part-levels', () => {
    const over = partsOverCap();
    if (!over.length) return;
    const lbl = o => `${escapeHtml((PT_INDEX[o.ptid] || {}).name || o.ptid)} (${escapeHtml(o.where)}, stored as level ${o.lvl}, the part goes up to +${maxDisplayLevel(PT_INDEX[o.ptid])})`;
    add('warning', `${over.length} weapon${over.length === 1 ? '' : 's'}/armor ${over.length === 1 ? 'is' : 'are'} above the highest level ${over.length === 1 ? 'its' : 'their'} part can reach: ${over.slice(0, 4).map(lbl).join('; ')}${over.length > 4 ? '; …' : ''}. The game wasn't made for these levels.`, 'storage', {
      label: 'Set them to their highest level', run: () => { const n = fixPartsOverCap(); return `${n} weapon${n === 1 ? '' : 's'}/armor set to their highest level.`; }
    });
  });

  // armor skins in use must still be unlocked (R&D at +4)
  safe('armorskin', () => {
    const inUse = arr(SAVE.soul.armorskin).filter(x => x && x.ptid);
    if (!inUse.length) return;
    const bad = inUse.filter(x => !armorSkinUnlocked(SAVE.user_research, x.ptid));
    if (bad.length) add('warning', `${bad.length} Armor Skin${bad.length === 1 ? ' is' : 's are'} in use but no longer unlocked (research below +4): ${bad.map(x => escapeHtml((PT_INDEX[x.ptid] || {}).name || x.ptid)).join(', ')}.`, 'research', {
      label: 'Take those skins off', run: () => { const keep = arr(SAVE.soul.armorskin).filter(x => !x || !x.ptid || armorSkinUnlocked(SAVE.user_research, x.ptid)); const k = arr(SAVE.soul.armorskin).length - keep.length; SAVE.soul.armorskin = keep.length ? keep : (Array.isArray(SAVE.soul.armorskin) ? [] : {}); return `Took off ${k} Armor Skin${k === 1 ? '' : 's'}; the fighter shows their real armor.`; }
    });
  });

  // defense: at most 9 defenders (one wave 5, the other 4)
  safe('defense', () => {
    const list = arr(SAVE.fortsetting);
    if (list.length <= DEF_MAX) return;
    add('problem', `${list.length} fighters are set to defend; the game allows ${DEF_MAX} (one wave 5, the other 4).`, 'defense', {
      label: `Keep the first ${DEF_MAX}`, run: () => { const l = defLineup().slice().sort((a, b) => a.wave - b.wave || a.order - b.order); for (const e of l.slice(DEF_MAX)) defPlace(e.wave, e.order, ''); return `Removed ${l.length - DEF_MAX} defender${l.length - DEF_MAX === 1 ? '' : 's'}; they're back in the freezer.`; }
    });
  });

  // fighters closed mid-run (game closed or crashed without pausing) get a Bloodnium penalty
  safe('force-close', () => {
    const f = shutdownCounts(RAW_SAV_ROOT), lim = constIntOf('FORCE_SHUTDOWN_BLOODNIUM_PENALTY_COUNT', 3), big = constIntOf('FORCE_SHUTDOWN_BLOODNIUM_LARGE_PENALTY_COUNT', 10);
    if (RUN_END.root === RAW_SAV_ROOT && RUN_END.on) return; // ending the run clears the counts, like the game
    const reset = SHUTDOWN_RESET.root === RAW_SAV_ROOT ? SHUTDOWN_RESET.cids : new Set();
    const hit = arr(soul.chrs).filter(c => c && c.cid && !reset.has(c.cid) && Number(f[c.cid]) >= lim);
    if (!hit.length) return;
    const pause = String(soul.pause || '');
    const crash = /_CRASH$/.test(pause) ? ` The last session ended without pausing (${escapeHtml(pause)}${soul.flrid ? ` on ${escapeHtml(hvnFloor(soul.flrid) ? hvnFloorLabel(hvnFloor(soul.flrid)) : soul.flrid)}` : ''}).` : '';
    add('warning', `${hit.map(c => `${escapeHtml(c.name || 'a fighter')} (${Number(f[c.cid])}×)`).join(', ')} ${hit.length === 1 ? 'has' : 'have'} been force-closed during a run: the game or console was closed, or it crashed, without pausing.${crash} From ${lim} the game cuts the Bloodnium that run brings home, and from ${big} it cuts it much harder. Pause before quitting to avoid it.`, 'fighters', {
      label: 'Reset the force-close count', run: () => { if (SHUTDOWN_RESET.root !== RAW_SAV_ROOT) SHUTDOWN_RESET.root = RAW_SAV_ROOT, SHUTDOWN_RESET.cids = new Set(); hit.forEach(c => SHUTDOWN_RESET.cids.add(c.cid)); return `Reset to 0 for ${hit.map(c => c.name).join(', ')} (applied when you download).`; }
    });
  });

  // a run that ended without pausing (game closed or crashed): the game resumes it on load
  safe('run-crash', () => {
    const pz = String((RAW_SAV_ROOT && RAW_SAV_ROOT.soul && RAW_SAV_ROOT.soul.pause) || '');
    if (!/_CRASH$/.test(pz) || (RUN_END.root === RAW_SAV_ROOT && RUN_END.on) || (REWIND.root === RAW_SAV_ROOT && REWIND.on)) return;
    const rw = rewindInfo(RAW_SAV_ROOT);
    const normal = rw ? ` It crashed on a <b>normal (randomly built) floor</b>: every crashing save we've seen stopped on one, while saves paused on boss floors load fine, so this is the likely cause.${rw.pos ? ` The Location tab can also try putting the fighter back on the last boss floor (${rw.floor.no}F) to keep the run (confirmed in game).` : ''}` : '';
    const ri = runEndInfo(RAW_SAV_ROOT), fl = hvnFloor(RAW_SAV_ROOT.soul.flrid);
    // closed on a boss floor (first seen 2026-10-07, a 95F Screamer Pit closed mid-fight): every save we've seen crash
    // on load stopped on a normal floor, and boss floors always use the same map, so this one may load as it is
    const boss = !rw && fl && Number(fl.mbsmax) > 0 ? ` It stopped on a <b>boss floor</b>, which is new to us: every save we've seen crash on load stopped on a normal (randomly built) floor, and boss floors always use the same map, so this one may load as it is. Keep a backup and try it first; if it crashes, end the run.` : '';
    const who = escapeHtml(ri && ri.chr ? ri.chr.name || 'the fighter' : 'the fighter');
    const loss = ri && ri.lost > 0 ? ` Kill Coins carried go to the Bank up to its limit, so ${ri.lost.toLocaleString()} would be lost (raise the Bank level first to keep them).` : '';
    add('warning', `The save is in a run that ended without pausing (${escapeHtml(pz)}${fl ? ', ' + escapeHtml(hvnFloorLabel(fl)) : ''}${ri && ri.floors ? `, ${ri.floors} floors into the run` : ''}). The game tries to pick the run up again when it loads, and saves like this can crash on load. <b>Ending the run fixes that (confirmed in game)</b>: ${who} goes back to the Waiting Room with the Death Bag. Renewing the Express Pass doesn't fix it.${normal}${boss}${loss}`, 'location', {
      label: `End the run (send ${who} home)`, run: () => { RUN_END.root = RAW_SAV_ROOT; RUN_END.on = true; return `The run will end when you download: ${ri && ri.chr ? ri.chr.name : 'the fighter'} goes back to the Waiting Room. Untick it on the Location tab to keep the run.`; }
    });
  });

  // fighters: bag overflow, duplicate or unknown items
  safe('fighters', () => {
    const seen = new Map;
    const note = (eid, where) => { if (!eid || eid === '-1') return; seen.set(eid, (seen.get(eid) || []).concat(where)); };
    const unknown = [];
    for (const c of arr(soul.chrs)) {
      const name = c.name || 'a fighter';
      const cap = deathBagLimit(c), n = fighterItemCount(c);
      if (cap && n > cap) {
        // an Express Pass that has run out: the game sized the bag (the save's slot list) with its +10
        // while it was on, so the items fit the bag the game made; it's the pass, not the bag
        const v = soul.vip || {}, bonus = constIntOf('VIP_INCREASE_DEATHBAG', 10);
        const lapsed = Number(v.vip_flag != null ? v.vip_flag : v.flag) && !vipBagBonus();
        const rawBag = RAW_SAV_ROOT && RAW_SAV_ROOT.soul && RAW_SAV_ROOT.soul.deathbag && RAW_SAV_ROOT.soul.deathbag[RAW_SAV_MAIN_UID];
        const slotsInSave = Array.isArray(rawBag && rawBag[c.cid]) ? rawBag[c.cid].length : 0;
        if (lapsed && n <= cap + bonus) add('warning', `${escapeHtml(name)} is carrying ${n} items in a ${cap}-slot Death Bag. That only fits with the Express Pass's +${bonus}, and the pass ran out ${escapeHtml(dtFmt(v.expired_time))}${slotsInSave ? ` (the game last saved this bag with ${slotsInSave} slots)` : ''}. Starting a new pass in game (or on the VIP tab) gives the slots back.`, 'vip', {
          label: 'Renew the Express Pass', run: () => { setVipPlan(vipPlanOf(SAVE.soul.vip) === 'none' ? 'day' : vipPlanOf(SAVE.soul.vip), true); return `Express Pass renewed until ${dtFmt(SAVE.soul.vip.expired_time)}.`; }
        });
        else add('warning', `${escapeHtml(name)} is carrying ${n} items but their Death Bag only holds ${cap}${vipBagBonus() ? ' (with the Express Pass bonus)' : ''}.`, 'fighters');
      }
      if (c.state !== 'DUMMY') {
        const gp = gearProblems(c);
        if (gp.length) add('warning', `${escapeHtml(name)} has ${gp.length} piece${gp.length === 1 ? '' : 's'} of gear equipped that the game wouldn't allow (${escapeHtml(gp[0].why)}${gp.length > 1 ? ', …' : ''}).`, 'fighters', {
          label: `Unequip ${escapeHtml(name)}'s`, run: () => { const k = unequipProblemGear(c); return `Unequipped ${k} item${k === 1 ? '' : 's'} from ${name}.`; }
        });
      }
      for (const p of arr(c.pspts)) { note(p.eptid, name); if (p.ptid && !PT_INDEX[p.ptid]) unknown.push(p.ptid); }
      for (const m of arr(c.psmsrs)) { note(m.emsrid, name); if (m.msrid && !MSR_INDEX[m.msrid]) unknown.push(m.msrid); }
      for (const b of arr(c.psbsts)) { note(b.ebstid, name); if (b.bstid && !BST_INDEX[b.bstid]) unknown.push(b.bstid); }
      for (const it of arr(c.psitems)) { note(it.eitemid, name); if (it.itemId && !ITEM_INDEX[it.itemId]) unknown.push(it.itemId); }
    }
    const cl = SAVE.cl || {};
    for (const s of arr(cl.slots)) for (const k of [ 'eptid', 'emsrid', 'ebstid', 'eitemid' ]) note(s[k], 'Storage Box');
    for (const p of arr(cl.pts)) if (p.ptid && !PT_INDEX[p.ptid]) unknown.push(p.ptid);
    for (const it of arr(cl.items)) if (it.itemId && !ITEM_INDEX[it.itemId]) unknown.push(it.itemId);
    const dup = [ ...seen.entries() ].filter(([, w]) => w.length > 1);
    if (dup.length) add('problem', `${dup.length} item${dup.length === 1 ? ' is' : 's are'} in two places at once (for example: ${escapeHtml([ ...new Set(dup[0][1]) ].join(' and '))}). The game expects each item to exist once.`, 'storage');
    const u = [ ...new Set(unknown) ];
    if (u.length) add('warning', `${u.length} item type${u.length === 1 ? '' : 's'} in your inventory ${u.length === 1 ? "isn't" : "aren't"} in this masters.db (${escapeHtml(u.slice(0, 3).join(', '))}${u.length > 3 ? ', ...' : ''}). They may come from another game version or a PlayStation save, or another tool added them (an item the game doesn't have can stop the save loading). If the masters.db you loaded is your game's current one, remove them.`, 'fighters', {
      label: 'Remove those items', run: () => {
        // parts / mushrooms / beasts / items whose id masters.db doesn't know, from every fighter and the Storage Box.
        // Fighters' rows are dropped from the save's item tables too (as when a fighter is deleted); a Storage Box
        // row is dropped at download once no slot points to it.
        if (FIGHTER_DELETES.root !== RAW_SAV_ROOT) FIGHTER_DELETES = { root: RAW_SAV_ROOT, cids: new Set, eids: new Set };
        const unk = { pspts: [ 'eptid', 'ptid', PT_INDEX ], psmsrs: [ 'emsrid', 'msrid', MSR_INDEX ], psbsts: [ 'ebstid', 'bstid', BST_INDEX ], psitems: [ 'eitemid', 'itemId', ITEM_INDEX ] };
        let n = 0;
        for (const c of arr(SAVE.soul.chrs)) {
          for (const [list, [eidKey, idKey, index]] of Object.entries(unk)) {
            const bad = new Set(arr(c[list]).filter(x => x && x[idKey] && !index[x[idKey]]).map(x => x[eidKey]));
            if (!bad.size) continue;
            c[list] = arr(c[list]).filter(x => !bad.has(x[eidKey]));
            if (list === 'pspts') {
              c.eqpts = arr(c.eqpts).filter(e => !bad.has(e.eptid));
              if (c.armslots) for (const k of Object.keys(c.armslots)) if (bad.has(c.armslots[k])) delete c.armslots[k];
            }
            for (const e of bad) FIGHTER_DELETES.eids.add(e);
            n += bad.size;
          }
        }
        const clBad = new Set();
        for (const p of arr(cl.pts)) if (p.ptid && !PT_INDEX[p.ptid]) clBad.add(p.eptid);
        for (const it of arr(cl.items)) if (it.itemId && !ITEM_INDEX[it.itemId]) clBad.add(it.eitemid);
        for (const sl of arr(cl.slots)) for (const k of [ 'eptid', 'eitemid' ]) if (clBad.has(sl[k])) { sl[k] = '-1'; n++; }
        return `Removed ${n} item${n === 1 ? '' : 's'} the loaded masters.db doesn't know.`;
      }
    });
  });

  // fighters the old "Add Character" created (no freezer slot, missing fields)
  safe('freezer', () => {
    const bad = brokenFighters();
    if (bad.length) add('problem', `${bad.length} fighter${bad.length === 1 ? '' : 's'} (${escapeHtml(bad.map(c => c.name || '?').join(', '))}) ${bad.length === 1 ? 'was' : 'were'} added by an older editor version without a freezer slot or the fields the game needs. This can stop the game from booting.`, 'fighters', {
      label: 'Remove broken fighters', run: () => {
        const ids = new Set(brokenFighters().map(c => c.cid));
        SAVE.soul.chrs = SAVE.soul.chrs.filter(c => !ids.has(c.cid));
        if (ids.has(SAVE.soul.crntcid)) SAVE.soul.crntcid = (SAVE.soul.chrs[0] || {}).cid;
        activeCharIdx = 0;
        return `Removed ${ids.size} broken fighter${ids.size === 1 ? '' : 's'}. Your real fighters are untouched.`;
      }
    });
  });

  // negative or overflowed numbers (another tool set a value past what the game's 32-bit numbers hold, so it wrapped
  // round to a negative); the game can't use them
  safe('negative-values', () => {
    const INT_MAX = 2147483647, bad = [];
    // big64 = the game stores it as a 64-bit number (rank points run to 18 billion and more), so only negatives count
    const look = (obj, key, label, where, big64) => { const v = Number(obj && obj[key]); if (obj && key in obj && (v < 0 || (!big64 && v > INT_MAX))) bad.push({ obj, key, label, where, v }); };
    for (const [k, label, big] of [ [ 'free_money', 'Kill Coins' ], [ 'spirit', 'SPLithium' ], [ 'bloodnium_point', 'Bloodnium' ], [ 'recycle_point', 'Recycle Points' ], [ 'tdm_point', 'TDM points' ], [ 'rank_point', 'rank points', true ] ]) look(soul, k, label, 'account', big);
    for (const c of arr(soul.chrs)) for (const [k, label, big] of [ [ 'money', 'Kill Coins carried' ], [ 'spirit', 'SPLithium carried' ], [ 'bloodnium', 'Bloodnium carried' ], [ 'total_exp', 'experience', true ], [ 'rest_exp', 'experience', true ] ]) look(c, k, label, c.name || 'a fighter', big);
    if (!bad.length) return;
    add('problem', `${bad.length} value${bad.length === 1 ? ' is' : 's are'} negative or too big for the game: ${bad.slice(0, 4).map(b => `${escapeHtml(b.where)}: ${b.label} ${b.v.toLocaleString()}`).join('; ')}${bad.length > 4 ? '; …' : ''}. A number like this usually means another tool set it past the game's limit and it wrapped round to a negative.`, 'fighters', {
      label: 'Set them to 0', run: () => { for (const b of bad) b.obj[b.key] = 0; return `Set ${bad.length} value${bad.length === 1 ? '' : 's'} to 0.`; }
    });
  });

  // research (R&D) for parts that don't exist in the loaded masters.db
  safe('research-unknown', () => {
    if (!PT_INDEX || !Object.keys(PT_INDEX).length) return;
    const bad = arr(SAVE.user_research).filter(r => r && ((r.ptid && !PT_INDEX[r.ptid]) || (r.before_ptid && !PT_INDEX[r.before_ptid])));
    if (!bad.length) return;
    const ids = [ ...new Set(bad.map(r => PT_INDEX[r.ptid] ? r.before_ptid : r.ptid)) ];
    add('problem', `${bad.length} research (R&D) entr${bad.length === 1 ? 'y is' : 'ies are'} for part${ids.length === 1 ? '' : 's'} the game doesn't have (${ids.slice(0, 4).map(escapeHtml).join(', ')}${ids.length > 4 ? ', …' : ''}). If the masters.db you loaded is your game's current one, another tool added these and they can break R&D. (If you loaded an older masters.db, load the game's own first: then these may be real.)`, 'research', {
      label: 'Remove them', run: () => {
        const drop = new Set(bad);
        SAVE.user_research = SAVE.user_research.filter(r => !drop.has(r));
        normalizeResearchMarkers(SAVE.user_research);
        return `Removed ${bad.length} research entr${bad.length === 1 ? 'y' : 'ies'} for parts the game doesn't have.`;
      }
    });
  });

  // currencies over bank capacity
  safe('bank', () => {
    const rows = [ [ 'free_money', 'safe_level', 'Kill Coins' ], [ 'spirit', 'spirit_tank_level', 'SPLithium' ] ];
    for (const [v, l, label] of rows) {
      const cap = bankCapacityForLevel(soul[l] != null ? soul[l] : 1, l);
      if (cap && (soul[v] || 0) > cap) {
        // smallest bank level that holds the amount; if even the top level can't, top level and the amount cut to its cap
        const top = bankMaxLevel(l), held = Number(soul[v]);
        let fit = null;
        for (let lv = Number(soul[l]) || 1; lv <= top; lv++) { const c = bankCapacityForLevel(lv, l); if (c && c >= held) { fit = lv; break; } }
        const topCap = bankCapacityForLevel(top, l);
        add('warning', `${label} (${held.toLocaleString()}) is over the bank limit for its level (${cap.toLocaleString()})${fit ? '' : `, and over the limit of the top level too (${Number(topCap).toLocaleString()})`}.`, 'account', fit
          ? { label: `Raise the bank to level ${fit}`, run: () => { soul[l] = fit; const lk = l.replace('_level', '_limit'); if (lk in soul) soul[lk] = bankCapacityForLevel(fit, l); return `${label} bank raised to level ${fit} (holds ${Number(bankCapacityForLevel(fit, l)).toLocaleString()}).`; } }
          : { label: `Top level, ${label} at its limit`, run: () => { soul[l] = top; const lk = l.replace('_level', '_limit'); if (lk in soul) soul[lk] = topCap; soul[v] = topCap; return `${label} bank at level ${top}; ${label} set to ${Number(topCap).toLocaleString()} (${(held - topCap).toLocaleString()} over the limit removed).`; } });
      }
    }
  });

  // decals
  safe('decals', () => {
    // flag values outside what the Decals tab allows (0 to DECAL_CAP)
    const neg = arr(soul.psskls).filter(e => (e.cnt || 0) < 0);
    if (neg.length) add('problem', `${neg.length} decal count${neg.length === 1 ? ' is' : 's are'} negative.`, 'decals');
    const over = arr(soul.psskls).filter(e => (e.cnt || 0) > DECAL_CAP);
    if (over.length) add('warning', `${over.length} decal count${over.length === 1 ? ' is' : 's are'} above ${DECAL_CAP}.`, 'decals');
    const unk = arr(soul.psskls).filter(e => e.id && !SKL_INDEX[e.id]);
    if (unk.length) add('note', `${unk.length} decal${unk.length === 1 ? '' : 's'} in your collection ${unk.length === 1 ? "isn't" : "aren't"} in this masters.db.`, 'decals');
  });

  // stews
  safe('stews', () => {
    const q = typeof stewQueue === 'function' ? stewQueue() : null;
    if (q) {
      const unk = q.filter(s => !SKL_INDEX[s]).length;
      if (unk) add('warning', `${unk} queued stew result${unk === 1 ? '' : 's'} ${unk === 1 ? "isn't a decal" : "aren't decals"} this masters.db knows.`, 'stews');
    }
  });

  // quests
  safe('quests', () => {
    const q = questData();
    if (!q) return;
    const M = questMeta();
    const unk = q.ord.filter(o => !M.byId[o.qid]);
    if (unk.length) add('warning', `${unk.length} current quest${unk.length === 1 ? ' is' : 's are'} not in this masters.db (${escapeHtml(unk.map(o => o.qid).slice(0, 3).join(', '))}).`, 'quests');
    const done = q.ord.filter(o => o.prgmax > 0 && o.prgnow >= o.prgmax).length;
    if (done) add('note', `${done} current quest${done === 1 ? ' is' : 's are'} complete and ready to report in game.`, 'quests');
  });

  // reward box entries in a format the game can read
  safe('reward box', () => {
    const bad = arr(SAVE.presents).filter(p => presentProblems(p).length);
    if (bad.length) add('problem', `${bad.length} Reward Box item${bad.length === 1 ? ' is' : 's are'} in a format the game can't read (added by an older editor version). This can make the in-game Reward Box show as empty.`, 'rewards', {
      label: 'Fix Reward Box', run: () => { const k = normalizePresents(SAVE.presents); return `Rewrote ${k} Reward Box item${k === 1 ? '' : 's'} in the game's format.`; }
    });
  });

  // death boxes / lost bags
  safe('death boxes', () => {
    const boxes = arr(soul.deathbox);
    const now = Math.floor(Date.now() / 1000);
    const ready = boxes.filter(x => !(x.opentime > now)).length;
    if (ready) add('note', `${ready} death box${ready === 1 ? ' is' : 'es are'} ready to open.`, 'boxes');
    const bad = boxes.filter(boxBadFormat).length;
    if (bad) add('warning', `${bad} death box${bad === 1 ? ' is' : 'es are'} stored in a format the game doesn't write (an older editor version), so the item shows without an icon when you open ${bad === 1 ? 'it' : 'them'}.`, 'boxes', {
      label: 'Fix death boxes', run: () => { const k = fixBoxFormats(SAVE.soul.deathbox); return `Rewrote ${k} death box${k === 1 ? '' : 'es'} the way the game stores them.`; }
    });
  });
  safe('lost bags', () => {
    const b = soul.mysterybag;
    if (!b || typeof b !== 'object') return;
    const gen = bagGenIndex();
    let unk = 0;
    for (const k of Object.keys(b)) for (const e of arr(b[k])) if (!gen[e.cntgen]) unk++;
    if (unk) add('warning', `${unk} upcoming Lost Bag reward${unk === 1 ? '' : 's'} ${unk === 1 ? "isn't" : "aren't"} in this masters.db.`, 'bags');
  });

  // waiting room: exactly one decoration in use per spot
  safe('waiting room', () => {
    const list = arr(soul.hubcustom);
    if (!list.length) return;
    const meta = hubMeta();
    const bySite = {};
    for (const e of list) { const s = (meta[e.cstmid] && meta[e.cstmid].site) || e.cstmid.split('_')[2]; (bySite[s] = bySite[s] || []).push(e); }
    const bad = Object.entries(bySite).filter(([, es]) => es.filter(e => e.flg & 4).length !== 1).map(([s]) => hubSiteName(s));
    if (bad.length) add('warning', `Waiting Room spot${bad.length === 1 ? '' : 's'} with no decoration (or more than one) in use: ${escapeHtml(bad.join(', '))}.`, 'hub');
  });

  safe('masters.db match', () => { const t = uiMastersCheckItem(); if (t) add('warning', t); });

  // Sort worst first (stable), attach the human tab label, and publish the cache.
  const order = { problem: 0, warning: 1, note: 2 };
  out.sort((a, b) => order[a.level] - order[b.level]);
  for (const it of out) it.tabName = it.tab ? tabLabel(it.tab) : '';
  HEALTH = { items: out, ranAt: Date.now(), open: HEALTH.open, lastMsg: '' };
}

// Builds the collapsible Save check panel HTML from HEALTH (open by default only when there are problems).
// Fix/jump buttons carry data-health-fix / data-health-go indexes that wireHealth() handles.
function blockHealth() {
  if (!SAVE) return '';
  const items = HEALTH.items;
  const n = { problem: 0, warning: 0, note: 0 };
  for (const it of items) n[it.level]++;
  const bad = n.problem + n.warning;
  const open = HEALTH.open != null ? HEALTH.open : n.problem > 0;
  const color = n.problem ? 'var(--accent-bright)' : n.warning ? 'var(--warn)' : 'var(--good-bright)';
  const summary = !items.length ? 'No problems found' : [ n.problem && `${n.problem} problem${n.problem === 1 ? '' : 's'}`, n.warning && `${n.warning} warning${n.warning === 1 ? '' : 's'}`, n.note && `${n.note} note${n.note === 1 ? '' : 's'}` ].filter(Boolean).join(' · ');
  const badge = { problem: '<span class="hcBadge hcProblem">Problem</span>', warning: '<span class="hcBadge hcWarn">Warning</span>', note: '<span class="hcBadge hcNote">Note</span>' };
  return `<details class="healthPanel" id="health-panel" ${open ? 'open' : ''} style="border-color:${color};">
    <summary><span style="color:${color}; font-weight:bold;">Save check:</span> ${summary}<span style="flex:1;"></span><button class="subtle" id="health-recheck">Re-check</button></summary>
    <div class="healthBody">
      ${HEALTH.lastMsg ? `<div class="stewLog" style="margin-bottom:8px;">${escapeHtml(HEALTH.lastMsg)}</div>` : ''}
      ${items.length ? items.map((it, i) => `<div class="healthRow">${badge[it.level]}<div class="healthText">${it.text}</div>
        ${it.fix ? `<button class="action" data-health-fix="${i}">${escapeHtml(it.fix.label)}</button>` : ''}
        ${it.tab ? `<button class="subtle" data-health-go="${it.tab}">Open ${escapeHtml(it.tabName)}</button>` : ''}</div>`).join('') : '<div style="font-size:12px; color:var(--text-dim);">Nothing the editor knows to look for is wrong with this save.</div>'}
      <div class="capNote" style="margin:6px 0 0;">Checked ${HEALTH.ranAt ? new Date(HEALTH.ranAt).toLocaleTimeString() : 'never'}. The check looks for problems the editor understands; it can't prove a save is perfect.</div>
    </div>
  </details>`;
}

// Wires the panel: remembers open state, Re-check, tab jump buttons, and one-click fixes. After a fix the check is rerun
// and the whole UI re-rendered so every tab reflects the change.
function wireHealth() {
  const panel = document.getElementById('health-panel');
  if (!panel) return;
  panel.addEventListener('toggle', () => { HEALTH.open = panel.open; });
  document.getElementById('health-recheck').addEventListener('click', e => {
    e.preventDefault();
    runSaveCheck();
    HEALTH.open = true;
    renderAll();
    toast('Save checked');
  });
  panel.querySelectorAll('[data-health-go]').forEach(b => b.addEventListener('click', () => {
    const btn = document.querySelector(`[data-tab-btn="${b.dataset.healthGo}"]`);
    if (btn) btn.click();
  }));
  panel.querySelectorAll('[data-health-fix]').forEach(b => b.addEventListener('click', () => {
    const it = HEALTH.items[Number(b.dataset.healthFix)];
    let msg = '';
    try { msg = it.fix.run() || ''; } catch (err) { toast('Fix failed: ' + err.message, true); return; }
    runSaveCheck();
    HEALTH.lastMsg = msg;
    HEALTH.open = true;
    renderAll();
    toast(msg || 'Fixed');
  }));
}

// ---------------------------------------------------------------------------
// DEAD FIGHTER ARCHIVE (diedchara) - view only. The save keeps a record of
// every fighter that died, yours (your uid) and other players' (negative uids,
// the offline game's simulated players). dchrarcs[uid] holds the records;
// bodylvls / pspts / eqpts / eqskls hold stats, gear and decals, keyed by the
// record's did, for the fighters the game kept full details for. Nothing on
// this tab changes the save.
// ---------------------------------------------------------------------------

