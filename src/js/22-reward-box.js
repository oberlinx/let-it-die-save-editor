// ==== Reward Box tab ====
// Reward types offered in the 'Add a reward' dropdown.
const PRESENT_TYPES = [ {
  id: 'MONEY',
  label: 'Money'
}, {
  id: 'SPIRIT',
  label: 'Spirit'
}, {
  id: 'ITEM',
  label: 'Item (material / Solo Shelter / other)'
}, {
  id: 'BP',
  label: 'Blueprint'
}, {
  id: 'LOSTBAG',
  label: 'Lost Bag'
}, {
  id: 'PT',
  label: 'Weapon / Armor'
}, {
  id: 'MUSHROOM',
  label: 'Mushroom'
}, {
  id: 'BEAST',
  label: 'Beast'
}, {
  id: 'SKILL',
  label: 'Skill Decal'
} ];

// Currently selected reward type in the Reward Box add form.
let rbType = 'MONEY';

// HTML for the Reward Box tab. The game blocks leaving the Waiting Room once the box reaches PRESENT_BOX_LIMIT (default 50) items.
function blockRewardBox() {
  const presents = SAVE.presents;
  const n = presents.length;
  const lim = constIntOf('PRESENT_BOX_LIMIT', 50) || 50;   // masters.db master_const_int
  const warn = n >= lim ? `<div class="warnNote">${n} items -- at ${lim}+ the game blocks leaving the Waiting Room for the tower or raiding until this drops below ${lim}.</div>` : '';
  const capNote = n > 999 ? '<div class="warnNote">Over 999 -- the in-game display caps at "999+"; there\'s no real storage limit, just a display cap.</div>' : '';
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Mailbox</div><h2>Reward Box</h2></div></div>\n    <div class="block-body">\n      ${warn}${capNote}\n      <div class="eyebrow" style="margin-bottom:6px;">Add a reward</div>\n      <div class="grid" style="margin-bottom:8px;">\n        <div class="field"><label>Type</label><select id="rb-type" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">\n          ${PRESENT_TYPES.map(t => `<option value="${t.id}" ${t.id === rbType ? 'selected' : ''}>${t.label}</option>`).join('')}\n        </select></div>\n      </div>\n      <div id="rb-add-form"></div>\n      <div class="toolbar" style="margin-top:10px;"><button class="subtle" id="rb-clear">Clear all</button><div class="count">${n} items</div></div>\n      <div class="listBlock" id="rb-list">\n        ${presents.map((p, i) => rewardRow(p, i)).join('') || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">Empty.</div>'}\n      </div>\n    </div>\n  </section>`;
}

// One Reward Box row (HTML). Resolves a readable description per type; weapon/armor rewards get a level dropdown (val1 = raw level).
function rewardRow(p, i) {
  let detail = `${p.num != null ? p.num.toLocaleString() : ''}`;
  let levelInput = '';
  if ((p.type === 'ITEM' || String(p.type).startsWith('ITTP_')) && p.val0 && ITEM_INDEX[p.val0]) {
    detail = `${String(itemDisplayName(p.val0)).replace(/^Blueprint\s*-\s*/, '')} x${p.num || 1}`;
  } else if (p.type === 'MUSHROOM' && p.val0) {
    detail = `${msrDisplayName(p.val0)} x${p.num || 1}`;
  } else if (p.type === 'BEAST' && p.val0) {
    detail = `${bstDisplayName(p.val0)} x${p.num || 1}`;
  } else if (p.type === 'SKILL' && p.val0) {
    const rec = SKL_INDEX[p.val0];
    detail = `${rec ? rec.name : p.val0} x${p.num || 1}`;
  } else if ((p.type === 'PT' || [ 'PTTP_ARM', 'PTTP_HEAD', 'PTTP_BODY', 'PTTP_LEGS' ].includes(p.type)) && p.val0) {
    // a weapon / armor reward: val1 = the part's level in save units ('0' = base), shown as in-game +n
    const rec = PT_INDEX[p.val0];
    detail = `${rec ? rec.name : p.val0}${rec ? ' (' + (rec.type === 'PTTP_ARM' ? 'weapon' : 'armor') + ')' : ''} x${p.num || 1}`;
    if (rec) {
      const raw = Math.max(1, Math.min(Number(p.val1) || 1, maxPartLevel(rec) || 1));
      let opts = '';
      for (let r = 1; r <= (maxPartLevel(rec) || 1); r++) opts += `<option value="${r}" ${r === raw ? 'selected' : ''}>+${displayFromRaw(rec, r)}</option>`;
      levelInput = `<select class="rb-pt-level" data-rb-idx="${i}" title="Level (in-game +n)" style="width:80px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:4px 6px; font-family:var(--mono);">${opts}</select>`;
    }
  }
  const bagLbl = lostBagPresentLabel(p);
  if (bagLbl) detail = `${cmpPresentLabel(p)}`;
  return `<div class="listRow"><div class="name">${bagLbl ? `${bagChip(String(p.kind).replace('MYSTERYBAG_', ''))} Lost Bag → ` : escapeHtml(presentTypeLabel(p)) + ': '}${escapeHtml(detail)}</div><div class="id">${escapeHtml(p.from || '?')}${p.kind ? ' · ' + p.kind : ''}</div>${levelInput}<button class="subtle" data-rb-remove="${i}">✕</button></div>`;
}

