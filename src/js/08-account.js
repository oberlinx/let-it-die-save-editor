// ==== Account tab: currency and banks ====
//
// bankRow(): HTML for one "bank-limited" currency row (Kill Coins / SPLithium).
// soul[levelField] is the bank level (safe_level or spirit_tank_level; the game stores only the
// level), soul[valueField] the held amount (free_money or spirit). The capacity for a level comes
// from bankCapacityForLevel(); amounts above it are flagged "OVER CAP" (the game would clamp).
// `kind` is unused here. Returns an HTML string.
function bankRow(soul, kind, label, levelField, valueField) {
  // missing fields fall back to level 1 / amount 0 so a fresh or partial save still draws a valid row
  const level = soul[levelField] != null ? soul[levelField] : 1;
  const maxLvl = bankMaxLevel(levelField);
  const cap = bankCapacityForLevel(level, levelField);
  const val = soul[valueField] != null ? soul[valueField] : 0;
  // over-cap is shown as a warning rather than silently fixed, so the user decides whether to keep the value
  const over = val > cap;
  return `<div class="bankRow">\n    <div class="bankLabel">${accountIcon(label, 28)}${label}</div>\n    <div class="field"><label>Bank Level</label><select data-bank-level="${levelField}" data-bank-cap-target="${valueField}" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);">${fighterOpts(1, maxLvl, Number(level), v => 'Level ' + v)}</select></div>\n    <div class="field"><label>Held Amount</label><input type="text" inputmode="numeric" data-currency="${valueField}" value="${val.toLocaleString()}"></div>\n    <div class="bankCap ${over ? 'over' : ''}" data-bank-cap-display="${valueField}">cap: ${cap.toLocaleString()}${over ? ' -- OVER CAP' : ''}</div>\n    <div style="display:flex; gap:6px; white-space:nowrap;"><button class="subtle" data-bank-fill="${valueField}" data-bank-fill-level="${levelField}" title="Fill to this bank level's cap without changing the level">Fill to cap</button>\n    <button class="subtle" data-bank-max="${levelField}" data-bank-max-value="${valueField}" title="Max the bank level and fill it">Max level + fill</button></div>\n  </div>`;
}

