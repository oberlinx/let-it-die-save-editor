// Tab tests: one edit per tab, made in a real browser by clicking the tab's own buttons (or calling the function the
// button calls, where it opens a search box), then downloaded, read back and loaded again (see PAGE_HELPERS in
// browser.js). Each scenario:
//   tab       the tab to open first
//   applies() whether the edit makes sense on this save
//   apply()   makes the edit; returns { label, skip?, pending?, allow? } (pending: the edit is only written at download, so
//             there's nothing to read back before it; check() does the checking. allow: text of a new Save check
//             finding the edit is expected to cause, which then doesn't count)
//   probe()   reads what the edit is about from the editor; it must change with the edit and read the same after
//             the download is loaded back
//   check()   optional extra check after the reload; returns an error message or ''
// Every scenario also fails if the edited save has a Save check problem or warning the save didn't have before.
//
// The functions below run INSIDE THE PAGE (they're sent as source text), so they can only use the page's own globals.

const SCENARIOS = [
  {
    name: 'Research: Max all, every slot',
    tab: 'research',
    applies: () => !!SAVE,
    apply: async () => {
      const tabs = [ ...document.querySelectorAll('[data-bp-subtab]') ].map(b => b.dataset.bpSubtab);
      for (const t of tabs) {
        const b = document.querySelector(`[data-bp-subtab="${t}"]`); if (b) b.click();
        await __T.sleep(10);
        document.getElementById('bp-max-all').click();
      }
      return { label: `${tabs.length} slot${tabs.length === 1 ? '' : 's'}` };
    },
    probe: () => { const m = {}; for (const r of arr(SAVE.user_research)) if (r.research_type === 'FINISHED') m[r.ptid] = Math.max(m[r.ptid] || 0, Number(r.lvl) || 0); return m; }
  },
  {
    name: 'Decals: Max all',
    tab: 'decals',
    applies: () => !!SAVE,
    apply: async () => { document.getElementById('decal-max-all').click(); return { label: 'every decal to the cap' }; },
    probe: () => { const m = {}; for (const s of arr(SAVE.soul.psskls)) if (s && s.id) m[s.id] = Number(s.cnt) || 0; return m; }
  },
  {
    name: 'Storage: deposit a weapon',
    tab: 'storage',
    applies: () => !!(SAVE && SAVE.cl),
    apply: async () => {
      if (storageFreeSlotIndex() < 0) { document.getElementById('sb-max').click(); await __T.sleep(10); }
      if (storageFreeSlotIndex() < 0) return { skip: 'the Storage Box is full at its largest size' };
      const rec = Object.values(PT_INDEX).find(p => /^PTTP_ARM/.test(p.type || '') && isPartObtainable(p.id) && !isPsOnlyPart(p.id));
      if (!rec) return { skip: 'no weapon to deposit' };
      sbCategory = 'pt';
      const q = document.getElementById('sb-qty'); if (q) q.value = '1';
      depositToStorage(rec); renderAll();
      return { label: rec.name || rec.id };
    },
    probe: () => {
      const cl = SAVE.cl || {}, by = (L, k) => Object.fromEntries(arr(L).map(x => [ x[k], x ]));
      const pts = by(cl.pts, 'eptid'), msrs = by(cl.msrs, 'emsrid'), bsts = by(cl.bsts, 'ebstid'), items = by(cl.items, 'eitemid');
      return arr(cl.slots).map(s => s.eptid && s.eptid !== '-1' ? 'pt:' + (pts[s.eptid] || {}).ptid + ':' + (pts[s.eptid] || {}).lvl
        : s.emsrid && s.emsrid !== '-1' ? 'msr:' + (msrs[s.emsrid] || {}).msrid : s.ebstid && s.ebstid !== '-1' ? 'bst:' + (bsts[s.ebstid] || {}).bstid
        : s.eitemid && s.eitemid !== '-1' ? 'item:' + (items[s.eitemid] || {}).itemId : '');
    }
  },
  {
    name: 'Storage: clear the box',
    tab: 'storage',
    applies: () => !!(SAVE && SAVE.cl) && arr(SAVE.cl.slots).some(s => [ s.eptid, s.emsrid, s.ebstid, s.eitemid ].some(e => e && e !== '-1')),
    apply: async () => { const n = arr(SAVE.cl.slots).filter(s => [ s.eptid, s.emsrid, s.ebstid, s.eitemid ].some(e => e && e !== '-1')).length; document.getElementById('sb-clear-all').click(); return { label: `${n} item${n === 1 ? '' : 's'}` }; },
    probe: () => arr((SAVE.cl || {}).slots).filter(s => [ s.eptid, s.emsrid, s.ebstid, s.eitemid ].some(e => e && e !== '-1')).length,
    check: () => { const left = arr(RAW_SAV_ROOT.part && RAW_SAV_ROOT.part.pts && RAW_SAV_ROOT.part.pts[RAW_SAV_MAIN_UID]).filter(p => p.owner === 'COIN_LOCKER').length; return left ? `${left} part${left === 1 ? ' is' : 's are'} still owned by the Storage Box with no slot` : ''; }
  },
  {
    name: 'Rewards: send a weapon',
    tab: 'rewards',
    applies: () => !!SAVE,
    apply: async () => {
      const rec = Object.values(PT_INDEX).find(p => /^PTTP_ARM/.test(p.type || '') && isPartObtainable(p.id) && !isPsOnlyPart(p.id));
      if (!rec) return { skip: 'no weapon to send' };
      addPresent(rec.type || 'PTTP_ARM', 1, rec.id, 0); presentPartFull(SAVE.presents[SAVE.presents.length - 1]); renderAll();
      return { label: rec.name || rec.id };
    },
    probe: () => arr(SAVE.presents).map(p => [ p.pid, p.type, p.val0, String(p.num), String(p.val1), String(p.val2), String(p.val3), String(p.val4) ].join('|')).sort(),
    check: () => { const p = arr(SAVE.presents).filter(isPartPresent).find(presentPartEmpty); return p ? `a weapon reward arrives empty (${p.val0})` : ''; }
  },
  {
    name: 'Rewards: send a Lost Bag',
    tab: 'rewards',
    applies: () => !!SAVE && BAG_RARITIES.some(r => bagPool(r).length),
    apply: async () => {
      const r = BAG_RARITIES.find(x => bagPool(x).length), pool = bagPool(r);
      const p = addLostBagPresent(r, pool[0].id); renderAll();
      return p ? { label: `${bagTitle(r)} Lost Bag` } : { skip: 'no Lost Bag content to send' };
    },
    probe: () => arr(SAVE.presents).map(p => [ p.pid, p.type, p.kind, p.val0, String(p.num) ].join('|')).sort()
  },
  {
    name: 'Quests: take, complete and drop',
    tab: 'quests',
    applies: () => { if (!questData()) return false; QUEST_FORM.open = 'add'; renderQuests(); return !!document.querySelector('[data-q-take]'); },
    apply: async () => {
      const view = v => { QUEST_FORM.open = v; renderQuests(); };
      const take = () => { view('add'); const b = document.querySelector('[data-q-take]'); if (b) { b.click(); return b.dataset.qTake; } return ''; };
      const a = take();
      view('active'); const c = [ ...document.querySelectorAll('[data-q-complete]:not([disabled])') ].pop(); if (c) c.click();
      const b = take();
      view('active'); const d = [ ...document.querySelectorAll('[data-q-drop]') ].pop(); if (d) d.click();
      return { label: [ a && 'took and completed ' + questName(a), b && 'took and dropped ' + questName(b) ].filter(Boolean).join(', ') };
    },
    probe: () => { const q = questData(); return q ? JSON.parse(JSON.stringify({ ord: q.ord, user: q.user })) : null; }
  },
  {
    name: 'Stamp Rally: a section all perfect',
    tab: 'rally',
    applies: () => !!document.querySelector('[data-rally-sec-perfect]'),
    apply: async () => { const b = document.querySelector('[data-rally-sec-perfect]'); b.click(); return { label: `from ${Number(b.dataset.rallySecPerfect) + 1}F` }; },
    probe: () => { rallySync(); return { stamps: RALLY.stamps, bonus: RALLY.bonus }; }
  },
  {
    name: 'Jackals: reroll all',
    tab: 'jackals',
    applies: () => !!document.getElementById('jkl-reroll-all'),
    apply: async () => { document.getElementById('jkl-reroll-all').click(); return { label: `${Object.keys(JKL.edits).length} Jackal${Object.keys(JKL.edits).length === 1 ? '' : 's'}` }; },
    probe: () => { jklSync(); return arr(RAW_SAV_ROOT.floor && RAW_SAV_ROOT.floor.jkls).map(j => j.type + '=' + jklLootKey(JKL.edits[j.type] || jklCurrent(j))); }
  },
  {
    name: 'Dates: fix all',
    tab: 'dates',
    applies: () => !!document.getElementById('dt-fix-all') && HEALTH.items.some(it => /time jumping/.test(it.text)),
    apply: async () => { document.getElementById('dt-fix-all').click(); return { label: 'every date the Save check flags', pending: true }; },
    check: () => HEALTH.items.some(it => /time jumping/.test(it.text)) ? 'dates left by time jumping are still reported' : ''
  },
  {
    name: 'VIP: 30-day Express Pass',
    tab: 'vip',
    applies: () => !!document.getElementById('vip-plan'),
    apply: async () => { const s = document.getElementById('vip-plan'); s.value = 'month'; s.dispatchEvent(new Event('change')); return { label: 'started' }; },
    probe: () => { const v = SAVE.soul.vip || {}; return { type: v.vip_type, expires: v.expired_time, plan: vipPlanOf(v) }; }
  },
  {
    name: 'VIP: free continues to the most',
    tab: 'vip',
    applies: () => !!document.getElementById('fc-on'),
    apply: async () => {
      const on = document.getElementById('fc-on'); on.checked = true; on.dispatchEvent(new Event('change')); await __T.sleep(20);
      document.getElementById('fc-max').click(); await __T.sleep(20);
      return { label: `${FREE_CONT_MAX} a day`, pending: true };
    },
    check: () => { const s = RAW_SAV_ROOT.soul; return Number(s.free_continue_max_count) === FREE_CONT_MAX && Number(s.free_continue_count) === FREE_CONT_MAX ? '' : `free continues are ${s.free_continue_count} of ${s.free_continue_max_count} a day after the download`; }
  },
  {
    name: 'Stews: stack the rarity',
    tab: 'stews',
    applies: () => !!document.querySelector('[data-stew="stack"]') && arr(AP.stewOdds).length > 0,
    apply: async () => { document.querySelector('[data-stew="stack"]').click(); return { label: `rarity ${STEW_FORM.rarity}` }; },
    probe: () => stewQueue()
  },
  {
    name: 'Layouts: copy a fighter\'s loadout onto another',
    tab: 'layouts',
    applies: () => { const f = arr(SAVE.soul.chrs).filter(c => c && c.state !== 'ENEMY' && c.state !== 'DUMMY' && !c.abid); return f.length >= 2 && f.some(c => arr(c.pspts).length); },
    apply: async () => {
      const f = arr(SAVE.soul.chrs).filter(c => c && c.state !== 'ENEMY' && c.state !== 'DUMMY' && !c.abid);
      const from = f.find(c => arr(c.pspts).length && Object.values(c.armslots || {}).some(e => e && e !== '-1'));
      const to = f.find(c => c !== from && !layFighterBlock(c) && c.state !== 'USE' && c.state !== 'GUARD');
      if (!from || !to) return { skip: 'no pair of fighters to copy between' };
      const L = layCapture(from, 'test loadout'); LAY.list.push(L); LAY.sel = L.id;
      Object.assign(LAY_UI, { fighter: to.cid, gearMode: 'create', decalMode: 'create', replaceDecals: true, report: null });
      layPreview(); layDoApply();
      window.__layTo = to.cid;
      // gear the fighter already wore can fall below its requirements when a decal comes off; the layout's own report
      // warns about it and leaves it on, so the Save check's matching warning is expected then
      const warned = arr(LAY_UI.report && LAY_UI.report.steps).filter(x => x.status === 'warn').length;
      return { label: `${from.name} onto ${to.name}${warned ? ` (report warned about ${warned} piece${warned === 1 ? '' : 's'} of gear)` : ''}`, allow: warned ? "gear equipped that the game wouldn't allow" : '' };
    },
    probe: () => {
      const c = arr(SAVE.soul.chrs).find(x => x.cid === window.__layTo); if (!c) return null;
      const by = Object.fromEntries(arr(c.pspts).map(p => [ p.eptid, p ]));
      return { weapons: Object.keys(c.armslots || {}).sort().map(k => (by[c.armslots[k]] || {}).ptid || ''), armor: arr(c.eqpts).map(e => e.site + '=' + (by[e.eptid] || {}).ptid).sort(), decals: arr(c.eqskls).map(s => s.id || s.sklid).sort() };
    }
  },
  {
    name: 'Fighters: add a fighter',
    tab: 'fighters',
    applies: () => typeof freeHangers === 'function' && freeHangers().length > 0,
    apply: async () => { document.getElementById('btn-add-char').click(); return { label: 'into the first empty hanger' }; },
    probe: () => arr(SAVE.soul.chrs).filter(c => c && c.state !== 'DUMMY').map(c => [ c.cid, c.name, c.state, c.type, c.grade, c.limit_break, c.body ].join('|')).sort()
  },
  {
    name: 'Fighters: delete a fighter',
    tab: 'fighters',
    applies: () => arr(SAVE.soul.chrs).some(c => c && c.state === 'FREE' && !fighterDeleteBlock(c)),
    apply: async () => {
      const c = arr(SAVE.soul.chrs).find(x => x && x.state === 'FREE' && !fighterDeleteBlock(x));
      activeCharIdx = SAVE.soul.chrs.indexOf(c); renderAll(); __T.tidy();
      document.getElementById('btn-del-char').click();
      return { label: c.name || c.cid };
    },
    probe: () => arr(SAVE.soul.chrs).filter(c => c && c.state !== 'DUMMY').map(c => [ c.cid, c.name, c.state ].join('|')).sort()
  }
];

// The scenarios as page source: each function's own source text, so they run in the page's scope.
function scenarioSource() {
  const f = x => x ? x.toString() : 'null';
  return 'window.__S = [' + SCENARIOS.map(s => `{ name: ${JSON.stringify(s.name)}, tab: ${JSON.stringify(s.tab)}, applies: ${f(s.applies)}, apply: ${f(s.apply)}, probe: ${f(s.probe)}, check: ${f(s.check)} }`).join(',\n') + ']; true';
}

module.exports = { SCENARIOS, scenarioSource };