// HTML for the Reward Box add form: Lost Bag form, search-based form, or a plain amount form (money/spirit).
function rbAddFormHtml() {
  if (rbType === 'LOSTBAG') {
    const pool = bagPool(RB_FORM.bagRarity);
    if (RB_FORM.bagContent && !pool.some(r => r.id === RB_FORM.bagContent)) RB_FORM.bagContent = '';
    return `<div class="grid">
      <div class="field"><label>Rarity</label><select id="rb-bag-rarity" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">${BAG_RARITIES.map(r => `<option value="${r}" ${r === RB_FORM.bagRarity ? 'selected' : ''}>${bagTitle(r)}</option>`).join('')}</select></div>
      <div class="field" style="grid-column:span 2;"><label>Contents</label><select id="rb-bag-content" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);"><option value="">Random (the game's odds for ${bagTitle(RB_FORM.bagRarity)})</option>${pool.slice().sort((a, b) => b.p - a.p).map(r => `<option value="${r.id}" ${r.id === RB_FORM.bagContent ? 'selected' : ''}>${escapeHtml(r.name)} (${(r.p * 100).toFixed(r.p < 0.01 ? 2 : 1)}%)</option>`).join('')}</select></div>
      <div class="field"><label>How many bags</label><input type="number" id="rb-bag-qty" min="1" max="99" value="${escapeHtml(RB_FORM.bagQty)}"></div>
      <div class="field" style="display:flex; align-items:end;"><button class="subtle" id="rb-bag-add">+ Add Lost Bag${Number(RB_FORM.bagQty) > 1 ? 's' : ''}</button></div>
    </div>`;
  }
  if ([ 'ITEM', 'BP', 'MUSHROOM', 'BEAST', 'SKILL', 'PT' ].includes(rbType)) {
    let extraField = '';
    if (rbType === 'BP') extraField = `<div class="field"><label><input type="checkbox" id="rb-add-unrevealed" style="width:auto; margin-right:6px;" ${RB_FORM.unrevealed ? 'checked' : ''}>Unrevealed</label></div>`;
    if (rbType === 'PT') extraField = `<div class="field"><label>Level (in-game +n)</label><input type="number" id="rb-add-lvl" min="0" value="${escapeHtml(RB_FORM.ptLvl)}"></div>`;
    if ([ 'PT', 'BP', 'SKILL' ].includes(rbType)) extraField += `<div class="field"><label title="PlayStation-only items only work in PC games that were modded to have them"><input type="checkbox" id="rb-include-ps" style="width:auto; margin-right:6px;" ${RB_FORM.includePs ? 'checked' : ''}>Include PS-only ${psLabelNote()}</label></div>`;
    return `<div class="grid">\n      <div class="searchwrap" style="grid-column:span 2;"><input type="text" id="rb-search" placeholder="Search ${rbType === 'BP' ? 'blueprint (by the weapon/armor it unlocks)' : 'name'}..."><div class="acdrop" id="rb-acdrop"></div></div>\n      <div class="field"><label>Quantity</label><input type="number" id="rb-num" min="1" value="${escapeHtml(RB_FORM.searchNum)}"></div>\n      ${extraField}\n    </div>`;
  }
  return `<div class="grid">\n    <div class="field"><label>Amount</label><input type="number" id="rb-num" min="1" value="${escapeHtml(RB_FORM.amountNum)}"></div>\n    <div class="field" style="display:flex; align-items:end;"><button class="subtle" id="rb-add">+ Add</button></div>\n  </div>`;
}