// tdmRankIcon(): the medal for a Tokyo Death Metro rank row (master_tdm_rank.group is BRONZE .. DIAMOND), h pixels tall;
// '' when the group is unknown.
function tdmRankIcon(rank, h) {
  const i = [ 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND' ].indexOf(String(rank && rank.group || '').toUpperCase());
  if (i < 0) return '';
  const w = Math.round(h * 54 / 60);
  return `<span class="gicon s-tdm" style="width:${w}px; height:${h}px; background-size:${w * 5}px ${h}px; background-position:-${i * w}px 0;"></span>`;
}
// The Steam and PlayStation marks, as 24x24 SVG path data from Simple Icons (simpleicons.org, CC0). They are their
// owners' trademarks and are used only to say which platform a save is from.
const PLATFORM_LOGO = {
  steam: 'M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z',
  playstation: 'M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z'
};
// platformLogo(): inline SVG of one of the marks above, px pixels square, in the text colour.
const platformLogo = (name, px) => `<svg viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true" style="vertical-align:-2px; margin-right:5px; fill:currentColor;"><path d="${PLATFORM_LOGO[name]}"/></svg>`;
// accountPlatform(): what the account id is and a badge for it, from the platform the save was made on
// (savePlatform: a 17-digit Steam id means PC, any other id means PlayStation).
function accountPlatform() {
  const p = savePlatform(RAW_SAV_ROOT);
  if (p === 'PC') return { idLabel: 'Steam ID, read only', badge: `<span class="platBadge" title="This save is from the Steam (PC) game">${platformLogo('steam', 13)}Steam</span>` };
  if (p === 'PS') return { idLabel: 'PSN ID, read only', badge: `<span class="platBadge" title="This save is from a PlayStation console">${platformLogo('playstation', 13)}PlayStation</span>` };
  return { idLabel: 'read only', badge: '' };
}
// accountIcon(): the game's icon for a currency shown on the Account tab, by its label ('' if it has none).
function accountIcon(label, h) {
  if (label === 'Recycle Points') return `<span class="gicon s-recycle" style="width:${Math.round(h * 22 / 28)}px; height:${h}px;"></span>`;
  const name = { 'Kill Coins': 'Money_1', 'SPLithium': 'Spirit_1', 'Bloodnium': 'Blood_1' }[label];
  return name ? iconSpan(name, h) : '';
}
// blockCurrency(): the Account tab: read-only account id/name, TDM points (rank is derived from
// the points via tdmRankForPoints), the two bank rows, the remaining plain currencies from
// currencyFields() (each with an optional hard cap in data-max), and the mastery block.
// Returns an HTML string.
function blockCurrency() {
  const soul = SAVE.soul;
  // rank comes from masters.db thresholds, so it is shown read-only: editing points is the only way to change it
  const rank = tdmRankForPoints(soul.tdm_point || 0, AP);
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Account</div><h2>Account Details</h2></div></div>\n    <div class="block-body">\n      <div class="grid" style="margin-bottom:14px;">\n        <div class="field"><label>Account ID <span class="id">(${accountPlatform().idLabel})</span></label><div id="acc-psnacid" style="padding:8px 0; font-size:14px; word-break:break-all;">${escapeHtml(SAVE.user.psnacid != null && SAVE.user.psnacid !== '' ? String(SAVE.user.psnacid) : '—')}${accountPlatform().badge}</div></div>\n        <div class="field"><label>Account Name <span class="id">(read only)</span></label><div id="acc-name" style="padding:8px 0; font-size:14px; word-break:break-all;"><b>${escapeHtml(SAVE.user.nm != null && SAVE.user.nm !== '' ? String(SAVE.user.nm) : '—')}</b></div></div>\n        <div class="field"><label>TDM Points</label><input type="number" id="tdm-point" min="0" max="${tdmPointMax()}" step="1" value="${soul.tdm_point || 0}"></div>\n        <div class="field"><label>TDM Rank <span class="id">(from the points)</span></label><div style="padding:4px 0; font-size:14px; word-break:break-all;">${tdmRankIcon(rank, 32)}${escapeHtml(rank ? formatTdmRank(resolveName(rank.name)) || rank.id : soul.tdm_rank || '?')}</div></div>\n      </div>\n      <div class="eyebrow" style="margin-bottom:8px;">Bank-limited currencies</div>\n      <div class="bankTable">\n        ${bankRow(soul, 'money', 'Kill Coins', 'safe_level', 'free_money')}\n        ${bankRow(soul, 'spirit', 'SPLithium', 'spirit_tank_level', 'spirit')}\n      </div>\n      <div class="grid">\n        ${currencyFields().map(([f, label, cap]) => `\n          <div class="field">\n            <label style="white-space:nowrap;">${accountIcon(label, 22)}${label}${cap ? ` (max ${cap.toLocaleString()})` : ''}</label>\n            <input type="text" inputmode="numeric" data-currency="${f}" ${cap ? `data-max="${cap}"` : ''} value="${(soul[f] != null ? soul[f] : 0).toLocaleString()}">${f === 'recycle_point' ? `<div class="capNote" style="margin:4px 0 0;">In game, anything earned over the max is lost.</div>` : ''}\n          </div>`).join('')}\n      </div>\n      ${masteryBlockHtml()}\n    </div>\n  </section>`;
}

// wireCurrency(): listeners for the Account tab.
// - TDM points: clamped to the top rank's max, then soul.tdm_rank is updated from the points.
// - [data-currency] text inputs: digits only (commas stripped), clamped to data-max if present.
// - bank level selects: write the level, and also a *_limit field but only if the save already has one.
// - Fill-to-cap / Max-level buttons: set the held amount to the bank capacity.
function wireCurrency() {
  // TDM points are the source of truth; the rank id is re-derived from them
  document.getElementById('tdm-point').addEventListener('change', e => {
    // clamp to the top rank's points so a typo cannot push the value past anything the game's rank table covers
    { const mx = tdmPointMax(); let v = parseInt(e.target.value, 10); if (isNaN(v) || v < 0) v = 0; if (v > mx) { v = mx; toast(`Clamped to the top rank (${mx.toLocaleString()})`); } SAVE.soul.tdm_point = v; }
    const rank = tdmRankForPoints(SAVE.soul.tdm_point, AP);
    if (rank) SAVE.soul.tdm_rank = rank.id;
    renderAll();
  });
  document.querySelectorAll('[data-currency]').forEach(inp => {
    inp.addEventListener('change', () => {
      // the field shows thousands separators (toLocaleString), so strip them before validating
      const txt = inp.value.replace(/[,\s]/g, '');
      let v = /^\d+$/.test(txt) ? parseInt(txt, 10) : NaN;
      // on bad input restore the stored value instead of writing NaN or a negative into the save
      if (isNaN(v)) { v = Number(SAVE.soul[inp.dataset.currency]) || 0; inp.value = v.toLocaleString(); toast('Numbers only (0 or more). Value unchanged.'); return; }
      // data-max is the hard cap for this currency; the game loses anything above it, so do not store more
      const capAttr = inp.getAttribute('data-max');
      if (capAttr && v > parseInt(capAttr, 10)) {
        v = parseInt(capAttr, 10);
        toast(`Clamped to hard cap (${v.toLocaleString()})`);
      }
      SAVE.soul[inp.dataset.currency] = v;
      inp.value = v.toLocaleString();
      // only the cap label is refreshed (no renderAll) so the user keeps focus while typing in other fields
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
      // clamp to the levels the game knows, so a level with no capacity entry is never written
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
      // fills to the cap of the CURRENT level, never above it, so the value stays inside what the game allows
      const cap = bankCapacityForLevel(SAVE.soul[btn.dataset.bankFillLevel] || 1, btn.dataset.bankFillLevel);
      SAVE.soul[btn.dataset.bankFill] = cap;
      renderAll();
      toast(`Filled to ${cap.toLocaleString()} (cap at bank level ${SAVE.soul[btn.dataset.bankFillLevel] || 1})`);
    });
  });
  document.querySelectorAll('[data-bank-max]').forEach(btn => {
    btn.addEventListener('click', () => {
      // level, optional *_limit and held amount are all set together so they stay consistent with each other
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
  // the label only knows its value field, so map back to the level field that sets its capacity
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

