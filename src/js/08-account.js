// ==== Account tab: currency and banks ====
//
// bankRow(): HTML for one "bank-limited" currency row (Kill Coins / SPLithium).
// soul[levelField] is the bank level (safe_level or spirit_tank_level; the game stores only the
// level), soul[valueField] the held amount (free_money or spirit). The capacity for a level comes
// from bankCapacityForLevel(); amounts above it are flagged "OVER CAP" (the game would clamp).
// `kind` is unused here. Returns an HTML string.
function bankRow(soul, kind, label, levelField, valueField) {
  const level = soul[levelField] != null ? soul[levelField] : 1;
  const maxLvl = bankMaxLevel(levelField);
  const cap = bankCapacityForLevel(level, levelField);
  const val = soul[valueField] != null ? soul[valueField] : 0;
  const over = val > cap;
  return `<div class="bankRow">\n    <div class="bankLabel">${label}</div>\n    <div class="field"><label>Bank Level</label><select data-bank-level="${levelField}" data-bank-cap-target="${valueField}" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">${fighterOpts(1, maxLvl, Number(level), v => 'Level ' + v)}</select></div>\n    <div class="field"><label>Held Amount</label><input type="text" inputmode="numeric" data-currency="${valueField}" value="${val.toLocaleString()}"></div>\n    <div class="bankCap ${over ? 'over' : ''}" data-bank-cap-display="${valueField}">cap: ${cap.toLocaleString()}${over ? ' -- OVER CAP' : ''}</div>\n    <div style="display:flex; gap:6px; white-space:nowrap;"><button class="subtle" data-bank-fill="${valueField}" data-bank-fill-level="${levelField}" title="Fill to this bank level's cap without changing the level">Fill to cap</button>\n    <button class="subtle" data-bank-max="${levelField}" data-bank-max-value="${valueField}" title="Max the bank level and fill it">Max level + fill</button></div>\n  </div>`;
}