// Wire the Reward Box tab: type switch, clear all, remove, weapon/armor level dropdown (keeps part full), add form.
function wireRewardBox() {
  document.getElementById('rb-type').addEventListener('change', e => {
    rbType = e.target.value;
    renderRbForm();
  });
  document.getElementById('rb-clear').addEventListener('click', () => {
    if (!confirm(`Delete all ${SAVE.presents.length} items in the Reward Box? This can't be undone.`)) return;
    SAVE.presents = [];
    renderAll();
    toast('Reward Box cleared');
  });
  document.querySelectorAll('[data-rb-remove]').forEach(btn => btn.addEventListener('click', () => {
    SAVE.presents.splice(parseInt(btn.dataset.rbRemove, 10), 1);
    renderAll();
  }));
  document.querySelectorAll('.rb-pt-level').forEach(inp => {
    inp.addEventListener('change', () => {
      const p = SAVE.presents[parseInt(inp.dataset.rbIdx, 10)];
      const raw = parseInt(inp.value, 10) || 1;
      p.val1 = String(raw > 1 ? raw : 0);
      presentPartFull(p);
      const rec = PT_INDEX[p.val0];
      toast(`${rec ? rec.name : 'Reward'} set to +${rec ? displayFromRaw(rec, raw) : raw - 1}`);
    });
  });
  renderRbForm();
}

// A Lost Bag in the Reward Box, as the game writes it when a bag is earned in Tokyo Death Metro:
// from TDM_REWARD, kind MYSTERYBAG_<RARITY>, and the bag's contents as the reward itself
// (type = the item's own itemtype for items, e.g. ITTP_MATERIAL; val0 = the id).
// Push a Lost Bag reward for the given rarity and bag-content generator id. Returns the new present, or null.
function addLostBagPresent(rarity, genId) {
  const g = bagGenIndex()[genId], rw = g && rwdRow(g.rwdid);
  if (!rw) return null;
  const p = {
    pid: presentUuid(), from: 'TDM_REWARD', type: boxGameType(rw.type, rw.val0), created: Math.floor(Date.now() / 1e3),
    num: Number(rw.num) || 1, fromval: '', kind: 'MYSTERYBAG_' + rarity,
    val0: rw.val0 || '', val1: String(rw.val1 || 0), val2: String(rw.val2 || 0), val3: '0', val4: '0'
  };
  SAVE.presents.push(p);
  presentPartFull(p);   // a weapon/armor inside arrives full
  return p;
}
// Label like 'Rare Lost Bag' if the present is a MYSTERYBAG_* kind, else ''.
function lostBagPresentLabel(p) {
  const m = /^MYSTERYBAG_(\w+)$/.exec(p && p.kind || '');
  return m ? `${bagTitle(m[1])} Lost Bag` : '';
}

