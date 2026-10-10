// ==== Research Stamp (Funshots) ====
// Returns the static HTML shell for the Research Stamp block: an explanatory note, a #stamp-note slot
// (filled by renderStampGrid), a "Sync all from Research" button and an empty #stamp-grid.
function stampBlockHtml() {
  return `\n      <div class="eyebrow" style="margin:16px 0 6px;">Research Stamp (Funshots)</div><div class="capNote" style="margin-top:0;">Each researched part adds its Funshot once: Slash and Shoot +0.4, Hit +0.8, Head, Body and Legs +0.2. Upgrading a part (+1 to +4) adds nothing, and some parts give none (for example the 0A/0N weapon variants, and PS-only blueprints on stock game data). Changing research moves each Funshot by exactly what that change adds or removes, keeping the save's own figure; "Sync all from Research" sets all six to what research gives. The totals follow the masters.db you loaded: a modded one that opens extra blueprints gives more.</div><div id="stamp-note"></div>\n      <div class="toolbar"><button class="subtle" id="stamp-sync-all">Sync all from Research</button></div>\n      <div class="grid" style="grid-template-columns: repeat(3, 1fr);" id="stamp-grid"></div>`;
}

// Hook set by wireStamp(): re-renders the six Funshot inputs. Called by syncStampFromResearch()
// and by other tabs after research changes. Null until the Stamp block has been wired.
let REFRESH_STAMP_GRID = null;

// STAMP_MARK remembers (per loaded save, keyed by RAW_SAV_ROOT identity) that the editor wrote
// Funshots into a save that had NOT yet run the game's one-time stamp setup. At download time
// applyStampMark() then sets the gameflg flag so the game does not re-add (double) the values.
// The game runs a one-time "research stamp" setup (gameflg sv SGF_INIT_RESEARCH_STAMP = 1) the first time
// you visit Choku-Funsha: it adds the Funshots (and rank points) for everything already researched.
// Until that flag is set, anything the editor writes into researchstamp is added on top -> doubled.
// Seen in game: a fresh account maxed by the editor showed doubled Funshots; the game then set the flag.
// Seen in game: that setup counts research written by the editor twice (a fresh account maxed by the
// editor showed Slash 106.4 whatever researchstamp held; an account set up by the game shows exactly
// the saved value, e.g. 49.2). So when the editor sets Funshots on a save without the flag, it also
// marks the setup as done at download (STAMP_MARK), and the game keeps the editor's values.
let STAMP_MARK = { root: null, on: false };
// True when the editor has asked to mark the stamp setup as done for the currently loaded save.
function stampMarked() { return STAMP_MARK.root === RAW_SAV_ROOT && STAMP_MARK.on; }
// True if the given save root already has gameflg flag SGF_INIT_RESEARCH_STAMP === 1.
// gameflg is an object of arrays (e.g. gameflg.sv / gameflg.cl); all arrays are flattened and searched.
function stampFlagIn(root) {
  const g = root && root.gameflg;
  const list = g && typeof g === 'object' ? [].concat(...Object.values(g).filter(Array.isArray)) : [];
  const f = list.find(x => x && x.var === 'SGF_INIT_RESEARCH_STAMP');
  return !!f && Number(f.value) === 1;
}
// Download-time hook: if marking was requested and the flag is missing, push the flag into
// root.gameflg.sv (creating containers as needed). Mutates and returns root.
function applyStampMark(root) {
  if (!stampMarked() || stampFlagIn(root)) return root;
  root.gameflg = root.gameflg && typeof root.gameflg === 'object' ? root.gameflg : {};
  if (!Array.isArray(root.gameflg.sv)) root.gameflg.sv = [];
  root.gameflg.sv.push({ var: 'SGF_INIT_RESEARCH_STAMP', value: 1, modified: Math.floor(Date.now() / 1e3) });
  return root;
}
// Same flag test as stampFlagIn but against the untouched RAW_SAV_ROOT (the state as loaded).
function stampInitDone() {
  const g = RAW_SAV_ROOT && RAW_SAV_ROOT.gameflg;
  const list = g && typeof g === 'object' ? [].concat(...Object.values(g).filter(Array.isArray)) : [];
  const f = list.find(x => x && x.var === 'SGF_INIT_RESEARCH_STAMP');
  return !!f && Number(f.value) === 1;
}
// Recompute all six Funshot rates (RESEARCH_STAMP_TYPES) from the current research state via
// computeStampTotals() and write them into SAVE.soul.researchstamp ([{type, rate}]).
// Returns false when masters.db data (AP.pts) is not loaded. Side effect: arms STAMP_MARK if the
// game's setup flag is absent, and refreshes the grid.
function syncStampFromResearch() {
  if (!AP || !AP.pts || !AP.pts.length) return false;
  if (RAW_SAV_ROOT && !stampInitDone()) STAMP_MARK = { root: RAW_SAV_ROOT, on: true };   // see above
  // researchstamp may be missing or a {} placeholder; arr() normalizes it to an array
  SAVE.soul.researchstamp = arr(SAVE.soul.researchstamp);
  const computed = computeStampTotals();
  for (const type of RESEARCH_STAMP_TYPES) {
    let e = SAVE.soul.researchstamp.find(r => r.type === type);
    if (!e) {
      e = {
        type: type,
        rate: 0
      };
      SAVE.soul.researchstamp.push(e);
    }
    e.rate = computed[type];
  }
  if (REFRESH_STAMP_GRID) REFRESH_STAMP_GRID();
  return true;
}

