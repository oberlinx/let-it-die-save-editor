// ==== VIP Express Pass (soul.vip) ====
// soul.vip: flag 1 = member. type 1 = 1-Day Express, type 0 = 30-Day Express (a save with type 0
// still had 12 days left; the type-1 save auto-renews with only 1-Day passes). user.vip_level = type.
// Plan choices offered in the UI; ids map to vip_flag/vip_type via vipPlanOf()/setVipPlan().
const VIP_PLANS = [ { id: 'none', label: 'None' }, { id: 'day', label: '1-Day Express' }, { id: 'month', label: '30-Day Express' } ];
// Derives the plan id ('none' | 'day' | 'month') from a soul.vip object.
function vipPlanOf(v) { return !v || !Number(v.vip_flag) ? 'none' : Number(v.vip_type) === 1 ? 'day' : 'month'; }
// Applies a plan to SAVE.soul.vip: sets vip_flag/vip_type/expired_time/automatic_renewal and keeps
// user.vip_level in step when it matched the old type. 'restart' forces a fresh expiry even if
// the old one is still in the future (used when the type changes).
function setVipPlan(plan, restart) {
  const v = SAVE.soul.vip, now = Math.floor(Date.now() / 1e3), oldType = v.vip_type;
  if (plan === 'none') {
    // off: keep the type the save had, so turning it back on returns to the same pass
    v.vip_flag = 0; v.automatic_renewal = 0;
    if (Number(v.expired_time) > now) v.expired_time = now;
  } else {
    v.vip_flag = 1; v.vip_type = plan === 'day' ? 1 : 0;
    // a new pass (type changed) starts its own length; turning an existing pass back on keeps a future expiry
    if (restart || !(Number(v.expired_time) > now)) v.expired_time = now + (plan === 'day' ? 86400 : 30 * 86400);
  }
  // user.vip_level usually equals the type, but not always (an unedited PS save had type 1, level 0):
  // only follow the type when it matched before
  if (SAVE.user && Number(SAVE.user.vip_level) === Number(oldType)) SAVE.user.vip_level = v.vip_type;
}

