// The Map Converter page: hands a mod (zip, folder or Thunderstore link) to convert.worker and offers the pack.
import './convert_page.css';
import type { ConvertMessage, ConvertRequest } from './workers/convert.worker.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pick = $('pick'), run = $('run'), done = $('done'), err = $('error');
const bar = $('bar'), what = $('what'), log = $('log'), modName = $('mod-name');
let busy = false;

function fail(msg: string) { err.textContent = msg; err.hidden = false; busy = false; pick.hidden = false; run.hidden = true; }

function start(req: ConvertRequest, name: string) {
  if (busy) return;
  busy = true; err.hidden = true; done.hidden = true; run.hidden = false; pick.hidden = true;
  modName.textContent = name; log.textContent = ''; bar.style.width = '0%';
  const worker = new Worker(new URL('./workers/convert.worker.ts', import.meta.url), { type: 'module' });
  // A browser that runs out of memory kills the worker without any error event; a watchdog turns that silence
  // into a message instead of a page stuck forever. One step of a dense map can legitimately run for minutes.
  let lastMsg = Date.now();
  const STALL_MS = 8 * 60e3;
  const dog = setInterval(() => {
    if (Date.now() - lastMsg < STALL_MS) return;
    clearInterval(dog); worker.terminate();
    fail('The conversion stopped responding: this map is probably too big for the memory a browser tab gets. '
      + 'Try a desktop browser with more free memory, or the command-line converter (skate3-convert), which has no such limit.');
  }, 15e3);
  worker.onmessage = (ev: MessageEvent<ConvertMessage>) => {
    lastMsg = Date.now();
    const m = ev.data;
    if (m.type === 'error' || m.type === 'done') clearInterval(dog);
    if (m.type === 'progress') { bar.style.width = `${Math.round(m.f * 100)}%`; what.textContent = m.what; }
    else if (m.type === 'log') log.textContent += m.line + '\n';
    else if (m.type === 'error') { worker.terminate(); fail(`Conversion failed: ${m.message}`); }
    else {
      worker.terminate(); busy = false; run.hidden = true; done.hidden = false; pick.hidden = false;
      const a = $<HTMLAnchorElement>('download');
      a.href = URL.createObjectURL(m.zip); a.download = m.fileName;
      const ex = (m.summary.export ?? {}) as any, pk = (m.summary.pack ?? {}) as any;
      $('summary').textContent = `${m.contentId}: ${pk.tiles ?? '?'} tiles, ${ex.geometry?.triangles?.toLocaleString() ?? '?'} triangles, `
        + `${pk.splines ?? 0} grind lines, ${ex.textures?.own ?? 0} own textures, ${ex.textures?.fromPack ?? 0} from the CC0 base pack, ${ex.textures?.standins ?? 0} stand-ins, `
        + (ex.basePack ? `${ex.basePack.placed} base props placed (${ex.basePack.missing} not in the pack), ` : '')
        + `${((m.summary.bigBytes as number) / 1e6).toFixed(0)} MB.`;
    }
  };
  worker.onerror = (e) => { clearInterval(dog); worker.terminate(); fail(`Conversion failed: ${e.message}`); };
  worker.postMessage(req);
}

// The CC0 base pack (github.com/andrewnakas/skate-base-cc0-pack, CORS-open on Pages) supplies base-game props and
// textures; ?pack=<url> points elsewhere, ?pack=none turns it off.
const PACK_DEFAULT = 'https://andrewnakas.github.io/skate-base-cc0-pack/';
const packParam = new URLSearchParams(location.search).get('pack');
const PACK = packParam === 'none' ? undefined : packParam ?? PACK_DEFAULT;
const fromZip = (f: File) => start({ kind: 'zip', zip: f, name: f.name, basePackUrl: PACK }, f.name.replace(/\.zip$/i, ''));
function fromFiles(list: { path: string; file: File }[]) {
  if (!list.length) return;
  start({ kind: 'folder', files: list, basePackUrl: PACK }, list[0].path.split('/')[0]);
}

