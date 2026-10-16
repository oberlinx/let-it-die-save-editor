// ==== Skill Decals tab ====
// (Superseded by the second blockSkillDecals definition below; function declarations later in the file win.)
function blockSkillDecals() {
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Items</div><h2>Skill Decals</h2></div></div>\n    <div class="block-body">\n      <div class="toolbar"><input type="text" id="decal-filter" placeholder="Filter by name..." style="flex:1; max-width:280px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);"><div class="count" id="decal-count"></div></div>\n      <div class="listBlock" id="decal-list" style="max-height:360px;"></div>\n    </div>\n  </section>`;
}

// The game itself stores counts up to at least 98 (seen in a real save), so
// the editor allows up to 99.
const DECAL_CAP = 99;

// Which decals the Decals tab and the fighter decal search offer. PlayStation-only decals
// (platform 1) are hidden unless "Include PS-only" is ticked, because PS-only content must not show up
// in PC saves by default. Ones the save already has stay
// listed (tagged) so they can be seen and cleared. Decals with unlock ____SERVICE_IN are
// normal: a genuine, unedited PSN save holds 11 of them with counts from 3 to 16.
// Decal list filter state: includePs shows PlayStation-only decals (platform 1). Kept at file level so the
// choice survives the tab being re-rendered.
const DECAL_FORM = { includePs: false };
// Decal name, with '(Premium)' when it is the premium version. Most names exist in both versions, so the
// suffix is what tells the two rows apart in the list.
function decalNameP(id) {
  const r = SKL_INDEX[id];
  if (!r) return id;
  return r.name + (Number(r.premium) ? ' (Premium)' : '');
}
// Decal icons: every icon is a cell in one embedded sprite sheet (the CSS .dicon rule), so they work offline.
// DECAL_ATLAS = { cell, cols, names } where names[i] is the icon in cell i (left to right, top to bottom).
const DECAL_ATLAS = JSON.parse(document.getElementById('decal-atlas-data').textContent);
const DECAL_ICON_AT = Object.fromEntries(DECAL_ATLAS.names.map((n, i) => [n, i]));
// decalIcon(): <span> showing a decal's icon at px size, or '' if it has none. A premium decal
// ("..._P") shares the icon of its normal version.
function decalIcon(id, px) {
  let i = DECAL_ICON_AT[id];
  if (i == null) i = DECAL_ICON_AT[String(id).replace(/_P$/, '')];
  if (i == null) return '';
  const c = DECAL_ATLAS.cols;
  return `<span class="dicon" style="width:${px}px; height:${px}px; background-size:${c * px}px auto; background-position:-${(i % c) * px}px -${Math.floor(i / c) * px}px;"></span>`;
}
// Item icons: materials, mushrooms, beasts, blueprints, currencies, weapons, armour and weapon types, in embedded sprite sheets
// (CSS classes .gicon.s-items / .s-weapons / .s-armor / .s-mastery), so they work offline.
// ICON_ATLAS = { cell: [w, h], sheets: { name: { cols, names, cell? } }, alias: { id: icon name } }; a sheet's own cell
// overrides the common one (the weapon-type icons used for mastery are square). names[i] is the icon in
// cell i (left to right, top to bottom) and alias maps a part with no icon of its own to the one it borrows.
const ICON_ATLAS = JSON.parse(document.getElementById('icon-atlas-data').textContent);
const ICON_AT = {};
for (const [ sheet, s ] of Object.entries(ICON_ATLAS.sheets)) s.names.forEach((n, i) => { ICON_AT[n] = [ sheet, i ]; });
// iconSpan(): <span> showing the named icon h pixels tall, or '' if no sheet has it.
function iconSpan(name, h) {
  const at = ICON_AT[name];
  if (!at) return '';
  const [ cw, ch ] = ICON_ATLAS.sheets[at[0]].cell || ICON_ATLAS.cell, c = ICON_ATLAS.sheets[at[0]].cols, w = Math.round(h * cw / ch);
  return `<span class="gicon s-${at[0]}" style="width:${w}px; height:${h}px; background-size:${c * w}px auto; background-position:-${(at[1] % c) * w}px -${Math.floor(at[1] / c) * h}px;"></span>`;
}
// partIcon(): icon of a weapon or armour piece (its own, or the one it borrows).
function partIcon(ptid, h) { return iconSpan(ICON_ATLAS.alias[ptid] || ptid, h); }
// itemIcon(): icon of a material or other item. An unrevealed blueprint (ITMP_...U) shows the game's unknown-blueprint
// icon for its rarity; a revealed one shows the piece it builds, or the plain blueprint icon if that piece has none.
function itemIcon(itemId, h) {
  const id = String(itemId);
  if (!id.startsWith('ITMP_')) return iconSpan(id, h);
  const rar = Math.min(3, Math.max(1, Number((ITEM_INDEX[id] || {}).rarity) || 1));
  if (id.endsWith('U')) return iconSpan('UN_RMAP_' + rar, h);
  return partIcon(id.replace(/^ITMP_/, 'PT_'), h) || iconSpan('RMAP_' + rar, h);
}
// msrIcon() / bstIcon(): icon of a mushroom or beast; cooked uses the grilled icon when there is one.
function msrIcon(msrid, cooked, h) { return (Number(cooked) ? iconSpan(msrid + '_R', h) : '') || iconSpan(msrid, h); }
function bstIcon(bstid, cooked, h) { return (Number(cooked) ? iconSpan(bstid + '_R', h) : '') || iconSpan(bstid, h); }
// currencyIcon(): icon for a reward that is a currency or pass and has no item id: Kill Coins, Death Metal (a MONEY reward
// whose id says MEDAL), SPLithium, Bloodnium, and the 1-day and 30-day Express passes. '' for any other type.
function currencyIcon(type, rwdid, h) {
  const t = String(type || '');
  const name = t === 'MONEY' ? (/MEDAL/.test(String(rwdid || '')) ? 'DMetal_1' : 'Money_1') : t === 'SPIRIT' ? 'Spirit_1' : t === 'BLOODNIUM' ? 'Blood_1' : t === '1VIP' ? 'VIPticket_1' : t === 'VIP' ? 'VIPticket_2' : '';
  return name ? iconSpan(name, h) : '';
}
// anyIcon(): icon for an id of unknown kind (part, item, mushroom, beast or decal), or ''.
function anyIcon(id, h) {
  if (PT_INDEX[id]) return partIcon(id, h);
  if (ITEM_INDEX[id]) return itemIcon(id, h);
  if (MSR_INDEX[id]) return msrIcon(id, 0, h);
  if (BST_INDEX[id]) return bstIcon(id, 0, h);
  if (SKL_INDEX[id]) return decalIcon(id, h);
  return '';
}
// 'PS-only' for PlayStation-only decals, else ''.
function decalOddTag(id) {
  const r = SKL_INDEX[id];
  if (!r) return '';
  if (Number(r.platform) === 1) return 'PS-only';
  return '';
}
// Whether a decal is listed: normal ones always, PS-only ones only when the checkbox is ticked.
function decalOffered(id) {
  return !decalOddTag(id) || DECAL_FORM.includePs;
}

// Section shell for the Skill Decals tab (this later definition replaces the simpler one above).
function blockSkillDecals() {
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Items</div><h2>Skill Decals</h2></div></div>\n    <div class="block-body">\n      <div class="toolbar">\n        <input type="text" id="decal-filter" placeholder="Filter by name..." style="flex:1; max-width:280px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">\n        <button class="subtle" id="decal-max-all">Max all (${DECAL_CAP})</button>\n        <input type="number" id="decal-apply-val" min="0" max="${DECAL_CAP}" value="${DECAL_CAP}" style="width:60px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:6px;">\n        <button class="subtle" id="decal-apply-all">Apply to all filtered</button>\n        <label class="stewHlOnly" title="PlayStation-only decals only work in PC games that were modded to have them"><input type="checkbox" id="decal-ps" ${DECAL_FORM.includePs ? 'checked' : ''}> Include PS-only ${psLabelNote()}</label>\n        <div class="count" id="decal-count"></div>\n      </div>\n      <div id="decal-odd"></div>\n      <div class="listBlock" id="decal-list" style="max-height:360px;"></div>\n    </div>\n  </section>`;
}