// ---------------------------------------------------------------------------
// Free continues. soul.free_continue_max_count (per day) and soul.free_continue_count (left today) feed the
// game's own message "You can continue for FREE #0 times a day! (#1 left.)" (TXT_CONTINUE_CONTENTS_MT); the
// live game's events used 3-4 a day. No master_const limits them; the editor caps them at 9,999.
// Confirmed in game: with 9,999 / 9,999 written, one free continue left the save at 9,999 per day, 9,998 left,
// so the counter is continues LEFT and the game keeps edited values. They only last until the game's daily
// reset (first login of a new day, keyed on user.last_login_date): the offline game sets them back to 0 then,
// as no event is running. Holding the reset off would mean a future last_login_date, which the Dates tab
// treats as damage, so the editor doesn't. The values are written at download.
// ---------------------------------------------------------------------------
// Max value the editor allows for free continues.
const FREE_CONT_MAX = 9999;
// Pending free-continue edit: tied to a loaded save via root; "on" = write at download; perDay = value.
let FREE_CONT = { root: null, on: false, perDay: 3 };
// Resets FREE_CONT when a different save has been loaded.
function fcSync() { if (FREE_CONT.root !== RAW_SAV_ROOT) FREE_CONT = { root: RAW_SAV_ROOT, on: false, perDay: 3 }; }
// Floors/clamps a value to an integer in [0, FREE_CONT_MAX]; non-numbers become 0.
function fcClamp(v) { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(0, Math.min(FREE_CONT_MAX, v)) : 0; }
// all of today's free continues are left
// Values written at download: both max-per-day and "left today" set to the same number.
function fcValues() { const n = fcClamp(FREE_CONT.perDay); return { max: n, count: n }; }
// force_shutdown_counts {cid: n} (top level of the save): the game adds 1 for the fighter in a run each
// time the game is closed or crashes without pausing (soul.pause then reads e.g. HEAVEN_CRASH). From
// FORCE_SHUTDOWN_BLOODNIUM_PENALTY_COUNT (3) the run's Bloodnium gets FORCE_SHUTDOWN_BLOODNIUM_PENALTY_RATE
// (-100), from ..._LARGE_PENALTY_COUNT (10) the large rate (-500). The save check can reset a count to 0.
// Fighters (cids) whose force_shutdown_counts entry should be zeroed at download (set elsewhere in the UI).
const SHUTDOWN_RESET = { root: null, cids: new Set() };
// Reads an integer from the loaded masters.db constants table (AP.constInt) by id; d is the fallback.
function constIntOf(id, d) { const r = arr(AP && AP.constInt).find(x => x.id === id); return r ? Number(r.value) : d; }
// Returns root.force_shutdown_counts if it is a plain object (not an array), else an empty object.
function shutdownCounts(root) { const f = root && root.force_shutdown_counts; return f && typeof f === 'object' && !Array.isArray(f) ? f : {}; }
// Download-time hook: zero the selected cids' shutdown counts in the built root. Mutates and returns root.
function applyShutdownReset(root) {
  if (SHUTDOWN_RESET.root !== RAW_SAV_ROOT || !root) return root;
  const f = shutdownCounts(root);
  for (const cid of SHUTDOWN_RESET.cids) if (cid in f) f[cid] = 0;
  return root;
}
// Download-time hook: if enabled for this save, write soul.free_continue_max_count and
// soul.free_continue_count. Mutates and returns root.
function applyFreeCont(root) {
  if (FREE_CONT.root !== RAW_SAV_ROOT || !FREE_CONT.on || !root || !root.soul) return root;
  const v = fcValues();
  root.soul.free_continue_max_count = v.max;
  root.soul.free_continue_count = v.count;
  return root;
}
// Block shell for Free Continues; the inner HTML lives in #fc-host so it can be re-rendered in place.
function blockFreeCont() { return `<div id="fc-host">${fcInner()}</div>`; }
// Builds the Free Continues section HTML (current saved values, enable checkbox, per-day input, preview).
function fcInner() {
  fcSync();
  const s = (RAW_SAV_ROOT && RAW_SAV_ROOT.soul) || {};
  const has = 'free_continue_max_count' in s || 'free_continue_count' in s;
  const inp = 'background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);';
  const v = fcValues();
  return `<section class="block">
    <div class="block-head"><div><div class="eyebrow">Continue Insurance</div><h2>Free Continues</h2></div></div>
    <div class="block-body">
      <div class="capNote" style="margin-top:0;">The game's continue screen offers free continues ("You can continue for FREE # times a day! (# left.)"); this sets how many, all available today. Confirmed in game. They last until the game's daily reset: on the first login of a new day the game sets them back to 0, so set them again each day.</div>
      <div class="capNote" style="margin-top:0;">In this save: ${(Number(s.free_continue_max_count) || 0).toLocaleString()} per day, ${(Number(s.free_continue_count) || 0).toLocaleString()} left today.${has ? '' : ' (The save has no free-continue fields; they will be added.)'}</div>
      <label style="cursor:pointer; display:block; margin:6px 0;"><input type="checkbox" id="fc-on" ${FREE_CONT.on ? 'checked' : ''} style="width:auto; margin-right:6px;">Change free continues on download</label>
      <div class="grid" style="${FREE_CONT.on ? '' : 'opacity:.5; pointer-events:none;'}">
        <div class="field"><label>Free continues per day</label><div style="display:flex; gap:6px;"><input type="number" id="fc-per-day" min="0" max="${FREE_CONT_MAX}" value="${fcClamp(FREE_CONT.perDay)}" style="${inp} width:100%;"><button class="subtle" id="fc-max" title="The highest value the editor allows">Max</button></div></div>
      </div>
      ${FREE_CONT.on ? `<div class="capNote">On download: <b>${v.max.toLocaleString()}</b> free continues per day, <b>${v.count.toLocaleString()}</b> left today (up to ${FREE_CONT_MAX.toLocaleString()}).</div>` : ''}
    </div>
  </section>`;
}
// Wires the Free Continues controls; re-renders #fc-host after each change and re-wires itself.
function wireFreeCont() {
  const on = document.getElementById('fc-on');
  if (!on) return;
  // rebuilt after the event, so a number box losing focus while it's replaced can't rebuild it twice
  const rerender = () => setTimeout(() => { const host = document.getElementById('fc-host'); if (host) { host.innerHTML = fcInner(); wireFreeCont(); } }, 0);
  on.addEventListener('change', () => { FREE_CONT.on = on.checked; rerender(); toast(on.checked ? 'Free continues will be set on download' : 'Free continues left as they are'); });
  const pd = document.getElementById('fc-per-day');
  pd.addEventListener('change', () => { const v = fcClamp(pd.value); if (String(v) !== String(pd.value)) toast(`Clamped to ${v.toLocaleString()} (0 to ${FREE_CONT_MAX.toLocaleString()})`); if (v === fcClamp(FREE_CONT.perDay) && String(v) === String(pd.value)) return; FREE_CONT.perDay = v; rerender(); });
  document.getElementById('fc-max').addEventListener('click', () => { FREE_CONT.perDay = FREE_CONT_MAX; rerender(); });
}