// Render the add form for the chosen reward type and attach its handlers (autocomplete adds the reward on pick).
function renderRbForm() {
  if (rbType === 'LOSTBAG') {
    document.getElementById('rb-add-form').innerHTML = rbAddFormHtml() + '<div class="capNote">Sent the way Tokyo Death Metro sends a Lost Bag: it shows in the Reward Box as a bag of that rarity and gives its contents when you claim it. "Random" rolls each bag from the game\'s own odds.</div>';
    document.getElementById('rb-bag-rarity').addEventListener('change', e => { RB_FORM.bagRarity = e.target.value; RB_FORM.bagContent = ''; renderRbForm(); });
    document.getElementById('rb-bag-content').addEventListener('change', e => { RB_FORM.bagContent = e.target.value; });
    document.getElementById('rb-bag-qty').addEventListener('change', e => { RB_FORM.bagQty = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)); renderRbForm(); });
    document.getElementById('rb-bag-add').addEventListener('click', () => {
      const n = Math.max(1, Math.min(99, parseInt(document.getElementById('rb-bag-qty').value, 10) || 1));
      const pool = bagPool(RB_FORM.bagRarity);
      if (!pool.length) { toast('No contents known for that rarity (load masters.db)', true); return; }
      const ids = RB_FORM.bagContent ? Array(n).fill(RB_FORM.bagContent) : bagRoll(pool, n, Math.random);
      const got = ids.map(id => addLostBagPresent(RB_FORM.bagRarity, id)).filter(Boolean);
      renderAll();
      toast(`Added ${got.length} ${bagTitle(RB_FORM.bagRarity)} Lost Bag${got.length === 1 ? '' : 's'}: ${[...new Set(got.map(p => cmpPresentLabel(p)))].slice(0, 4).join(', ')}${got.length > 4 ? '…' : ''}`);
    });
    return;
  }
  // search-based types use autocomplete; money/spirit use a plain Amount + Add button
  const isSearchType = [ 'ITEM', 'BP', 'MUSHROOM', 'BEAST', 'SKILL', 'PT' ].includes(rbType);
  document.getElementById('rb-add-form').innerHTML = rbAddFormHtml() + (isSearchType ? qtyFirstNote(rbType === 'PT') : '') + (rbType === 'PT' ? '<div class="capNote">Weapons and armor are sent the way the game sends them (type = the part\'s slot). They arrive at the in-game +n you pick, with full durability and full ammo.</div>' : '');
  bindFormState([ [ 'rb-num', RB_FORM, isSearchType ? 'searchNum' : 'amountNum' ], [ 'rb-add-unrevealed', RB_FORM, 'unrevealed' ], [ 'rb-add-lvl', RB_FORM, 'ptLvl' ] ]);
  const searchCat = rbType === 'ITEM' ? 'item' : rbType === 'BP' ? 'bp' : rbType === 'MUSHROOM' ? 'msr' : rbType === 'BEAST' ? 'bst' : rbType === 'SKILL' ? 'skl' : rbType === 'PT' ? 'pt' : null;
  const psBox = document.getElementById('rb-include-ps');
  if (psBox) psBox.addEventListener('change', () => { RB_FORM.includePs = psBox.checked; });
  if (searchCat) {
    wireAutocomplete(document.getElementById('rb-search'), document.getElementById('rb-acdrop'), searchCat, rec => {
      const num = rbNumValue();
      if (rbType === 'BP') {
        const unrevealed = !!(document.getElementById('rb-add-unrevealed') || {}).checked;
        // the game gives items (blueprints included) their own itemtype, e.g. ITTP_RMAP -- not 'ITEM'
        const id = rec.id + (unrevealed ? 'U' : '');
        addPresent(boxGameType('ITEM', id), num, id);
      } else if (rbType === 'ITEM') {
        addPresent(boxGameType('ITEM', rec.id), num, rec.id);
      } else if (rbType === 'PT') {
        const raw = rawFromDisplay(rec, (document.getElementById('rb-add-lvl') || {}).value);
        addPresent(rec.type || 'PTTP_ARM', num, rec.id, raw > 1 ? raw : 0);
        presentPartFull(SAVE.presents[SAVE.presents.length - 1]);
        renderAll();
      } else {
        addPresent(rbType, num, rec.id);
      }
    }, undefined, 'rb-add-lvl', id => !rewardUnfit(searchCat, id));
  } else {
    document.getElementById('rb-add').addEventListener('click', () => {
      const num = rbNumValue();
      addPresent(rbType, num, '');
    });
  }
}