// Wire the Decals tab: list, filter, per-decal count, Max, bulk apply, PS-only toggle. Edits go straight
// to SAVE.soul.psskls ({id, lvl, cnt, is_checked}); counts are clamped to 0..DECAL_CAP so a typo can't
// write a count above what the game is known to store.
function wireSkillDecals() {
  const soul = SAVE.soul;
  soul.psskls = arr(soul.psskls);
  // find an owned decal entry by id
  function entryFor(id) {
    return soul.psskls.find(s => s.id === id);
  }
  // set a decal's count (clamped), creating the entry if missing; returns the clamped value so the input
  // box can be rewritten with what was really stored
  function setCnt(id, v) {
    v = Math.min(Math.max(v, 0), DECAL_CAP);
    let e = entryFor(id);
    if (!e) {
      e = {
        id: id,
        lvl: 1,
        cnt: v,
        is_checked: 1
      };
      soul.psskls.push(e);
    } else {
      e.cnt = v;
    }
    return v;
  }
  let currentFilter = '';
  // re-render the visible list; keeps decals already owned even if otherwise hidden (PS-only)
  function renderList(filter) {
    currentFilter = filter;
    // owned ones stay visible even when PS-only is unticked, so they can still be seen and cleared
    const owned = id => { const e = entryFor(id); return !!(e && e.cnt > 0); };
    const all = Object.values(SKL_INDEX).filter(s => decalOffered(s.id) || owned(s.id)).sort((a, b) => a.name.localeCompare(b.name));
    const shown = all.filter(s => !filter || norm(s.name).includes(norm(filter)));
    document.getElementById('decal-count').textContent = `${shown.length} shown / ${all.length} total`;
    // On a PlayStation save PS-only decals are normal, so only warn for PC saves.
    const odd = isPsSave() ? [] : soul.psskls.filter(e => e.cnt > 0 && !decalOffered(e.id));
    const oddEl = document.getElementById('decal-odd');
    if (oddEl) oddEl.innerHTML = odd.length ? `<div class="warnNote" style="margin:6px 0;">This save holds ${odd.length} PS-only decal${odd.length === 1 ? '' : 's'}, marked below. A normal PC game doesn't have them (fine on PlayStation or a modded PC game). <button class="subtle" id="decal-clear-odd">Set them to 0</button></div>` : '';
    document.getElementById('decal-list').innerHTML = shown.map(s => {
      const e = entryFor(s.id);
      // clamp the displayed value too, in case the save holds a count above DECAL_CAP
      const cnt = e ? Math.min(Math.max(e.cnt || 0, 0), DECAL_CAP) : 0;
      const tag = decalOddTag(s.id);
      return `<div class="listRow"><a class="diconLink" href="${MODEL_VIEWER_URL}decals.html#${encodeURIComponent(s.id)}" target="_blank" rel="noopener" title="Open in the decal catalogue (needs internet)">${decalIcon(s.id, 32)}</a><div class="name">${escapeHtml(s.name)}${Number(s.premium) ? ' <span class="badge" style="margin-left:4px;" title="Kept when the fighter dies or the decal is taken off">Premium</span>' : ''}${tag ? ` <span class="badge" style="margin-left:4px;">${tag}</span>` : ''}</div><div class="id">${s.id}</div>\n        <input type="number" class="decal-cnt" data-decal="${s.id}" min="0" max="${DECAL_CAP}" value="${cnt}" style="width:55px;">\n        <button class="subtle" data-decal-max="${s.id}">Max</button>\n      </div>`;
    }).join('') || '<div style="padding:10px; color:var(--text-faint); font-size:12px;">No matches.</div>';
    document.querySelectorAll('.decal-cnt').forEach(inp => {
      inp.addEventListener('change', () => {
        let v = parseInt(inp.value, 10) || 0;
        if (v > DECAL_CAP) toast(`Clamped to ${DECAL_CAP}`);
        inp.value = setCnt(inp.dataset.decal, v);
      });
    });
    const clr = document.getElementById('decal-clear-odd');
    if (clr) clr.addEventListener('click', () => {
      // set to 0 rather than remove the entry, so nothing else on the record is lost
      for (const e of odd) e.cnt = 0;
      renderList(currentFilter);
      toast(`Set ${odd.length} decal${odd.length === 1 ? '' : 's'} to 0`);
    });
    document.querySelectorAll('[data-decal-max]').forEach(btn => {
      btn.addEventListener('click', () => {
        setCnt(btn.dataset.decalMax, DECAL_CAP);
        renderList(currentFilter);
      });
    });
  }
  renderList('');
  document.getElementById('decal-filter').addEventListener('input', e => renderList(e.target.value));
  document.getElementById('decal-ps').addEventListener('change', e => {
    DECAL_FORM.includePs = e.target.checked;
    renderList(currentFilter);
    toast(e.target.checked ? `PS-only decals now listed${isPsSave() ? '' : ' (only for PC games modded to have them)'}` : 'PS-only decals hidden');
  });
  document.getElementById('decal-max-all').addEventListener('click', () => {
    // only decals currently offered, so Max all never adds hidden PS-only decals to a PC save
    for (const s of Object.values(SKL_INDEX)) if (decalOffered(s.id)) setCnt(s.id, DECAL_CAP);
    renderList(currentFilter);
    toast(`All decals set to ${DECAL_CAP}`);
  });
  document.getElementById('decal-apply-all').addEventListener('click', () => {
    let v = parseInt((document.getElementById('decal-apply-val') || {}).value, 10) || 0;
    if (v > DECAL_CAP) {
      v = DECAL_CAP;
      toast(`Clamped to ${DECAL_CAP}`);
    }
    // 'filtered' means what the list shows now: offered decals matching the name filter
    const all = Object.values(SKL_INDEX).filter(s => decalOffered(s.id) && (!currentFilter || norm(s.name).includes(norm(currentFilter))));
    for (const s of all) setCnt(s.id, v);
    renderList(currentFilter);
    toast(`Set ${all.length} filtered decals to ${v}`);
  });
}