// Builds the VIP Express Pass block (on/off, type, pass counts, expiry date, auto-renew, renew button).
// Inputs tagged data-vip edit soul.vip fields directly.
function blockVip() {
  const vip = SAVE.soul.vip;
  const expiresDate = vip.expired_time ? new Date(vip.expired_time * 1e3) : null;
  const expiresStr = expiresDate ? `${expiresDate.getMonth() + 1}/${expiresDate.getDate()}/${expiresDate.getFullYear()}` : '';
  return `<section class="block">\n    <div class="block-head"><div><div class="eyebrow">Direct Hell Insurance</div><h2>VIP Express Pass</h2></div></div>\n    <div class="block-body">\n      <div class="grid">\n        <div class="field"><label>Express Pass</label><select id="vip-active" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);"><option value="1" ${Number(vip.vip_flag) ? 'selected' : ''}>On</option><option value="0" ${Number(vip.vip_flag) ? '' : 'selected'}>Off</option></select></div>\n        <div class="field"><label>Type${Number(vip.vip_flag) ? '' : ' <span class="id">(turn the pass on first)</span>'}</label><select id="vip-plan" ${Number(vip.vip_flag) ? '' : 'disabled'} style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);${Number(vip.vip_flag) ? '' : ' opacity:.4;'}"><option value="day" ${Number(vip.vip_type) === 1 ? 'selected' : ''}>1-Day Express</option><option value="month" ${Number(vip.vip_type) === 1 ? '' : 'selected'}>30-Day Express</option></select></div>\n        <div class="field"><label>30-Day Passes held</label><input type="number" data-vip="vip_pass_num" value="${vip.vip_pass_num || 0}"></div>\n        <div class="field"><label>1-Day Passes held</label><input type="number" data-vip="oneday_vip_pass_num" value="${vip.oneday_vip_pass_num || 0}"></div>\n        <div class="field"><label>Expires</label><input type="date" id="vip-expires-date" value="${expiresDate ? `${expiresDate.getFullYear()}-${String(expiresDate.getMonth() + 1).padStart(2, '0')}-${String(expiresDate.getDate()).padStart(2, '0')}` : ''}" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono); color-scheme:dark;"></div>\n        <div class="field"><label>Auto-renew</label><select data-vip="automatic_renewal" style="width:100%; background:var(--bg); border:1px solid var(--panel-border); color:var(--text); padding:7px 8px; font-family:var(--mono);"><option value="1" ${vip.automatic_renewal ? 'selected' : ''}>On</option><option value="0" ${vip.automatic_renewal ? '' : 'selected'}>Off</option></select></div>\n      </div>\n      <div class="toolbar" style="margin-top:10px;"><button class="subtle" id="vip-renew" ${vipPlanOf(vip) === 'none' ? 'disabled style="opacity:.35;"' : ''}>Renew: expires ${vipPlanOf(vip) === 'day' ? '24 hours' : '30 days'} from now</button></div>\n      <div class="capNote">Off = not a member (the type box is locked until it's on). 1-Day Express lasts 24 hours, 30-Day Express lasts 30 days; auto-renew uses your held passes of that kind when it runs out. (In the save: type 1 = 1-Day, type 0 = 30-Day, worked out from saves.)</div>\n    </div>\n  </section>`;
}

