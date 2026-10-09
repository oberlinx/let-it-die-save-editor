// ==== Research tab ====
//
// blockBlueprints(): HTML skeleton for the Research tab (filter, bulk actions, PS-only toggle, sub-tabs).
// The blueprint list itself is filled in by the Research wire/render code elsewhere.
function blockBlueprints() {
  return `<section class="block">\n    <div class="block-head">\n      <div><div class="eyebrow">Chokufunsha</div><h2>Research</h2></div>\n    </div>\n    <div class="block-body">\n      <div class="toolbar">\n        <input type="text" id="bp-filter" placeholder="Filter by name..." style="flex:1; max-width:320px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">\n        <button class="subtle" id="bp-max-all">Max all visible research</button>\n        <button class="subtle" id="bp-plus5-all" title="In-game +5. Normal parts max out at +4; Uncap parts get +5. Earlier parts in the same chain are maxed.">Set all visible research to +5</button>\n        <button class="subtle" id="bp-remove-all">Remove all</button>\n        <label style="display:flex; align-items:center; gap:4px; font-size:11.5px;" title="PlayStation-only blueprints (master_part.platform 1). A PC game only has them if it has been modded to include them."><input type="checkbox" id="bp-include-ps"> Include PS-only ${psLabelNote()}</label>\n        <div class="count" id="bp-count"></div>\n      </div>\n      <div id="bp-suspicious-summary" style="font-size:12px; color:var(--warn); margin-bottom:8px;"></div>\n      <div class="tabbar" id="bp-subtabs" style="margin-bottom:12px;"></div>\n      <div id="bp-slot-content"></div>\n      ${stampBlockHtml()}\n    </div>\n  </section>`;
}

// ==== Research / Blueprints: part classification helpers ====
// partFamily(p): grouping key for the Research tab (weapon family such as "WP012" for arms,
// otherwise the armor-set prefix letters from the part id "PT_<FAMILY>_..."). Returns 'OTHER' if unparsable.
// p is a master_part record (id like PT_ARM_WP012_001, type like PTTP_ARM).
function partFamily(p) {
  if (p.type === 'PTTP_ARM') {
    const m = p.id.match(/^PT_ARM_(WP\d+)_/);
    return m ? m[1] : 'OTHER';
  }
  const m = p.id.match(/^PT_([A-Z]+)_/);
  return m ? m[1] : 'OTHER';
}

// partSlotLabel(p): UI slot name for a part record; these labels match RESEARCH_SLOTS sub-tabs.
// Unknown part types fall through as the raw type string.
function partSlotLabel(p) {
  if (p.type === 'PTTP_ARM') return 'Weapon';
  if (p.type === 'PTTP_HEAD' || p.type === 'PTTP_MASK') return 'Head';
  if (p.type === 'PTTP_BODY') return 'Chest (TOPS)';
  if (p.type === 'PTTP_LEGS' || p.type === 'PTTP_PANTS') return 'Pants (BTM)';
  return p.type;
}

// Lazily built set of "obtainable" part ids (see buildObtainableSet); reset only by page reload.
// A part counts as obtainable if it has a blueprint item or is reached via another part's upgrade chain.
let OBTAINABLE_SET = null;

// buildObtainableSet(): part ids that a player can actually get in game.
// Rule: (a blueprint item ITMP_<id> exists, ITTP_RMAP) OR (it is some part's nextptid upgrade target),
// AND it has a resolvable display name. Reads AP (the parsed masters.db tables).
function buildObtainableSet() {
  const blueprintIds = new Set((AP.items || []).filter(it => it.itemtype === 'ITTP_RMAP').map(it => it.itemId));
  const nextptidTargets = new Set((AP.pts || []).map(p => p.nextptid).filter(Boolean));
  const obtainable = new Set;
  for (const p of AP.pts || []) {
    const hasBlueprint = blueprintIds.has('ITMP_' + p.id.slice(3));
    const reachableByUpgrade = nextptidTargets.has(p.id);
    const hasName = !!resolveName(p.name);
    if ((hasBlueprint || reachableByUpgrade) && hasName) obtainable.add(p.id);
  }
  return obtainable;
}

// isPartObtainable(ptid): memoized lookup into OBTAINABLE_SET (built on first use).
function isPartObtainable(ptid) {
  if (!OBTAINABLE_SET) OBTAINABLE_SET = buildObtainableSet();
  return OBTAINABLE_SET.has(ptid);
}

// Part ids that must never be bulk-researched (known-bad / unreleased data in masters.db).
const RESEARCH_BLOCKLIST = new Set([ 'PT_ARM_WP023_001' ]);

