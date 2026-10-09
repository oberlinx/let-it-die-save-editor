// ==== Skill Decals tab ====
// (Superseded by the second blockSkillDecals definition below; function declarations later in the file win.)
function blockSkillDecals() {
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Account</div><h2>Skill Decals</h2></div></div>\n    <div class="block-body">\n      <div class="toolbar"><input type="text" id="decal-filter" placeholder="Filter by name..." style="flex:1; max-width:280px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);"><div class="count" id="decal-count"></div></div>\n      <div class="listBlock" id="decal-list" style="max-height:360px;"></div>\n    </div>\n  </section>`;
}

// The game itself stores counts up to at least 98 (seen in a real save), so
// the editor allows up to 99.
const DECAL_CAP = 99;

// Which decals the Decals tab and the fighter decal search offer. PlayStation-only decals
// (platform 1) are hidden unless "Include PS-only" is ticked. Ones the save already has stay
// listed (tagged) so they can be seen and cleared. Decals with unlock ____SERVICE_IN are
// normal: a genuine, unedited PSN save holds 11 of them with counts from 3 to 16.
// Decal list filter state: includePs shows PlayStation-only decals (platform 1).
const DECAL_FORM = { includePs: false };
// Decal name, with '(Premium)' when it is the premium version (most names exist in both).
// Decal name with (Premium) when it is the premium version -- most names exist as both.
function decalNameP(id) {
  const r = SKL_INDEX[id];
  if (!r) return id;
  return r.name + (Number(r.premium) ? ' (Premium)' : '');
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
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Account</div><h2>Skill Decals</h2></div></div>\n    <div class="block-body">\n      <div class="toolbar">\n        <input type="text" id="decal-filter" placeholder="Filter by name..." style="flex:1; max-width:280px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">\n        <button class="subtle" id="decal-max-all">Max all (${DECAL_CAP})</button>\n        <input type="number" id="decal-apply-val" min="0" max="${DECAL_CAP}" value="${DECAL_CAP}" style="width:60px; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:6px;">\n        <button class="subtle" id="decal-apply-all">Apply to all filtered</button>\n        <label class="stewHlOnly" title="PlayStation-only decals only work in PC games that were modded to have them"><input type="checkbox" id="decal-ps" ${DECAL_FORM.includePs ? 'checked' : ''}> Include PS-only ${psLabelNote()}</label>\n        <div class="count" id="decal-count"></div>\n      </div>\n      <div id="decal-odd"></div>\n      <div class="listBlock" id="decal-list" style="max-height:360px;"></div>\n    </div>\n  </section>`;
}

// Wire the Decals tab: list, filter, per-decal count, Max, bulk apply, PS-only toggle. Edits go straight
// to SAVE.soul.psskls ({id, lvl, cnt, is_checked}); counts are clamped to 0..DECAL_CAP.
function wireSkillDecals() {
  const soul = SAVE.soul;
  soul.psskls = arr(soul.psskls);
  // find an owned decal entry by id
  function entryFor(id) {
    return soul.psskls.find(s => s.id === id);
  }
  // set a decal's count (clamped), creating the entry if missing; returns the clamped value
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
    const owned = id => { const e = entryFor(id); return !!(e && e.cnt > 0); };
    const all = Object.values(SKL_INDEX).filter(s => decalOffered(s.id) || owned(s.id)).sort((a, b) => a.name.localeCompare(b.name));
    const shown = all.filter(s => !filter || norm(s.name).includes(norm(filter)));
    document.getElementById('decal-count').textContent = `${shown.length} shown / ${all.length} total`;
    const odd = isPsSave() ? [] : soul.psskls.filter(e => e.cnt > 0 && !decalOffered(e.id));
    const oddEl = document.getElementById('decal-odd');
    if (oddEl) oddEl.innerHTML = odd.length ? `<div class="warnNote" style="margin:6px 0;">This save holds ${odd.length} PS-only decal${odd.length === 1 ? '' : 's'}, marked below. A normal PC game doesn't have them (fine on PlayStation or a modded PC game). <button class="subtle" id="decal-clear-odd">Set them to 0</button></div>` : '';
    document.getElementById('decal-list').innerHTML = shown.map(s => {
      const e = entryFor(s.id);
      const cnt = e ? Math.min(Math.max(e.cnt || 0, 0), DECAL_CAP) : 0;
      const tag = decalOddTag(s.id);
      return `<div class="listRow"><div class="name">${escapeHtml(s.name)}${Number(s.premium) ? ' <span class="badge" style="margin-left:4px;" title="Kept when the fighter dies or the decal is taken off">Premium</span>' : ''}${tag ? ` <span class="badge" style="margin-left:4px;">${tag}</span>` : ''}</div><div class="id">${s.id}</div>\n        <input type="number" class="decal-cnt" data-decal="${s.id}" min="0" max="${DECAL_CAP}" value="${cnt}" style="width:55px;">\n        <button class="subtle" data-decal-max="${s.id}">Max</button>\n      </div>`;
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
    const all = Object.values(SKL_INDEX).filter(s => decalOffered(s.id) && (!currentFilter || norm(s.name).includes(norm(currentFilter))));
    for (const s of all) setCnt(s.id, v);
    renderList(currentFilter);
    toast(`Set ${all.length} filtered decals to ${v}`);
  });
}