// Wires the VIP block. Number inputs are clamped to 0..99999; plan changes go through setVipPlan()
// and re-render all tabs; the date picker keeps the existing time of day and limits years to 2020..2037.
function wireVip() {
  document.querySelectorAll('[data-vip]').forEach(inp => {
    inp.addEventListener('change', () => {
      { let v = parseInt(inp.value, 10); if (!(v >= 0)) v = 0; v = Math.min(v, 99999); inp.value = v; SAVE.soul.vip[inp.dataset.vip] = v; }
    });
  });
  // soul.vip.type: 1 = 30-day Express Pass (the user's active membership),
  // 0 = 1-Day Express / none (fresh game) -- inferred from saves, not named in
  // the game data. user.vip_level has matched the type in every save seen, so
  // it's kept in step when it currently matches.
  document.getElementById('vip-active').addEventListener('change', e => {
    const on = e.target.value === '1';
    setVipPlan(on ? (Number(SAVE.soul.vip.vip_type) === 1 ? 'day' : 'month') : 'none');
    renderAll();
    toast(on ? `Express Pass on (${Number(SAVE.soul.vip.vip_type) === 1 ? '1-Day' : '30-Day'} Express), expires ${dtFmt(SAVE.soul.vip.expired_time)}` : 'Express Pass off');
  });
  document.getElementById('vip-plan').addEventListener('change', e => {
    setVipPlan(e.target.value, true);
    renderAll();
    toast(e.target.value === 'none' ? 'Express Pass: none' : `Express Pass: ${e.target.value === 'day' ? '1-Day' : '30-Day'} Express, expires ${dtFmt(SAVE.soul.vip.expired_time)}`);
  });
  document.getElementById('vip-expires-date').addEventListener('change', e => {
    const m = e.target.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) { renderAll(); return; }
    // keep the time of day the save already had, only the date changes
    const old = SAVE.soul.vip.expired_time ? new Date(SAVE.soul.vip.expired_time * 1e3) : null;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), old ? old.getHours() : 0, old ? old.getMinutes() : 0, old ? old.getSeconds() : 0);
    if (d.getFullYear() < 2020) { toast('Pick a date from 2020 on', true); renderAll(); return; }
    if (d.getFullYear() > 2037) { toast('Pick a date before 2038 (the game can\'t store later dates)', true); renderAll(); return; }
    SAVE.soul.vip.expired_time = Math.floor(d.getTime() / 1e3);
    toast(`Expiry set to ${d.toLocaleDateString()}`);
  });
  document.getElementById('vip-renew').addEventListener('click', () => {
    const plan = vipPlanOf(SAVE.soul.vip);
    if (plan === 'none') return;
    SAVE.soul.vip.expired_time = Math.floor(Date.now() / 1e3) + (plan === 'day' ? 86400 : 30 * 86400);
    renderAll();
    toast(`Express Pass expires ${dtFmt(SAVE.soul.vip.expired_time)}`);
  });
}