// Memoized set for isResearchAllowed (built lazily).
let ALLOWED_RESEARCH_SET = null;

// buildAllowedResearchSet(): parts the Research tab's bulk buttons may touch by default.
// Must be listed in master_part_research, not PlayStation-only (platform 1), not blocklisted,
// and must have a blueprint or be an upgrade target.
function buildAllowedResearchSet() {
  const blueprintIds = new Set((AP.items || []).filter(it => it.itemtype === 'ITTP_RMAP').map(it => it.itemId));
  const nextptidTargets = new Set((AP.pts || []).map(p => p.nextptid).filter(Boolean));
  const researchable = new Set((AP.partresearch || []).map(r => r.ptid));
  const out = new Set;
  for (const p of AP.pts || []) {
    if (!researchable.has(p.id)) continue;
    if (p.platform === 1 || RESEARCH_BLOCKLIST.has(p.id)) continue;
    if (!(blueprintIds.has('ITMP_' + p.id.slice(3)) || nextptidTargets.has(p.id))) continue;
    out.add(p.id);
  }
  return out;
}

// isResearchAllowed(ptid): memoized membership test for ALLOWED_RESEARCH_SET.
function isResearchAllowed(ptid) {
  if (!ALLOWED_RESEARCH_SET) ALLOWED_RESEARCH_SET = buildAllowedResearchSet();
  return ALLOWED_RESEARCH_SET.has(ptid);
}

// PlayStation-only blueprints (platform 1). PC players can mod them into the
// game, so the Research tab's bulk buttons can include them on request.
// UI state for the Research tab's "include PS-only blueprints" checkbox (#bp-include-ps).
const RESEARCH_FORM = { includePs: false };
// isPsOnlyPart(ptid): true when masters.db marks the part platform === 1 (PlayStation only).
function isPsOnlyPart(ptid) {
  const p = PT_INDEX[ptid];
  return !!p && Number(p.platform) === 1;
}
// isResearchBulkAllowed(ptid): gate used by "Max all" / "+5 all". Normal allowed parts always pass;
// PS-only parts pass only when the checkbox is ticked, they are researchable, not blocklisted, and have a blueprint.
function isResearchBulkAllowed(ptid) {
  if (isResearchAllowed(ptid)) return true;
  if (!RESEARCH_FORM.includePs || !isPsOnlyPart(ptid) || RESEARCH_BLOCKLIST.has(ptid)) return false;
  const researchable = (AP.partresearch || []).some(r => r.ptid === ptid);
  return researchable && !hasNoBlueprint(ptid);
}

// Parts excluded from psOnlyBlueprintPtids (a superset of RESEARCH_BLOCKLIST; includes a PT_ARM_WP025 variant).
const BLUEPRINT_BLOCKLIST = new Set([ 'PT_ARM_WP023_001', 'PT_ARM_WP025_0A4' ]);

// psOnlyBlueprintPtids(): ids of researchable PS-only (platform 1) parts that have a named blueprint item.
// Returns an array of part ids; used elsewhere in the editor (e.g. checks for PS content on a PC save).
function psOnlyBlueprintPtids() {
  const blueprintIds = new Set((AP.items || []).filter(it => it.itemtype === 'ITTP_RMAP').map(it => it.itemId));
  const researchable = new Set((AP.partresearch || []).map(r => r.ptid));
  return (AP.pts || []).filter(p => researchable.has(p.id) && p.platform === 1 && !BLUEPRINT_BLOCKLIST.has(p.id) && resolveName(p.name) && blueprintIds.has('ITMP_' + p.id.slice(3))).map(p => p.id);
}

// ==== Upgrade-chain lookup ====
// Reverse map nextptid -> previous part id, built lazily from AP.pts (see prevPtid).
let PREV_PT_MAP = null;

// isChainRoot(ptid): true if no part upgrades into this one (first part of its upgrade chain).
function isChainRoot(ptid) {
  return !prevPtid(ptid);
}

// prevPtid(ptid): the part whose nextptid is ptid, or '' for chain roots. Builds PREV_PT_MAP on first call.
function prevPtid(ptid) {
  if (!PREV_PT_MAP) {
    PREV_PT_MAP = new Map;
    for (const p of AP.pts || []) if (p.nextptid) PREV_PT_MAP.set(p.nextptid, p.id);
  }
  return PREV_PT_MAP.get(ptid) || '';
}