// Reward Box entries exactly as the game writes them (from a real save):
// {pid: lowercase UUID, from, type, created, num, fromval, kind, val0,
//  val1..val4 as STRINGS}. Older editor versions added a "uid" field, a
// non-UUID pid and numeric val1..val4; normalizePresents() repairs those.
// Matches the lowercase UUID format of present ids.
const PRESENT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Generate a UUID for new presents/instances (crypto.randomUUID, with a manual v4 fallback).
function presentUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); });
  b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
  const x = [ ...b ].map(v => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
// List what is wrong with a present versus the game's format (empty array means fine).
function presentProblems(p) {
  const bad = [];
  if (!p || typeof p !== 'object') return [ 'not an object' ];
  if ('uid' in p) bad.push('extra uid field');
  if (typeof p.pid !== 'string' || !PRESENT_UUID_RE.test(p.pid)) bad.push('pid');
  for (const k of [ 'val1', 'val2', 'val3', 'val4' ]) if (typeof p[k] !== 'string') bad.push(k);
  for (const k of [ 'fromval', 'kind', 'val0' ]) if (typeof p[k] !== 'string') bad.push(k);
  if (typeof p.num !== 'number') bad.push('num');
  if (typeof p.created !== 'number') bad.push('created');
  if (p.type === 'ITEM' && ITEM_INDEX[p.val0]) bad.push('type ITEM instead of the item\'s own type');
  return bad;
}
// Repair malformed presents in place (adds pid, stringifies val fields, uses the item's own itemtype); returns how many were fixed.
function normalizePresents(list) {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!presentProblems(p).length) continue;
    const s = v => v == null ? '' : String(v);
    list[i] = {
      pid: typeof p.pid === 'string' && PRESENT_UUID_RE.test(p.pid) ? p.pid : presentUuid(),
      from: p.from || 'LOGIN',
      type: p.type === 'ITEM' && ITEM_INDEX[p.val0] ? (ITEM_INDEX[p.val0].itemtype || 'ITEM') : (p.type || ''),
      created: Number(p.created) || Math.floor(Date.now() / 1e3),
      num: Number(p.num) || 0,
      fromval: s(p.fromval),
      kind: s(p.kind),
      val0: s(p.val0),
      val1: s(p.val1 != null && p.val1 !== '' ? p.val1 : 0),
      val2: s(p.val2 != null && p.val2 !== '' ? p.val2 : 0),
      val3: s(p.val3 != null && p.val3 !== '' ? p.val3 : 0),
      val4: s(p.val4 != null && p.val4 !== '' ? p.val4 : 0)
    };
    n++;
  }
  return n;
}

// Weapon / armor rewards (type PTTP_*): val1 = level (save units, '0' = base), val2 = durability
// (the raw number), val3 = loaded ammo, val4 = spare ammo -- confirmed in game by claiming test rewards.
// The game's '0' there means 0 durability / no ammo, so the editor always fills them to full.
// True when a present is a weapon/armor reward for a known part.
function isPartPresent(p) { return !!p && (p.type === 'PT' || String(p.type).startsWith('PTTP_')) && !!PT_INDEX[p.val0]; }
// Fill a part reward's val2/val3/val4 (durability, loaded ammo, spare ammo) to full; returns true if changed.
function presentPartFull(p) {
  if (!isPartPresent(p)) return false;
  const rec = PT_INDEX[p.val0], raw = Math.max(1, Number(p.val1) || 1);
  const want = [ String(partMaxDur(rec, raw) || Number(rec.dur) || 0), String(Number(rec.capacity) || 0), String(Number(rec.spare) || 0) ];
  const changed = p.val2 !== want[0] || p.val3 !== want[1] || p.val4 !== want[2];
  p.val2 = want[0]; p.val3 = want[1]; p.val4 = want[2];
  return changed;
}
// True when a part reward has no durability (the game's '0' means empty).
function presentPartEmpty(p) { return isPartPresent(p) && !(Number(p.val2) > 0); }

