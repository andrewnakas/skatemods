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
  worker.onmessage = (ev: MessageEvent<ConvertMessage>) => {
    const m = ev.data;
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
  worker.onerror = (e) => { worker.terminate(); fail(`Conversion failed: ${e.message}`); };
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

// Thunderstore: thunderstore.io/c/reskate/p/<owner>/<name>/[v/<version>/] -> our streaming pass-through
const API = new URLSearchParams(location.search).get('api') ?? 'https://skatemods.com';
// the pass-through lives in skatemods' API worker; until that route is deployed, offer only the zip/folder pickers
const tsForm = document.getElementById('ts-form') as HTMLFormElement;
tsForm.hidden = true;
fetch(`${API}/api/thunderstore/_/_/0.0.0`, { method: 'HEAD' }).then((r) => { tsForm.hidden = r.status === 404; }).catch(() => {});
$<HTMLFormElement>('ts-form').onsubmit = async (e) => {
  e.preventDefault();
  const url = $<HTMLInputElement>('ts-url').value.trim();
  const m = /thunderstore\.io\/(?:c\/[^/]+\/)?(?:p|package)\/([A-Za-z0-9_]+)\/([A-Za-z0-9_]+)(?:\/(?:v\/)?(\d+\.\d+\.\d+))?/.exec(url);
  if (!m) return fail('That does not look like a Thunderstore package link.');
  let [, owner, name, version] = m;
  try {
    if (!version) {
      const r = await fetch(`https://thunderstore.io/api/experimental/package/${owner}/${name}/`);
      if (!r.ok) throw new Error(`Thunderstore says ${r.status}`);
      version = (await r.json()).latest.version_number;
    }
    what.textContent = 'downloading';
    const r = await fetch(`${API}/api/thunderstore/${owner}/${name}/${version}`);
    if (!r.ok) throw new Error(r.status === 429 ? 'too many downloads this hour, try later' : `download failed (${r.status})`);
    fromZip(new File([await r.blob()], `${owner}-${name}-${version}.zip`));
  } catch (x) { fail(`Could not fetch the package: ${x instanceof Error ? x.message : x}`); }
};