// blueprintableParts(): every part (from PT_INDEX) that appears in master_part_research, as shallow copies
// with an extra flag obtainable = !hasNoBlueprint(id). The Research tab lists exactly these.
function blueprintableParts() {
  const researchable = new Set((AP.partresearch || []).map(p => p.ptid));
  return Object.values(PT_INDEX).filter(p => researchable.has(p.id)).map(p => Object.assign({}, p, {
    obtainable: !hasNoBlueprint(p.id)
  }));
}

// sortByChainOrder(list): orders part records so each upgrade chain stays together, in chain order
// (via chainOf), with chains sorted alphabetically by their root part's name. Only ids present in list are kept.
function sortByChainOrder(list) {
  const listIds = new Set(list.map(p => p.id));
  const chainGroups = new Map;
  const seen = new Set;
  for (const p of list) {
    if (seen.has(p.id)) continue;
    const chain = chainOf(p.id);
    const root = chain[0];
    if (!chainGroups.has(root)) chainGroups.set(root, chain.filter(id => listIds.has(id)));
    for (const id of chain) seen.add(id);
  }
  const roots = Array.from(chainGroups.keys()).sort((a, b) => (PT_INDEX[a].name || '').localeCompare(PT_INDEX[b].name || ''));
  const result = [];
  for (const root of roots) for (const id of chainGroups.get(root)) result.push(PT_INDEX[id]);
  return result;
}

// ==== Research markers (LEVELUP / REMODEL) ====
// The notes just below describe normalizeResearchMarkers() (defined further down) and the
// RESEARCH_GAME_SKIP exception it consults.
// The game keeps a "what can I research next" marker next to the FINISHED
// ladder of each blueprint (seen in real saves):
//   - not maxed yet : one LEVELUP entry at lvl = top + 1 (before = itself, top)
//   - maxed         : no marker; instead the NEXT part in the chain gets a
//                     REMODEL entry at lvl 1 (before = this part, its max)
// Without these the game shows the research as finished and won't let you
// upgrade it. This rebuilds the markers for every blueprint from the
// FINISHED entries. It is only run after the editor changes research.
// PlayStation-only parts on a PC save that have no next-level marker for their top level
// (e.g. the last Glider blueprint on a fully researched PC account: the PC game doesn't have the
// Glider, so it never writes the marker). Those are left alone until the part's level is changed
// in the editor. Anything else missing its marker is a real problem -- without it the game shows
// the part as capped (e.g. an Uncap part stuck at +4 on a PS save) -- so the save check flags it.
// ptid -> top level for PS-only parts whose missing LEVELUP marker is expected on a PC save.
// Filled at load time (line ~1772) via researchGameSkips(); consulted as normalizeResearchMarkers' default skip map.
// (Also reassigned elsewhere by the save check.)
let RESEARCH_GAME_SKIP = new Map();
// researchGameSkips(research): dry-runs normalizeResearchMarkers on a deep copy of the research array and
// returns the Map(ptid -> level) of PS-only (platform 1) parts it would have had to add a marker for.
// Non-PC saves return an empty Map. No side effects on the real save.
function researchGameSkips(research) {
  if (savePlatform(RAW_SAV_ROOT) !== 'PC') return new Map();
  const found = [];
  normalizeResearchMarkers(JSON.parse(JSON.stringify(arr(research))), found, new Map());
  return new Map(found.filter(([ ptid ]) => PT_INDEX[ptid] && Number(PT_INDEX[ptid].platform) === 1));
}
// ==== Armor Skins derived from research ====
// Armor Skins: the game's own rule (Barb's Bible): "Strengthening a piece of armor to +4 will make it
// available as an Armor Skin." There is no unlock list in the save -- the game works it out from R&D --
// so raising or lowering research is all it takes. soul.armorskin only holds the skins in use.
// Part types that can become Armor Skins (arms/weapons cannot).
const ARMOR_TYPES = new Set([ 'PTTP_HEAD', 'PTTP_BODY', 'PTTP_LEGS' ]);
// armorSkinCapable(rec): master_part record is head/body/legs armor with skin === 1.
function armorSkinCapable(rec) { return !!rec && ARMOR_TYPES.has(rec.type) && Number(rec.skin) === 1; }
// researchTop(research, ptid): highest raw lvl among FINISHED entries for ptid (0 if none). research may be {} or [] (arr()).
function researchTop(research, ptid) {
  let t = 0;
  for (const r of arr(research)) if (r.ptid === ptid && r.research_type === 'FINISHED' && r.lvl > t) t = r.lvl;
  return t;
}
// armorSkinUnlocked(research, ptid): true when the armor is skin-capable and researched to in-game +4 or more
// (raw level converted with displayFromRaw; limit-break parts have a different raw/display offset).
function armorSkinUnlocked(research, ptid) {
  const rec = PT_INDEX[ptid];
  if (!armorSkinCapable(rec)) return false;
  const t = researchTop(research, ptid);
  return t > 0 && displayFromRaw(rec, t) >= 4;
}
// armorSkinsUnlocked(research): Set of every ptid that currently qualifies as an Armor Skin.
function armorSkinsUnlocked(research) {
  const out = new Set();
  for (const r of arr(research)) if (r.research_type === 'FINISHED' && !out.has(r.ptid) && armorSkinUnlocked(research, r.ptid)) out.add(r.ptid);
  return out;
}