// What the Reward Box offers: only things the PC game can hand over.
// Left out: placeholder "parts" (First Aid / Food / Sand, gas-mask / pants slots), parts and decals
// with no in-game name, PlayStation-only parts, blueprints and decals (unless "Include PS-only"
// is ticked, for modded PC games), and the unnamed ITTP_WOOD item. Returns why, or '' when it's fine.
// Why a pick is not offered ('' when fine). kind: 'pt' | 'bp' | 'skl' | 'item'. ignorePs skips the PS-only check.
// Excludes placeholders, unnamed entries and (unless Include PS-only is ticked) PlayStation-only content.
function rewardUnfit(kind, id, ignorePs) {
  const psOk = ignorePs || RB_FORM.includePs;
  if (kind === 'pt') {
    const r = PT_INDEX[id];
    if (!r) return 'unknown part';
    if (![ 'PTTP_ARM', 'PTTP_HEAD', 'PTTP_BODY', 'PTTP_LEGS' ].includes(r.type) || GEAR_NEVER.test(id) || Number(r.is_consume)) return 'placeholder, not a real weapon or armor';
    if (!r.name || r.name === id) return 'has no in-game name';
    if (Number(r.platform) === 1 && !psOk) return 'PlayStation-only';
    return '';
  }
  if (kind === 'bp') {
    const it = ITEM_INDEX[id];
    if (!it || it.itemtype !== 'ITTP_RMAP') return 'not a blueprint';
    const pt = PT_INDEX['PT_' + String(id).replace(/^ITMP_/, '').replace(/U$/, '')];
    if (!pt) return 'blueprint for an unknown part';
    if (BLUEPRINT_BLOCKLIST.has(pt.id)) return 'blueprint the game doesn\'t use';
    if (Number(pt.platform) === 1 && !psOk) return 'PlayStation-only';
    return '';
  }
  if (kind === 'skl') {
    const r = SKL_INDEX[id];
    if (!r) return 'unknown decal';
    if (Number(r.platform) === 1 && !psOk) return 'PlayStation-only';
    return '';
  }
  if (kind === 'item') {
    const it = ITEM_INDEX[id];
    if (!it) return 'unknown item';
    if (it.itemtype === 'ITTP_WOOD' || !it.name || it.name === id || /^REWARDBOX\./.test(it.name)) return 'has no in-game name';
    return '';
  }
  return '';
}
// Same check for an existing present, picking the kind from its type.
function presentUnfit(p, ignorePs) {
  if (!p || !p.val0) return '';
  const t = String(p.type || '');
  if (t === 'PT' || t.startsWith('PTTP_')) return rewardUnfit('pt', p.val0, ignorePs);
  if (t === 'ITTP_RMAP') return rewardUnfit('bp', p.val0, ignorePs);
  if (t === 'SKILL') return rewardUnfit('skl', p.val0, ignorePs);
  if (t === 'ITEM' || t.startsWith('ITTP_')) return rewardUnfit('item', p.val0, ignorePs);
  return '';
}

// Human-readable type label for a present.
function presentTypeLabel(p) {
  const t = String(p && p.type || '');
  if (t === 'ITTP_RMAP') return /U$/.test(p.val0 || '') ? 'Blueprint (unrevealed)' : 'Blueprint';
  if (t === 'ITTP_MATERIAL') return 'Material';
  if (t.startsWith('ITTP_')) return 'Item';
  if (t === 'PTTP_ARM') return 'Weapon';
  if (t.startsWith('PTTP_')) return 'Armor';
  return { MONEY: 'Kill Coins', SPIRIT: 'SPLithium', SKILL: 'Decal', MUSHROOM: 'Mushroom', BEAST: 'Beast' }[t] || t || '?';
}