// stampTotalsNow(): computeStampTotals() when masters.db is loaded, else null. Call it BEFORE a research edit
// and pass the result to adjustStampFromResearch() afterwards.
function stampTotalsNow() { return AP && AP.pts && AP.pts.length ? computeStampTotals() : null; }
// adjustStampFromResearch(before): after a research edit, move each Funshot by exactly what that edit added or
// removed (research totals after minus before), keeping the save's own figure as the base. A full re-sync
// (syncStampFromResearch) would instead replace the game's values with the editor's totals, which differ from
// the game's on some saves (cause unknown), so a single blueprint change could jump the Funshots by dozens.
// The explicit "Sync all from Research" button and the Save check fixes still do the full re-sync.
function adjustStampFromResearch(before) {
  const after = stampTotalsNow();
  if (!before || !after) return syncStampFromResearch();
  const moved = RESEARCH_STAMP_TYPES.filter(t => Math.abs((after[t] || 0) - (before[t] || 0)) > 0.001);
  if (!moved.length) { if (REFRESH_STAMP_GRID) REFRESH_STAMP_GRID(); return true; }
  if (RAW_SAV_ROOT && !stampInitDone()) STAMP_MARK = { root: RAW_SAV_ROOT, on: true };   // see syncStampFromResearch
  SAVE.soul.researchstamp = arr(SAVE.soul.researchstamp);
  for (const type of moved) {
    let e = SAVE.soul.researchstamp.find(r => r.type === type);
    if (!e) { e = { type: type, rate: 0 }; SAVE.soul.researchstamp.push(e); }
    const v = (Number(e.rate) || 0) + (after[type] || 0) - (before[type] || 0);
    e.rate = Math.min(99999, Math.max(0, Math.round(v * 10) / 10));
  }
  if (REFRESH_STAMP_GRID) REFRESH_STAMP_GRID();
  return true;
}

// Wires the Research Stamp block: renders the grid (one number input per Funshot type, highlighting
// values that differ from what research implies), handles manual edits (clamped, 1 decimal) and the sync button.
function wireStamp() {
  SAVE.soul.researchstamp = arr(SAVE.soul.researchstamp);
  // Builds the note (pending / marked states) and the six inputs; re-run after any change.
  function renderStampGrid() {
    const pending = !!RAW_SAV_ROOT && !stampInitDone();
    const computed = AP && AP.pts && AP.pts.length ? computeStampTotals() : null;
    const noteEl = document.getElementById('stamp-note');
    if (noteEl) noteEl.innerHTML = !pending ? '' : stampMarked()
      ? '<div class="capNote">This save hadn\'t had the game\'s one-time Funshot setup. Because the editor set the Funshots, it marks that setup as done when you download, so the game keeps these values instead of re-counting (it counts editor research twice). The setup also grants rank points; set Rank on the Account tab if you want them.</div>'
      : '<div class="capNote">This save hasn\'t had the game\'s one-time Funshot setup yet (it runs on the first Choku-Funsha visit). If you change research here, the editor sets the Funshots and marks that setup as done, because the game\'s setup counts editor research twice.</div>';
    document.getElementById('stamp-grid').innerHTML = RESEARCH_STAMP_TYPES.map(type => {
      const e = SAVE.soul.researchstamp.find(r => r.type === type);
      const raw = e ? e.rate : 0;
      const comp = computed ? computed[type] : null;
      const mismatch = comp != null && Math.abs(comp - raw) > .05;
      return `<div class="field"><label>${STAMP_LABELS[type]}${comp != null ? ` (research says ${comp})` : ''}</label>\n        <input type="number" step="0.1" data-stamp="${type}" value="${raw}" style="${mismatch ? 'border-color:var(--warn);' : ''}">\n      </div>`;
    }).join('');
    // manual edit handler: sanitize to a non-negative value with one decimal, cap 99999, upsert the entry
    document.querySelectorAll('[data-stamp]').forEach(inp => {
      inp.addEventListener('change', () => {
        const type = inp.dataset.stamp;
        let rate = parseFloat(inp.value); if (!isFinite(rate) || rate < 0) rate = 0; rate = Math.min(Math.round(rate * 10) / 10, 99999); inp.value = rate;
        let e = SAVE.soul.researchstamp.find(r => r.type === type);
        if (!e) {
          e = {
            type: type,
            rate: 0
          };
          SAVE.soul.researchstamp.push(e);
        }
        e.rate = rate;
      });
    });
  }
  REFRESH_STAMP_GRID = renderStampGrid;
  renderStampGrid();
  document.getElementById('stamp-sync-all').addEventListener('click', () => {
    if (!syncStampFromResearch()) {
      toast('Load masters.db first -- Research Stamp totals are computed from it', true);
      return;
    }
    toast('Research Stamp synced from current research state');
  });
}