// ==== "Known but not developed" blueprints ====
// Blueprints the game knows about but that aren't developed (no FINISHED entry), as the game writes them:
// (full explanation of the two research_type values follows in the original notes)
// Blueprints the game knows about but that aren't developed (no FINISHED entry), as the game writes them:
//   research_type 'MAP' -- a blueprint analysed at Choku-Funsha, ready for R&D ("known")
//   research_type ''    -- an unrevealed ("???") blueprint picked up but not analysed yet
// Both are one entry at lvl 1 on the first part of a chain (seen in a save with 100 MAP and 11 unrevealed).
// The list shows them with a badge; unticking a part that was one of these when the save was loaded puts
// the game's entry back instead of forgetting the blueprint.
// ptid -> array of raw 'MAP' / '' research entries as they were when the save loaded (snapshot, deep copies).
// setUnlocked() restores these when a developed blueprint is un-ticked. Set at load (line ~1773).
let RESEARCH_KNOWN = new Map();
// research_type values meaning 'known, not developed': 'MAP' = analysed, '' = unrevealed.
const RESEARCH_KNOWN_TYPES = new Set([ 'MAP', '' ]);
// researchKnownSnapshot(research): Map(ptid -> deep-copied MAP/'' entries) from the given research array.
function researchKnownSnapshot(research) {
  const out = new Map();
  for (const r of arr(research)) if (r && RESEARCH_KNOWN_TYPES.has(r.research_type)) (out.get(r.ptid) || out.set(r.ptid, []).get(r.ptid)).push(JSON.parse(JSON.stringify(r)));
  return out;
}
// researchKnownState(research, ptid): returns 'known' (MAP), 'unrevealed' (''), or '' if developed or not present.
// 'known' / 'unrevealed' for a blueprint that isn't developed, else ''
function researchKnownState(research, ptid) {
  let st = '';
  for (const r of arr(research)) {
    if (!r || r.ptid !== ptid) continue;
    if (r.research_type === 'FINISHED') return '';
    if (r.research_type === 'MAP') st = 'known';
    else if (r.research_type === '' && !st) st = 'unrevealed';
  }
  return st;
}
// Tooltip/badge text for the two researchKnownState values.
const RESEARCH_KNOWN_LABEL = { known: 'blueprint known, not developed', unrevealed: 'unrevealed blueprint (not analysed)' };

