// Runs the built editor in a real, hidden browser (Microsoft Edge, or Chrome), for the tab tests that click the page's
// own buttons. No installs: it uses the browser already on the PC, Node's built-in WebSocket (Node 22+) to talk to it
// over the DevTools protocol, and a small local web server that serves index.html and the test files.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { ROOT } = require('./editor-sandbox');

const BROWSERS = [
  process.env.LID_TEST_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const findBrowser = () => BROWSERS.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Serves index.html at / and each registered file at /f/<n>. Only registered files can be read.
function startServer() {
  const files = [];
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = null;
    if (u === '/' || u === '/index.html') file = path.join(ROOT, 'index.html');
    else { const m = /^\/f\/(\d+)$/.exec(u); if (m && files[Number(m[1])]) file = files[Number(m[1])]; }
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ base, url: f => { let i = files.indexOf(f); if (i < 0) { files.push(f); i = files.length - 1; } return `${base}/f/${i}`; }, close: () => server.close() });
  }));
}

// Starts the browser with a throwaway profile and connects to its page. Returns { evaluate(expr), close() }.
async function startBrowser() {
  if (typeof WebSocket === 'undefined') throw new Error(`The tab tests need Node 22 or newer (this is ${process.version}).`);
  const exe = findBrowser();
  if (!exe) throw new Error('The tab tests need Microsoft Edge or Google Chrome (set LID_TEST_BROWSER to its path if it is somewhere else).');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lid-test-browser-'));
  const proc = spawn(exe, [ '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank' ], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || null; } catch (e) { /* not yet */ }
  }
  if (!port) { proc.kill(); throw new Error(`${path.basename(exe)} didn't start for the tab tests`); }
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("Couldn't connect to the test browser")); });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const n = ++id; waiting.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
  // runs an expression in the page (awaiting a promise) and returns its JSON value; page exceptions become errors
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.error) throw new Error(r.error.message);
    if (r.result.exceptionDetails) { const d = r.result.exceptionDetails; throw new Error((d.exception && d.exception.description || d.text || 'page error').split('\n').slice(0, 3).join(' | ')); }
    return r.result.result.value;
  };
  return {
    evaluate,
    async open(url) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 200; i++) { await sleep(100); try { if (await evaluate("document.readyState === 'complete' && typeof renderAll === 'function'")) return; } catch (e) { /* navigating */ } }
      throw new Error("The editor page didn't load in the test browser");
    },
    async close() {
      try { ws.close(); } catch (e) { /* gone */ }
      proc.kill();
      for (let i = 0; i < 20; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(250); } }
    }
  };
}

// Page-side helpers the tab tests use (run once after the page loads): loading a save the way the file input does,
// switching tabs, the Save check's problems and warnings, and building the download and loading it back.
const PAGE_HELPERS = String.raw`
window.confirm = () => true; window.alert = () => {}; window.prompt = () => '';
window.__T = {
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  plain: h => String(h).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(),
  kindOf(t) { return this.plain(t).replace(/\([^)]*\)/g, '').replace(/[\d,.]+/g, '#').replace(/: .*$/, '').split(' ').slice(0, 14).join(' '); },
  // the Save check's problems and warnings, as "level: kind" -> its own wording
  findings() { const m = new Map(); for (const it of HEALTH.items) if (it.level !== 'note') m.set(it.level + ': ' + this.kindOf(it.text), it.level + ' "' + this.plain(it.text).slice(0, 160) + '"'); return m; },
  firstDiff(a, b, p) {
    p = p || '';
    if (a === b) return '';
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return (p || '(top)') + ': ' + String(JSON.stringify(a)).slice(0, 60) + ' -> ' + String(JSON.stringify(b)).slice(0, 60);
    for (const k of new Set([ ...Object.keys(a), ...Object.keys(b) ])) { const d = this.firstDiff(a[k], b[k], p + '.' + k); if (d) return d; }
    return '';
  },
  tidy() { document.querySelectorAll('#review-overlay, #ui-overlay').forEach(x => x.remove()); try { uiTourEnd(true); } catch (e) {} },
  async loadBytes(bytes, name, inputId) {
    const before = RAW_SAV_ROOT, isMasters = inputId === 'file-masters', inp = document.getElementById(inputId || 'file-save');
    const dt = new DataTransfer(); dt.items.add(new File([ bytes ], name)); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    for (let i = 0; i < 600; i++) { await this.sleep(25); if (isMasters ? AP : RAW_SAV_ROOT !== before) break; }
    await this.sleep(60); this.tidy();
    return isMasters ? !!AP : !!RAW_SAV_ROOT && RAW_SAV_ROOT !== before;
  },
  async loadUrl(url, name, inputId) { return this.loadBytes(new Uint8Array(await (await fetch(url)).arrayBuffer()), name, inputId); },
  go(tab) { activeTab = tab; renderAll(); this.tidy(); },
  // builds the download, writes and reads back the .sav, and loads it as the edited save
  async buildReload() {
    const built = JSON.parse(JSON.stringify(buildDownloadRoot()));
    const bytes = new Uint8Array(await buildBrgSav(built));
    const d = this.firstDiff(built, await parseBrgSav(bytes));
    if (d) return 'the .sav read back differently: ' + d;
    if (!await this.loadBytes(bytes, 'edited.sav')) return 'the edited save did not load';
    return '';
  },
  // runs every scenario in window.__S on one save; returns [{ name, label, status, error }]
  async runAll(url, name) {
    const out = [];
    for (const s of window.__S) {
      let label = '';
      try {
        if (!await this.loadUrl(url, name)) return out;
        this.go(s.tab);
        if (!s.applies()) continue;
        const before = this.findings();
        const p0 = s.probe ? JSON.stringify(s.probe()) : null;
        const ctx = (await s.apply()) || {};
        label = ctx.label || '';
        if (ctx.skip) { out.push({ name: s.name, label, status: 'skip', error: ctx.skip }); continue; }
        const p1 = s.probe && !ctx.pending ? JSON.stringify(s.probe()) : null;
        if (p1 !== null && p1 === p0) { out.push({ name: s.name, label, status: 'skip', error: 'the edit changed nothing on this save' }); continue; }
        let err = await this.buildReload();
        if (!err) {
          this.go(s.tab);
          if (p1 !== null) { const p2 = JSON.stringify(s.probe()); if (p2 !== p1) err = 'the download changed it: ' + this.firstDiff(JSON.parse(p1), JSON.parse(p2)); }
          if (!err && s.check) err = s.check(ctx) || '';
          if (!err) { const now = this.findings(); const added = [ ...now.keys() ].filter(k => !before.has(k) && !(ctx.allow && now.get(k).includes(ctx.allow))); if (added.length) err = 'new Save check ' + now.get(added[0]); }
        }
        out.push({ name: s.name, label, status: err ? 'fail' : 'ok', error: err });
      } catch (e) { out.push({ name: s.name, label, status: 'fail', error: 'crashed: ' + String(e && e.stack || e).split('\n').slice(0, 2).join(' | ') }); }
    }
    return out;
  }
};
true`;

module.exports = { startBrowser, startServer, findBrowser, PAGE_HELPERS };
