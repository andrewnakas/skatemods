// DEV: node test/dev/browser_convert.mjs <page url> <mod.zip> [browser exe]
// Drives the Map Converter page in a headless Chromium over CDP: picks the zip, waits for the pack, and prints the
// sha256 of the .big and .header inside the downloaded zip (compare with the CLI's output).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, zip = '-', exe = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), 'cv-browser-'));
const port = 9300 + Math.floor(Math.random() * 500);
const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const waiters = new Map(); const events = [];
try {
  let tabs;
  for (let i = 0; i < 50 && !tabs; i++) { await sleep(200); tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null); }
  const page = tabs.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && waiters.has(d.id)) { waiters.get(d.id)(d); waiters.delete(d.id); } else events.push(d); });
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await cmd('Runtime.enable'); await cmd('DOM.enable'); await cmd('Page.enable'); await cmd('Log.enable');
  await cmd('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await cmd('Page.navigate', { url });
  for (let i = 0; i < 100 && (await ev('!!document.getElementById("zip-input")')) !== true; i++) await sleep(200);
  if (zip !== '-') {                                   // '-' = no file: the page starts by itself (?url=...)
  const doc = await cmd('DOM.getDocument');
  const q = await cmd('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#zip-input' });
  await cmd('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [zip] });
  await sleep(500);
  const state = await ev(`JSON.stringify({ files: document.getElementById('zip-input').files.length, runHidden: document.getElementById('run').hidden })`);
  console.log('after pick', state);
  if (JSON.parse(state).runHidden) await ev(`document.getElementById('zip-input').dispatchEvent(new Event('change')), 1`);
  }
  const t0 = Date.now();
  for (;;) {
    await sleep(2000);
    const s = await ev(`JSON.stringify({ done: !document.getElementById('done').hidden, err: document.getElementById('error').hidden ? '' : document.getElementById('error').textContent, what: document.getElementById('what').textContent, bar: document.getElementById('bar').style.width })`);
    const st = JSON.parse(s ?? '{}');
    if (st.err) { console.log('ERROR', st.err); process.exitCode = 1; break; }
    if (st.done) break;
    for (const e of events.splice(0)) {
      if (e.method === 'Runtime.consoleAPICalled') console.log('  console:', e.params.type, e.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
      else if (e.method === 'Runtime.exceptionThrown') console.log('  EXCEPTION:', (e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text).slice(0, 400));
      else if (e.method === 'Log.entryAdded') console.log('  log:', e.params.entry.level, e.params.entry.text.slice(0, 300), e.params.entry.url ?? '');
      else if (e.method === 'Target.attachedToTarget') console.log('  target:', e.params.targetInfo.type, e.params.targetInfo.url);
    }
    if ((Date.now() - t0) % 30000 < 2000) console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${st.bar} ${st.what}`);
    if (Date.now() - t0 > Number(process.env.TIMEOUT_MIN ?? 30) * 60e3) { console.log("timeout"); process.exitCode = 1; break; }
  }
  if (!process.exitCode) {
    const out = await ev(`(async () => {
      const b = await (await fetch(document.getElementById('download').href)).blob();
      const u8 = new Uint8Array(await b.arrayBuffer()); const dv = new DataView(u8.buffer);
      const res = {}; let p = 0;
      while (dv.getUint32(p, true) === 0x04034b50) {
        const size = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true);
        const name = new TextDecoder().decode(u8.subarray(p + 30, p + 30 + nl)); const start = p + 30 + nl;
        const h = new Uint8Array(await crypto.subtle.digest('SHA-256', u8.subarray(start, start + size)));
        res[name] = [...h].map((x) => x.toString(16).padStart(2, '0')).join(''); p = start + size;
      }
      return JSON.stringify({ zipBytes: u8.length, summary: document.getElementById('summary').textContent, files: res });
    })()`);
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    console.log(out);
  }
  const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
  if (errs.length) console.log('page exceptions:', errs.slice(0, 3));
} finally {
  ws?.close(); br.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