// Read the quantity input (min 1, capped at RB_NUM_MAX with a toast) and write the clamped value back.
function rbNumValue() { const el = document.getElementById('rb-num'); let v = parseInt(el && el.value, 10); if (!(v > 0)) v = 1; if (v > RB_NUM_MAX) { v = RB_NUM_MAX; toast(`Quantity limited to ${RB_NUM_MAX.toLocaleString()}`); } if (el) el.value = v; return v; }
// Upper bound for a reward quantity.
const RB_NUM_MAX = 999999;
// Append a present in the game's format (lowercase UUID pid, from 'LOGIN', string val1..val4) and re-render.
function addPresent(type, num, val0, val1) {
  SAVE.presents.push({
    pid: presentUuid(),
    from: 'LOGIN',
    type: type,
    created: Math.floor(Date.now() / 1e3),
    num: num,
    fromval: '',
    kind: '',
    val0: val0 || '',
    val1: String(val1 || 0),
    val2: '0',
    val3: '0',
    val4: '0'
  });
  toast(`Added ${type}${val0 ? ' (' + val0 + ')' : ''} x${num}`);
  renderAll();
}

// Weapon mastery is stored as points (abp) plus a level. The game's table
// (master_expert_lvl_reward) gives the points each level needs; genuine saves
// always have the level that matches the points, and the game works the level
// out from the points. So whenever the editor sets a level it also sets the points.
// abp -1 = weapon type never used (level 1).
// Points needed for a mastery level from master_expert_lvl_reward; 0 for level 1, null when the table has no row.
function mstThreshold(ptarmtp, lvl) {
  if (lvl <= 1) return 0;
  const r = arr(AP && AP.expertLvl).find(x => x.ptarmtp === ptarmtp && Number(x.lvl) === lvl);
  return r ? Number(r.abp) : null;
}
// Whether the loaded masters.db has a level table for this weapon type.
function mstHasTable(ptarmtp) { return mstThreshold(ptarmtp, 2) != null; }
// Mastery level the given points correspond to (the game derives level from points).
function mstLevelFromAbp(ptarmtp, abp) {
  let L = 1;
  for (let l = 2; l <= 20; l++) { const t = mstThreshold(ptarmtp, l); if (t != null && abp >= t) L = l; }
  return L;
}
// Set a mastery level and keep points consistent (abp -1 = never used is preserved at level 1).
// Highest mastery level the game has for a weapon type (master_expert_lvl_reward; 20 for every type today).
function mstMaxLevel(ptarmtp) {
  let top = 1;
  for (const r of arr(AP && AP.expertLvl)) if (r.ptarmtp === ptarmtp && Number(r.lvl) > top) top = Number(r.lvl);
  return top > 1 ? top : 20;
}
function mstSetLevel(e, lvl) {
  if (mstHasTable(e.ptarmtp)) lvl = Math.min(lvl, mstMaxLevel(e.ptarmtp));   // the game has no level above its table
  e.lvl = lvl;
  if (!mstHasTable(e.ptarmtp)) return;
  const abp = Number(e.abp);
  if (mstLevelFromAbp(e.ptarmtp, abp) === lvl) return;   // points already fit this level
  if (lvl <= 1) { e.abp = abp < 0 ? abp : 0; return; }
  e.abp = mstThreshold(e.ptarmtp, lvl);
}
// Mastery entries above the game's top level (written by other tools; the game's table stops at 20).
function mstOverMax() {
  return arr(SAVE && SAVE.soul && SAVE.soul.mstlvl).filter(e => e && mstHasTable(e.ptarmtp) && Number(e.lvl) > mstMaxLevel(e.ptarmtp));
}
// Haters (zombie.mstlvls[uid][cid] = [{ptarmtp, lvl, ...}]) copy the mastery of the fighter they came from, so a
// level above the top shows up there too. Returns [{list, i}] for each entry over the top in the raw save.
function mstZombieOverMax(root) {
  const out = [], z = root && root.zombie && root.zombie.mstlvls;
  if (!z || typeof z !== 'object') return out;
  for (const u of Object.values(z)) if (u && typeof u === 'object') for (const list of Object.values(u)) arr(list).forEach((e, i) => {
    if (e && mstHasTable(e.ptarmtp) && Number(e.lvl) > mstMaxLevel(e.ptarmtp)) out.push({ list, i });
  });
  return out;
}
// Download step: when the Save check fix was used, cap the Haters' copies too (they are not part of SAVE).
const MASTERY_CAP = { root: null, on: false };
function applyMasteryCap(root) {
  if (MASTERY_CAP.root !== RAW_SAV_ROOT || !MASTERY_CAP.on || !root) return root;
  for (const { list, i } of mstZombieOverMax(root)) list[i].lvl = mstMaxLevel(list[i].ptarmtp);
  return root;
}
// Mastery entries whose level disagrees with their points.
function mstMismatches() {
  return arr(SAVE && SAVE.soul && SAVE.soul.mstlvl).filter(e => e && mstHasTable(e.ptarmtp) && mstLevelFromAbp(e.ptarmtp, Number(e.abp)) !== Number(e.lvl || 1));
}