$<HTMLInputElement>('zip-input').onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) fromZip(f); };
$<HTMLInputElement>('dir-input').onchange = (e) => {
  const fs = [...((e.target as HTMLInputElement).files ?? [])];
  fromFiles(fs.map((file) => ({ path: (file as any).webkitRelativePath || file.name, file })));
};

// drag and drop: a zip, or a folder (walked through the entries API)
const drop = $('drop');
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = async (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const items = [...(e.dataTransfer?.items ?? [])];
  const entry = items[0]?.webkitGetAsEntry?.();
  if (entry?.isDirectory) {
    const out: { path: string; file: File }[] = [];
    const walk = async (d: any, prefix: string): Promise<void> => {
      const reader = d.createReader();
      for (;;) {
        const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const x of batch) {
          if (x.isDirectory) await walk(x, `${prefix}${x.name}/`);
          else out.push({ path: `${prefix}${x.name}`, file: await new Promise<File>((res, rej) => x.file(res, rej)) });
        }
      }
    };
    await walk(entry, `${entry.name}/`);
    fromFiles(out);
  } else {
    const f = e.dataTransfer?.files?.[0];
    if (f && /\.zip$/i.test(f.name)) fromZip(f); else fail('Drop a .zip file or a mod folder.');
  }
};

// Thunderstore: thunderstore.io/c/reskate/p/<owner>/<name>/[<version>/] -> skatemods.com/ts-dl, a streaming
// pass-through (a Cloudflare Pages Function in apps/web/functions; Thunderstore itself sends no CORS headers).
// The link can also arrive as ?url=<link> (or ?ts=), which starts the conversion straight away.
const SITE = new URLSearchParams(location.search).get('api') ?? 'https://skatemods.com';
const TS_LINK = /thunderstore\.io\/(?:c\/[^/]+\/)?(?:p|package)\/([A-Za-z0-9_]+)\/([A-Za-z0-9_]+)(?:\/(?:v\/)?(\d+\.\d+\.\d+))?/;
const tsForm = $<HTMLFormElement>('ts-form'), tsInput = $<HTMLInputElement>('ts-url');

async function fromThunderstore(link: string) {
  const m = TS_LINK.exec(link);
  if (!m) return fail('That does not look like a Thunderstore package link (thunderstore.io/c/reskate/p/<author>/<map>/).');
  const [, owner, name, version] = m;
  if (busy) return;
  err.hidden = true; pick.hidden = true; run.hidden = false; done.hidden = true;
  modName.textContent = `${owner}/${name}`; log.textContent = ''; bar.style.width = '0%';
  what.textContent = 'asking Thunderstore';
  try {
    const r = await fetch(`${SITE}/ts-dl/${owner}/${name}${version ? '/' + version : ''}`);
    if (!r.ok || !r.body) {
      const why = await r.json().catch(() => ({} as { error?: string }));
      throw new Error(why.error ?? `HTTP ${r.status}`);
    }
    const ver = r.headers.get('X-Version') ?? version ?? 'latest';
    const total = Number(r.headers.get('Content-Length') ?? 0);
    const parts: Uint8Array[] = []; let got = 0;
    const reader = r.body.getReader();
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      parts.push(value); got += value.length;
      bar.style.width = total ? `${Math.round((got / total) * 15)}%` : '5%';
      what.textContent = `downloading ${(got / 1e6).toFixed(0)}${total ? ` of ${(total / 1e6).toFixed(0)}` : ''} MB`;
    }
    log.textContent += `downloaded ${owner}-${name}-${ver}.zip (${(got / 1e6).toFixed(1)} MB) from Thunderstore\n`;
    run.hidden = true; pick.hidden = false;
    fromZip(new File(parts as BlobPart[], `${owner}-${name}-${ver}.zip`));
  } catch (x) { fail(`Could not fetch ${owner}/${name} from Thunderstore: ${x instanceof Error ? x.message : x}`); }
}

tsForm.onsubmit = (e) => { e.preventDefault(); fromThunderstore(tsInput.value.trim()); };
const linked = new URLSearchParams(location.search).get('url') ?? new URLSearchParams(location.search).get('ts');
if (linked) { tsInput.value = linked; fromThunderstore(linked); }