// normalizeResearchMarkers(research, found, skip): rebuilds the game's "next research" marker entries
// (LEVELUP / REMODEL) for every researchable part so they agree with the FINISHED ladders. Mutates the
// research array in place (splice/push).
//   research : array of research entries (mutated)
//   found    : optional array; receives [ptid, topLevel] for each missing LEVELUP marker that was added
//   skip     : Map ptid -> top level to leave alone (defaults to RESEARCH_GAME_SKIP)
// For each part: partially researched -> exactly one LEVELUP at top+1; maxed -> none, and the NEXT part in the
// chain (if not yet researched) gets a REMODEL at lvl 1 pointing at this part's max; otherwise no marker.
// Existing correct markers are kept untouched. Returns the number of parts whose markers changed.
function normalizeResearchMarkers(research, found, skip) {
  // markers we manage; any other research_type (FINISHED, MAP, '') is never touched here
  skip = skip || RESEARCH_GAME_SKIP;
  const MARKERS = new Set([ 'LEVELUP', 'REMODEL' ]);
  const byPt = new Map;
  for (const r of research) {
    if (!byPt.has(r.ptid)) byPt.set(r.ptid, []);
    byPt.get(r.ptid).push(r);
  }
  const topOf = ptid => {
    let t = 0;
    for (const r of byPt.get(ptid) || []) if (r.research_type === 'FINISHED' && r.lvl > t) t = r.lvl;
    return t;
  };
  // want: ptid -> desired marker entry, or null meaning 'should have no marker'
  const researchable = new Set((AP.partresearch || []).map(p => p.ptid));
  const want = new Map;
  for (const ptid of researchable) {
    const rec = PT_INDEX[ptid];
    if (!rec) continue;
    const max = maxPartLevel(rec) || 1;
    const top = topOf(ptid);
    if (top > 0 && top < max) {
      // starter weapons use an empty before_ptid / before_lvl 0 for their marker (matches fresh game saves)
      // the two starter weapons' level-2 entries point at nothing (seen in a fresh game save)
      const starter = top === 1 && (ptid === 'PT_ARM_WP005_001' || ptid === 'PT_ARM_WP006_001');
      want.set(ptid, { ptid, lvl: top + 1, research_type: 'LEVELUP', receive_type: 'UNKNOWN', is_announced: 0, is_checked: 1, before_ptid: starter ? '' : ptid, before_lvl: starter ? 0 : top });
    } else if (top === 0) {
      const prev = prevPtid(ptid);
      if (prev && researchable.has(prev) && PT_INDEX[prev]) {
        const pmax = maxPartLevel(PT_INDEX[prev]) || 1;
        if (topOf(prev) >= pmax) want.set(ptid, { ptid, lvl: 1, research_type: 'REMODEL', receive_type: 'UNKNOWN', is_announced: 0, is_checked: 1, before_ptid: prev, before_lvl: pmax });
        else want.set(ptid, null);
      }
      // chain roots with nothing researched: leave whatever the game wrote
    } else {
      want.set(ptid, null);
    }
  }
  let changed = 0;
  // reconcile: drop stale markers and push the desired one where the existing marker differs
  for (const [ptid, w] of want) {
    const cur = (byPt.get(ptid) || []).filter(r => MARKERS.has(r.research_type));
    // an existing marker of the right kind at the right level is kept as the game wrote it
    const same = w ? cur.length === 1 && cur[0].research_type === w.research_type && cur[0].lvl === w.lvl : cur.length === 0;
    if (same) continue;
    if (w && w.research_type === 'LEVELUP' && !cur.length) {
      if (skip.get(ptid) === w.lvl - 1) continue;
      if (found) found.push([ ptid, w.lvl - 1 ]);
    }
    for (let i = research.length - 1; i >= 0; i--) if (research[i].ptid === ptid && MARKERS.has(research[i].research_type)) research.splice(i, 1);
    if (w) research.push(w);
    changed++;
  }
  return changed;
}