// HTML for the Weapon Mastery section.
function masteryBlockHtml() {
  return `\n      <div class="eyebrow" style="margin:16px 0 6px;">Weapon Mastery</div>\n      <div class="toolbar"><input type="text" id="mst-filter" placeholder="Filter by weapon name..." style="flex:1; max-width:280px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);"><button class="subtle" id="mst-max-all">Max all to 20</button></div>\n      <div class="listBlock" id="mst-list" style="max-height:320px;"></div>`;
}

// Wire the mastery list: per-weapon-type level dropdowns and a Max-all button (level 20). Edits go to SAVE.soul.mstlvl.
function wireMastery() {
  SAVE.soul.mstlvl = arr(SAVE.soul.mstlvl);
  const mstlvl = SAVE.soul.mstlvl;
  // find or create the mastery entry for a weapon type
  function ensureEntry(ptarmtp) {
    let e = mstlvl.find(m => m.ptarmtp === ptarmtp);
    if (!e) {
      e = {
        ptarmtp: ptarmtp,
        abp: 0,
        lvl: 1,
        is_checked: 1
      };
      mstlvl.push(e);
    }
    return e;
  }
  // render the list, skipping weapon types without an in-game name
  function renderMst(filter) {
    const all = (AP.ptarmtps || []).map(p => ({
      ptarmtp: p.id,
      name: resolveName(p.name)
    })).filter(p => p.name);
    const shown = all.filter(p => !filter || norm(p.name).includes(norm(filter)));
    document.getElementById('mst-list').innerHTML = shown.map(p => {
      const e = mstlvl.find(m => m.ptarmtp === p.ptarmtp);
      const lvl = e ? e.lvl : 1;
      const pts = e && Number(e.abp) > 0 ? Number(e.abp).toLocaleString() + ' pts' : '0 pts';
      return `<div class="listRow"><div class="name">${escapeHtml(p.name)}</div><div class="id" data-mst-pts="${p.ptarmtp}">${pts}</div><select class="mst-lvl" data-mst="${p.ptarmtp}" style="width:90px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">${fighterOpts(1, 20, Number(lvl) || 1, v => 'Lv ' + v)}</select></div>`;
    }).join('');
    document.querySelectorAll('.mst-lvl').forEach(inp => {
      inp.addEventListener('change', () => {
        let v = parseInt(inp.value, 10) || 1;
        if (v < 1) v = 1;
        if (v > 20) {
          v = 20;
          toast('Mastery caps at lvl 20');
        }
        inp.value = v;
        const e = ensureEntry(inp.dataset.mst);
        mstSetLevel(e, v);
        const ptsEl = document.querySelector(`[data-mst-pts="${inp.dataset.mst}"]`);
        if (ptsEl) ptsEl.textContent = (Number(e.abp) > 0 ? Number(e.abp).toLocaleString() : '0') + ' pts';
      });
    });
  }
  renderMst('');
  document.getElementById('mst-filter').addEventListener('input', e => renderMst(e.target.value));
  document.getElementById('mst-max-all').addEventListener('click', () => {
    for (const p of AP.ptarmtps || []) {
      if (resolveName(p.name)) mstSetLevel(ensureEntry(p.id), 20);
    }
    renderMst(document.getElementById('mst-filter').value);
    toast('All 54 real mastery categories maxed to 20');
  });
}