// blockCurrency(): the Account tab: read-only account id/name, TDM points (rank is derived from
// the points via tdmRankForPoints), the two bank rows, the remaining plain currencies from
// currencyFields() (each with an optional hard cap in data-max), and the mastery block.
// Returns an HTML string.
function blockCurrency() {
  const soul = SAVE.soul;
  const rank = tdmRankForPoints(soul.tdm_point || 0, AP);
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Account</div><h2>Account Details</h2></div></div>\n    <div class="block-body">\n      <div class="grid" style="margin-bottom:14px;">\n        <div class="field"><label>Account ID <span class="id">(Steam ID, read only)</span></label><div id="acc-psnacid" style="padding:8px 0; font-size:14px; word-break:break-all;">${escapeHtml(SAVE.user.psnacid != null && SAVE.user.psnacid !== '' ? String(SAVE.user.psnacid) : '—')}</div></div>\n        <div class="field"><label>Account Name <span class="id">(read only)</span></label><div id="acc-name" style="padding:8px 0; font-size:14px; word-break:break-all;"><b>${escapeHtml(SAVE.user.nm != null && SAVE.user.nm !== '' ? String(SAVE.user.nm) : '—')}</b></div></div>\n        <div class="field"><label>TDM Points</label><input type="number" id="tdm-point" min="0" max="${tdmPointMax()}" step="1" value="${soul.tdm_point || 0}"></div>\n        <div class="field"><label>TDM Rank <span class="id">(from the points)</span></label><div style="padding:8px 0; font-size:14px; word-break:break-all;">${escapeHtml(rank ? formatTdmRank(resolveName(rank.name)) || rank.id : soul.tdm_rank || '?')}</div></div>\n      </div>\n      <div class="eyebrow" style="margin-bottom:8px;">Bank-limited currencies</div>\n      <div class="bankTable">\n        ${bankRow(soul, 'money', 'Kill Coins', 'safe_level', 'free_money')}\n        ${bankRow(soul, 'spirit', 'SPLithium', 'spirit_tank_level', 'spirit')}\n      </div>\n      <div class="grid">\n        ${currencyFields().map(([f, label, cap]) => `\n          <div class="field">\n            <label>${label}${cap ? ` (max ${cap.toLocaleString()})` : ''}</label>${f === 'recycle_point' ? `<div class="capNote" style="margin:0 0 4px;">In game, anything earned over the max is lost.</div>` : ''}\n            <input type="text" inputmode="numeric" data-currency="${f}" ${cap ? `data-max="${cap}"` : ''} value="${(soul[f] != null ? soul[f] : 0).toLocaleString()}">\n          </div>`).join('')}\n      </div>\n      ${masteryBlockHtml()}\n    </div>\n  </section>`;
}

// wireCurrency(): listeners for the Account tab.
// - TDM points: clamped to the top rank's max, then soul.tdm_rank is updated from the points.
// - [data-currency] text inputs: digits only (commas stripped), clamped to data-max if present.
// - bank level selects: write the level, and also a *_limit field but only if the save already has one.
// - Fill-to-cap / Max-level buttons: set the held amount to the bank capacity.
function wireCurrency() {
  // TDM points are the source of truth; the rank id is re-derived from them
  document.getElementById('tdm-point').addEventListener('change', e => {
    { const mx = tdmPointMax(); let v = parseInt(e.target.value, 10); if (isNaN(v) || v < 0) v = 0; if (v > mx) { v = mx; toast(`Clamped to the top rank (${mx.toLocaleString()})`); } SAVE.soul.tdm_point = v; }
    const rank = tdmRankForPoints(SAVE.soul.tdm_point, AP);
    if (rank) SAVE.soul.tdm_rank = rank.id;
    renderAll();
  });
  document.querySelectorAll('[data-currency]').forEach(inp => {
    inp.addEventListener('change', () => {
      const txt = inp.value.replace(/[,\s]/g, '');
      let v = /^\d+$/.test(txt) ? parseInt(txt, 10) : NaN;
      if (isNaN(v)) { v = Number(SAVE.soul[inp.dataset.currency]) || 0; inp.value = v.toLocaleString(); toast('Numbers only (0 or more). Value unchanged.'); return; }
      const capAttr = inp.getAttribute('data-max');
      if (capAttr && v > parseInt(capAttr, 10)) {
        v = parseInt(capAttr, 10);
        toast(`Clamped to hard cap (${v.toLocaleString()})`);
      }
      SAVE.soul[inp.dataset.currency] = v;
      inp.value = v.toLocaleString();
      updateBankCapDisplay(inp.dataset.currency);
    });
  });
  document.querySelectorAll('[data-user-field]').forEach(inp => {
    inp.addEventListener('change', () => {
      SAVE.user[inp.dataset.userField] = parseInt(inp.value, 10) || 0;
    });
  });
  document.querySelectorAll('[data-bank-level]').forEach(inp => {
    inp.addEventListener('change', () => {
      const maxLvl = bankMaxLevel(inp.dataset.bankLevel);
      let lvl = parseInt(inp.value, 10) || 1;
      if (lvl < 1) lvl = 1;
      if (lvl > maxLvl) lvl = maxLvl;
      inp.value = lvl;
      SAVE.soul[inp.dataset.bankLevel] = lvl;
      // the game stores only the level; a *_limit field is written only if the save already has one
      { const lk = inp.dataset.bankLevel.replace('_level', '_limit'); if (lk in SAVE.soul) SAVE.soul[lk] = bankCapacityForLevel(lvl, inp.dataset.bankLevel); }
      updateBankCapDisplay(inp.dataset.bankCapTarget);
    });
  });
  document.querySelectorAll('[data-bank-fill]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cap = bankCapacityForLevel(SAVE.soul[btn.dataset.bankFillLevel] || 1, btn.dataset.bankFillLevel);
      SAVE.soul[btn.dataset.bankFill] = cap;
      renderAll();
      toast(`Filled to ${cap.toLocaleString()} (cap at bank level ${SAVE.soul[btn.dataset.bankFillLevel] || 1})`);
    });
  });
  document.querySelectorAll('[data-bank-max]').forEach(btn => {
    btn.addEventListener('click', () => {
      const maxLvl = bankMaxLevel(btn.dataset.bankMax);
      SAVE.soul[btn.dataset.bankMax] = maxLvl;
      { const lk = btn.dataset.bankMax.replace('_level', '_limit'); if (lk in SAVE.soul) SAVE.soul[lk] = bankCapacityForLevel(maxLvl, btn.dataset.bankMax); }
      SAVE.soul[btn.dataset.bankMaxValue] = bankCapacityForLevel(maxLvl, btn.dataset.bankMax);
      renderAll();
      toast(`Bank maxed to level ${maxLvl}`);
    });
  });
  wireMastery();
}

// updateBankCapDisplay(): refresh just the "cap: N -- OVER CAP" label for one bank without a full
// re-render. valueField is 'free_money' (Kill Coins, level in safe_level) or 'spirit' (SPLithium,
// level in spirit_tank_level).
function updateBankCapDisplay(valueField) {
  const levelField = valueField === 'free_money' ? 'safe_level' : 'spirit_tank_level';
  const level = SAVE.soul[levelField] || 1;
  const cap = bankCapacityForLevel(level, levelField);
  const val = SAVE.soul[valueField] || 0;
  const display = document.querySelector(`[data-bank-cap-display="${valueField}"]`);
  if (display) {
    display.textContent = `cap: ${cap.toLocaleString()}${val > cap ? ' -- OVER CAP' : ''}`;
    display.classList.toggle('over', val > cap);
  }
}