// ==== Research tab (wireBlueprints) ====
// wireBlueprints(): builds and wires the whole Research / Blueprints tab against SAVE.user_research.
// All edits mutate SAVE.user_research directly (shipped on download). Inner helpers:
//   entryFor / isUnlocked : best (highest) FINISHED entry for a part
//   writeLadder(ptid,lvl) : replaces a part's entries with a FINISHED ladder lvl 1..top (the game's format:
//                           each level points back via before_ptid/before_lvl; the top one has receive_type CHARGE)
//   setUnlocked           : tick/untick a part, also maxing earlier parts in the chain / clearing later ones
//   setLevel              : change level, refusing to lower a part while a later chain part is researched
//   renderList            : redraws the list and re-attaches event handlers (called after every change)
// Marker entries are normalized lazily (researchDirty) at the next render.
function wireBlueprints() {
  const research = SAVE.user_research;
  // flag set whenever entries are removed/rewritten so renderList re-runs normalizeResearchMarkers
  let researchDirty = false;
  // best = the FINISHED entry with the highest lvl for ptid, or null
  function entryFor(ptid) {
    let best = null;
    for (const r of research) {
      if (r.ptid === ptid && r.research_type === 'FINISHED' && (!best || r.lvl > best.lvl)) best = r;
    }
    return best;
  }
  function isUnlocked(ptid) {
    return !!entryFor(ptid);
  }
  // the two starter weapons: their level-2 entry has no predecessor (see normalizeResearchMarkers)
  const STARTER_PTIDS = new Set([ 'PT_ARM_WP005_001', 'PT_ARM_WP006_001' ]);
  // blueprints every new game starts with (master_part_research.is_initial)
  const INITIAL_PTIDS = new Set((AP.partresearch || []).filter(r => Number(r.is_initial) === 1).map(r => r.ptid));
  if (!INITIAL_PTIDS.size) for (const id of STARTER_PTIDS) INITIAL_PTIDS.add(id);
  // removeEntry(ptid): delete every research entry (any type) for the part
  function removeEntry(ptid) {
    researchDirty = true;
    for (let i = research.length - 1; i >= 0; i--) {
      if (research[i].ptid === ptid) research.splice(i, 1);
    }
  }
  // writeLadder(ptid, lvl): rewrite the part's research as FINISHED entries 1..lvl (clamped to the part's max).
  // Level 1 chains back to the previous part in the upgrade chain at its max level.
  function writeLadder(ptid, lvl) {
    removeEntry(ptid);
    const rec = PT_INDEX[ptid];
    const top = Math.max(1, Math.min(lvl || 1, maxPartLevel(rec) || 1));
    const prev = prevPtid(ptid);
    const prevTop = prev ? maxPartLevel(PT_INDEX[prev]) : 0;
    for (let l = 1; l <= top; l++) {
      let bp, bl;
      if (l === 1) {
        bp = prev;
        bl = prev ? prevTop : 0;
      } else if (l === 2 && STARTER_PTIDS.has(ptid)) {
        bp = '';
        bl = 0;
      } else {
        bp = ptid;
        bl = l - 1;
      }
      research.push({
        ptid: ptid,
        lvl: l,
        research_type: 'FINISHED',
        receive_type: l === top ? 'CHARGE' : 'FINISHED',
        is_announced: 1,
        is_checked: 1,
        before_ptid: bp,
        before_lvl: bl
      });
    }
  }
  // addEntry(ptid): ensure the part is at least developed at level 1 (no-op if already developed)
  function addEntry(ptid) {
    if (!isUnlocked(ptid)) writeLadder(ptid, 1);
  }
  // setUnlocked(ptid,on): on = develop the part and max every earlier chain part (the game requires it);
  // off = remove this part and all later chain parts (starting blueprints are reset to level 1 instead).
  function setUnlocked(ptid, on) {
    const chain = chainOf(ptid);
    const idx = chain.indexOf(ptid);
    if (on) {
      for (let i = 0; i <= idx; i++) {
        if (i < idx) writeLadder(chain[i], maxPartLevel(PT_INDEX[chain[i]])); else if (!isUnlocked(chain[i])) writeLadder(chain[i], 1);
      }
    } else {
      for (let i = idx; i < chain.length; i++) {
        // starting blueprints are never removed; they go back to their first level
        if (INITIAL_PTIDS.has(chain[i])) writeLadder(chain[i], 1);
        else {
          removeEntry(chain[i]);
          // a blueprint the save had as known / unrevealed goes back to that, not to unknown
          for (const k of RESEARCH_KNOWN.get(chain[i]) || []) research.push(JSON.parse(JSON.stringify(k)));
        }
      }
      if (INITIAL_PTIDS.has(ptid)) toast(`${(PT_INDEX[ptid] || {}).name || ptid} is a starting blueprint, so it was reset to +0 instead of removed.`);
    }
  }
  // setLevel(ptid,lvl): lvl is a RAW level. Returns an error string (shown as a toast) or null on success.
  function setLevel(ptid, lvl) {
    if (!isUnlocked(ptid)) return null;
    const rec = PT_INDEX[ptid], max = maxPartLevel(rec) || 1;
    if (lvl < max) {
      // the next part in the upgrade chain can only be researched from a maxed part
      const chain = chainOf(ptid);
      const later = chain.slice(chain.indexOf(ptid) + 1).find(id => isUnlocked(id));
      if (later) return `${rec.name} has to stay maxed while ${(PT_INDEX[later] || {}).name || later} (the next part in its upgrade chain) is researched. Untick that first.`;
    }
    writeLadder(ptid, lvl);
    return null;
  }
  // sub-tab names, same strings partSlotLabel() returns
  const RESEARCH_SLOTS = [ 'Weapon', 'Head', 'Chest (TOPS)', 'Pants (BTM)' ];
  let researchSubTab = RESEARCH_SUBTAB_STATE.current || 'Weapon';
  // renderList(filter): redraw counts, warnings about researched parts with no blueprint, slot sub-tabs and the
  // checkbox/level rows for the active slot, then wire their handlers. filter = name substring (accent-insensitive via norm()).
  function renderList(filter) {
    if (researchDirty) {
      normalizeResearchMarkers(research);
      researchDirty = false;
    }
    let parts = blueprintableParts().filter(p => !filter || norm(p.name).includes(norm(filter)));
    document.getElementById('bp-count').textContent = `${parts.length} shown / ${blueprintableParts().length} total`;
    const allSuspicious = blueprintableParts().filter(p => p.obtainable === false && isUnlocked(p.id));
    document.getElementById('bp-suspicious-summary').textContent = allSuspicious.length ? `⚠ ${allSuspicious.length} researched part${allSuspicious.length === 1 ? '' : 's'} with no blueprint: ${allSuspicious.map(p => p.name).join(', ')}` : '';
    const bySlot = {};
    for (const p of parts) {
      (bySlot[partSlotLabel(p)] = bySlot[partSlotLabel(p)] || []).push(p);
    }
    document.getElementById('bp-subtabs').innerHTML = RESEARCH_SLOTS.map(slotName => `<button class="tabbtn ${researchSubTab === slotName ? 'active' : ''}" data-bp-subtab="${slotName}">${slotName} (${(bySlot[slotName] || []).length})</button>`).join('');
    function renderSlotGroup(slotName) {
      if (!bySlot[slotName] || !bySlot[slotName].length) return '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No matches.</div>';
      const byFam = {};
      for (const p of bySlot[slotName]) {
        (byFam[partFamily(p)] = byFam[partFamily(p)] || []).push(p);
      }
      const famNames = Object.keys(byFam).sort();
      return famNames.map(fam => `\n          <div style="margin-bottom:8px;">\n            <div style="font-size:10.5px; color:var(--text-faint); margin-bottom:3px;">${fam}</div>\n            <div class="listBlock">\n              ${sortByChainOrder(byFam[fam]).map(p => {
        const unlocked = isUnlocked(p.id);
        const e = entryFor(p.id);
        const maxLvl = maxPartLevel(p);
        const dispMax = maxDisplayLevel(p);
        return `<div class="listRow">\n                  <input type="checkbox" data-bp="${p.id}" ${unlocked ? 'checked' : ''}>\n                  <div class="name">${escapeHtml(p.name)} ${p.is_limitbreak ? '<span class="badge lb">Uncap · in-game +' + dispMax + '</span>' : `<span class="badge">in-game +${dispMax}</span>`} ${!unlocked && researchKnownState(research, p.id) ? `<span class="badge" style="border-color:var(--accent);" title="The game has this blueprint: ${researchKnownState(research, p.id) === 'known' ? 'analysed, waiting for R&amp;D' : 'picked up but not analysed yet'}. Ticking it develops it (+0); unticking it again puts it back to this.">${RESEARCH_KNOWN_LABEL[researchKnownState(research, p.id)]}</span>` : ''} ${isPsOnlyPart(p.id) ? '<span class="badge" title="PlayStation-only; a PC game needs to be modded to have it">PS only</span>' : ''} ${armorSkinCapable(p) ? (armorSkinUnlocked(research, p.id) ? '<span class="badge" title="Researched to +4 or more, so the game offers it as an Armor Skin">skin unlocked</span>' : '<span class="badge" style="opacity:.55;" title="Researching this to +4 unlocks it as an Armor Skin">skin at +4</span>') : ''} ${hasNoBlueprint(p.id) ? '<span class="badge" style="background:var(--accent); color:#fff;">(THIS HAS NO BLUEPRINT)</span>' : ''}</div>\n                  ${unlocked ? `<span style="font-size:11px; color:var(--text-dim);">+</span><input type="number" class="bp-level" data-bp-level="${p.id}" min="${minDisplayLevel(p)}" max="${dispMax}" value="${displayFromRaw(p, e ? e.lvl : 1)}" style="width:60px;" title="In-game level, +${minDisplayLevel(p)} to +${dispMax}">` : ''}\n                  <div class="id">${p.id}</div>\n                </div>`;
      }).join('')}\n            </div>\n          </div>`).join('');
    }
    document.getElementById('bp-slot-content').innerHTML = renderSlotGroup(researchSubTab);
    document.querySelectorAll('[data-bp-subtab]').forEach(btn => {
      btn.addEventListener('click', () => {
        researchSubTab = btn.dataset.bpSubtab;
        RESEARCH_SUBTAB_STATE.current = researchSubTab;
        renderList(document.getElementById('bp-filter').value);
      });
    });
    document.querySelectorAll('[data-bp]').forEach(cb => {
      cb.addEventListener('change', () => {
        const before = stampTotalsNow();
        setUnlocked(cb.dataset.bp, cb.checked);
        adjustStampFromResearch(before);
        renderList(document.getElementById('bp-filter').value);
      });
    });
    document.querySelectorAll('[data-bp-level]').forEach(inp => {
      inp.addEventListener('change', () => {
        // the box shows the in-game level (+n); the save stores the raw level
        const rec = PT_INDEX[inp.dataset.bpLevel];
        const lo = minDisplayLevel(rec), hi = maxDisplayLevel(rec);
        let v = parseInt(inp.value, 10);
        if (isNaN(v)) v = lo;
        if (v > hi) toast(`Clamped to this part's max (+${hi})`);
        if (v < lo) toast(`Clamped to this part's lowest level (+${lo})`);
        v = Math.max(lo, Math.min(hi, v));
        const before = stampTotalsNow();
        const err = setLevel(inp.dataset.bpLevel, rawFromDisplay(rec, v));
        if (err) toast(err, true);
        // re-render so the "next level" markers and research stamps follow
        adjustStampFromResearch(before);
        renderList(document.getElementById('bp-filter').value);
      });
    });
  }
  // initial render and the remaining one-time handlers
  renderList('');
  wireStamp();
  document.getElementById('bp-filter').addEventListener('input', e => renderList(e.target.value));
  // 'include PS-only' checkbox shared with RESEARCH_FORM so other code can read it
  const psBox = document.getElementById('bp-include-ps');
  psBox.checked = RESEARCH_FORM.includePs;
  psBox.addEventListener('change', () => { RESEARCH_FORM.includePs = psBox.checked; toast(psBox.checked ? `Max all / +5 now include PS-only blueprints${isPsSave() ? '' : ' (only for PC games modded to have them)'}` : 'Max all / +5 skip PS-only blueprints again'); });
  // Max all: fully research every visible (current sub-tab + filter) allowed part, including earlier parts of its chain
  document.getElementById('bp-max-all').addEventListener('click', () => {
    const filter = document.getElementById('bp-filter').value;
    const shown = blueprintableParts().filter(p => (!filter || norm(p.name).includes(norm(filter))) && partSlotLabel(p) === researchSubTab);
    const parts = shown.filter(p => isResearchBulkAllowed(p.id));
    const before = stampTotalsNow();
    const done = new Set;
    for (const p of parts) {
      for (const id of chainOf(p.id)) {
        if (!done.has(id) && isResearchBulkAllowed(id)) {
          writeLadder(id, maxPartLevel(PT_INDEX[id]));
          done.add(id);
        }
        if (id === p.id) break;
      }
    }
    adjustStampFromResearch(before);
    renderList(filter);
    const skipped = shown.length - parts.length;
    toast(`Maxed ${parts.length} visible ${researchSubTab} research item${parts.length === 1 ? '' : 's'}${skipped ? ` (skipped ${skipped} ${RESEARCH_FORM.includePs ? 'with no blueprint' : 'PS-only / no blueprint'})` : ''}`);
  });
  // +5 all: see the comment inside
  document.getElementById('bp-plus5-all').addEventListener('click', () => {
    // "+5" is the in-game number. Normal parts top out at +4, so they are
    // maxed; Uncap (limit break) parts are set to +5, their first level.
    // Earlier parts in the same upgrade chain have to be maxed for the game to
    // accept the later one, so they are maxed rather than set to +5.
    const filter = document.getElementById('bp-filter').value;
    const shown = blueprintableParts().filter(p => (!filter || norm(p.name).includes(norm(filter))) && partSlotLabel(p) === researchSubTab);
    const parts = shown.filter(p => isResearchBulkAllowed(p.id));
    const targets = new Map;
    for (const p of parts) {
      const chain = chainOf(p.id);
      const idx = chain.indexOf(p.id);
      chain.slice(0, idx).forEach(id => { if (isResearchBulkAllowed(id)) targets.set(id, maxPartLevel(PT_INDEX[id]) || 1); });
      if (!targets.has(p.id)) targets.set(p.id, rawFromDisplay(PT_INDEX[p.id], 5));
    }
    let changed = 0, alreadyAbove = 0;
    const before = stampTotalsNow();
    for (const [id, target] of targets) {
      const cur = entryFor(id) ? entryFor(id).lvl : 0;
      if (cur > target) { alreadyAbove++; continue; }
      if (cur !== target) { writeLadder(id, target); changed++; }
    }
    adjustStampFromResearch(before);
    renderList(filter);
    const skipped = shown.length - parts.length;
    toast(`Set ${changed} visible ${researchSubTab} research item${changed === 1 ? '' : 's'} to +5 (normal parts max out at +4)${alreadyAbove ? ` (left ${alreadyAbove} already higher untouched)` : ''}${skipped ? ` (skipped ${skipped} ${RESEARCH_FORM.includePs ? 'with no blueprint' : 'PS-only / no blueprint'})` : ''}`);
  });
  // Remove all: wipe research, then restore the starting blueprints at level 1
  document.getElementById('bp-remove-all').addEventListener('click', () => {
    const before = stampTotalsNow();
    research.length = 0;
    // every new game starts with these researched; keep them at their first level
    for (const id of INITIAL_PTIDS) if (PT_INDEX[id]) writeLadder(id, 1);
    researchDirty = true;
    adjustStampFromResearch(before);
    renderList(document.getElementById('bp-filter').value);
    toast(`All research removed (starting blueprints kept at +0)`);
  });
}

