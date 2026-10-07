import './style.css';
import type { CollisionMode, MapIR, SurfaceId } from './ir';
import { triangleCount } from './ir';
import { Viewport, type Tool } from './editor/viewport';
import type { ViewMode } from './three/fromIR';
import { ACCEPT, importFiles, type InputFile } from './import';
import { COLLISION_MODES, SURFACES } from './surfaces';
import { TARGETS, type Target } from './export';
import { exportInWorker } from './export/worker-client';
import { runChecks, autoSpawn, type CheckResult } from './check';
import { applyToMap, recentre, scaleMatrix, Z_UP_TO_Y_UP, bounds } from './transform';
import { autosave, clearAutosave, loadAutosave, loadProject, saveProject } from './project';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmt = (n: number) => n.toLocaleString('en-US');
const r2 = (n: number) => Math.round(n * 100) / 100;

let map: MapIR | null = null;
let checkResults: CheckResult[] = [];
const selectedTargets = new Set<Target>(loadTargets());

const view = new Viewport($('canvas'));
view.onStatus = setStatus;
view.onChange = what => {
  if (what === 'map') { renderSpawns(); renderRails(); scheduleAutosave(); }
  renderInspector();
  highlightLists();
};

// ---------- theme ----------
function applyTheme(t: string | null) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  view.setDark(dark);
  $('theme-btn').textContent = dark ? 'Light' : 'Dark';
}
try { applyTheme(localStorage.getItem('studio-theme')); } catch { applyTheme(null); }
$('theme-btn').onclick = () => {
  const dark = $('theme-btn').textContent === 'Dark';
  const t = dark ? 'dark' : 'light';
  try { localStorage.setItem('studio-theme', t); } catch { /* ignore */ }
  applyTheme(t);
};

// ---------- loading ----------
function setStatus(text: string) { $('status').textContent = text; }

function busy(text: string | null) {
  $('busy').hidden = text === null;
  if (text) $('busy-text').textContent = text;
}

async function readFiles(list: FileList | File[]): Promise<InputFile[]> {
  return Promise.all([...list].map(async f => ({
    path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    bytes: new Uint8Array(await f.arrayBuffer()),
  })));
}

/** Reads a dropped folder tree (DataTransferItem entries). */
async function readDrop(dt: DataTransfer): Promise<InputFile[]> {
  const entries = [...dt.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!entries.some(e => e.isDirectory)) return readFiles(dt.files);
  const out: InputFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ path: prefix + file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e, prefix + entry.name + '/');
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

async function open(files: InputFile[]) {
  if (!files.length) return;
  if (files.length === 1 && files[0].path.toLowerCase().endsWith('.skmproj')) {
    return setMap(loadProject(files[0].bytes), 'Project opened.');
  }
  busy('Reading files');
  try {
    const result = await importFiles(files, t => busy(t));
    const notes: string[] = [];
    if (result.missingImages?.length) notes.push(`${result.missingImages.length} images were not packed in the .blend: ${result.missingImages.slice(0, 4).join(', ')}${result.missingImages.length > 4 ? '…' : ''}. Drop them in with the .blend, or use File > External Data > Pack Resources in Blender.`);
    if (result.axisUnknown) notes.push('OBJ, STL and PLY files have no up axis. If the map is lying on its side, use "Z up to Y up" under Map.');
    await setMap(result.map, notes.join(' ') || `Opened ${result.map.name}.`);
  } catch (err) {
    console.error(err);
    setStatus(`Could not open that: ${err instanceof Error ? err.message : err}`);
  } finally { busy(null); }
}

async function setMap(next: MapIR, status: string) {
  map = next;
  checkResults = [];
  $('drop').classList.add('hidden');
  ($('save-btn') as HTMLButtonElement).disabled = false;
  for (const id of ['objects-section', 'spawns-section', 'rails-section', 'check-section', 'export-section']) $(id).hidden = false;
  busy('Building the view');
  await view.setMap(map);
  busy(null);
  view.setMarkers([]);
  renderAll();
  setStatus(status);
  scheduleAutosave();
}

const input = $('file-input') as HTMLInputElement;
input.accept = ACCEPT + ',.skmproj';
$('open-btn').onclick = $('pick-btn').onclick = () => input.click();
input.onchange = async () => { if (input.files?.length) await open(await readFiles(input.files)); input.value = ''; };

const canvas = $('canvas');
for (const el of [canvas, $('drop')]) {
  el.addEventListener('dragover', e => { e.preventDefault(); canvas.classList.toggle('over', !!map); $('drop').classList.add('over'); });
  el.addEventListener('dragleave', e => { if (e.target === el) { canvas.classList.remove('over'); $('drop').classList.remove('over'); } });
  el.addEventListener('drop', async e => {
    e.preventDefault();
    canvas.classList.remove('over'); $('drop').classList.remove('over');
    if (e.dataTransfer) await open(await readDrop(e.dataTransfer));
  });
}

$('sample-btn').onclick = async () => {
  const { samplePark } = await import('./sample');
  await setMap(samplePark(), 'Sample park loaded. Try Edge rail on the ledge, then Export.');
};

$('save-btn').onclick = () => {
  if (!map) return;
  download(`${map.name.replace(/[^A-Za-z0-9._-]+/g, '_')}.skmproj`, saveProject(map));
};

let saveTimer = 0;
function scheduleAutosave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { if (map) autosave(map); }, 1500);
}

loadAutosave().then(saved => {
  if (!saved || map) return;
  const inner = document.querySelector('.drop-inner')!;
  const p = document.createElement('p');
  const when = new Date(saved.saved).toLocaleString();
  p.innerHTML = `<button type="button" id="resume-btn">Resume ${esc(saved.name)}</button> <span class="fine">saved ${esc(when)}</span> <button type="button" id="forget-btn">Forget</button>`;
  inner.appendChild(p);
  $('resume-btn').onclick = () => setMap(loadProject(saved.bytes), `Resumed ${saved.name}.`);
  $('forget-btn').onclick = () => { clearAutosave(); p.remove(); };
});

// ---------- toolbar ----------
document.querySelectorAll<HTMLButtonElement>('#tools button').forEach(b => {
  b.onclick = () => setTool(b.dataset.tool as Tool);
});
document.querySelectorAll<HTMLButtonElement>('#modes button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('#modes button').forEach(x => x.classList.toggle('on', x === b));
    view.setMode(b.dataset.mode as ViewMode);
  };
});
$('frame-btn').onclick = () => view.frameSelection();

function setTool(tool: Tool) {
  document.querySelectorAll<HTMLButtonElement>('#tools button').forEach(x => x.classList.toggle('on', x.dataset.tool === tool));
  view.setTool(tool);
}

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.target as HTMLElement).closest('input, select, textarea') || !map) return;
  if (e.key === '1') setTool('select');
  else if (e.key === '2') setTool('spawn');
  else if (e.key === '3') setTool('rail');
  else if (e.key === '4') setTool('edge-rail');
  else if (e.key === 'f' || e.key === 'F') view.frameSelection();
  else if (e.key === 'Enter') view.finishRail();
  else if (e.key === 'Escape') { view.cancelDraft(); view.select(null); }
  else if (e.key === 'Delete' || e.key === 'Backspace') view.deleteSelection();
});

// ---------- left panel ----------
function renderAll() {
  renderMapSection();
  renderObjects();
  renderSpawns();
  renderRails();
  renderInspector();
  renderTargets();
  renderChecks();
}

function renderMapSection() {
  if (!map) return;
  const b = bounds(map);
  const size = b ? b.max.map((v, i) => r2(v - b.min[i])) : [0, 0, 0];
  $('map-section').innerHTML = `
    <h2>Map</h2>
    <label class="field"><span>Name</span><input type="text" id="map-name" value="${esc(map.name)}"></label>
    <dl class="stats">
      <dt>Source</dt><dd>${esc(map.source)}</dd>
      <dt>Size</dt><dd>${size[0]} × ${size[2]} m, ${size[1]} m tall</dd>
      <dt>Triangles</dt><dd>${fmt(triangleCount(map))}</dd>
      <dt>Materials</dt><dd>${map.materials.length}</dd>
      <dt>Textures</dt><dd>${map.textures.length}</dd>
    </dl>
    <div class="inline"><button id="zup-btn" type="button">Z up to Y up</button><button id="centre-btn" type="button">Centre on origin</button></div>
    <div class="inline"><span>Scale</span><input type="number" id="scale-in" value="1" step="0.01" min="0.001"><button id="scale-btn" type="button">Apply</button></div>
    ${map.warnings.length ? `<details><summary>${map.warnings.length} import notes</summary><ol class="log">${map.warnings.slice(0, 200).map(w => `<li>${esc(w)}</li>`).join('')}</ol></details>` : ''}`;
  ($('map-name') as HTMLInputElement).onchange = e => { map!.name = (e.target as HTMLInputElement).value.trim() || 'map'; scheduleAutosave(); };
  $('zup-btn').onclick = () => transformMap(Z_UP_TO_Y_UP, 'Rotated from Z up to Y up.');
  $('centre-btn').onclick = () => { recentre(map!); refreshGeometry('Centred on the origin, ground at 0.'); };
  $('scale-btn').onclick = () => {
    const s = Number(($('scale-in') as HTMLInputElement).value);
    if (s > 0 && s !== 1) transformMap(scaleMatrix(s), `Scaled by ${s}.`);
  };
}

function transformMap(m: number[], msg: string) {
  if (!map) return;
  applyToMap(map, m);
  refreshGeometry(msg);
}

async function refreshGeometry(msg: string) {
  if (!map) return;
  const sel = view.selection;
  await view.setMap(map);
  view.select(sel);
  renderAll();
  setStatus(msg);
  scheduleAutosave();
}

function renderObjects() {
  if (!map) return;
  const filter = (($('object-filter') as HTMLInputElement).value || '').toLowerCase();
  $('object-count').textContent = String(map.objects.length);
  const rows = map.objects.map((o, i) => ({ o, i })).filter(({ o }) => !filter || o.name.toLowerCase().includes(filter)).slice(0, 2000);
  $('object-list').innerHTML = rows.map(({ o, i }) =>
    `<li data-i="${i}"><span class="name">${esc(o.name)}</span><span class="meta">${o.render ? '' : 'hidden '}${o.collision.mode}</span></li>`).join('');
  highlightLists();
}
$('object-filter').oninput = renderObjects;
$('object-list').onclick = e => {
  const li = (e.target as HTMLElement).closest('li');
  if (li) { view.select({ kind: 'object', index: Number(li.dataset.i) }); view.frameSelection(); }
};

function renderSpawns() {
  if (!map) return;
  $('spawn-count').textContent = String(map.spawns.length);
  $('spawn-list').innerHTML = map.spawns.length
    ? map.spawns.map((s, i) => `<li data-i="${i}"><span class="name">${esc(s.name)}</span><span class="meta">${s.position.map(v => v.toFixed(1)).join(', ')} · ${Math.round(s.yaw)}°</span></li>`).join('')
    : '<li class="empty">None yet. Pick the Spawn tool and click the ground.</li>';
  highlightLists();
}
$('spawn-list').onclick = e => {
  const li = (e.target as HTMLElement).closest('li[data-i]') as HTMLElement | null;
  if (li) { view.select({ kind: 'spawn', index: Number(li.dataset.i) }); view.frameSelection(); }
};
$('auto-spawn-btn').onclick = () => {
  if (!map) return;
  const s = autoSpawn(map);
  if (!s) return setStatus('No flat floor found for a spawn.');
  map.spawns.unshift({ name: 'spawn', position: s.position, yaw: s.yaw });
  view.rebuildSpawns();
  view.select({ kind: 'spawn', index: 0 });
  view.onChange('map');
  setStatus('Placed a spawn on the largest open floor near the middle. Drag it with the Spawn tool to change it.');
};

function renderRails() {
  if (!map) return;
  $('rail-count').textContent = String(map.rails.length);
  $('rail-list').innerHTML = map.rails.length
    ? map.rails.map((r, i) => `<li data-i="${i}"><span class="name">${esc(r.name)}</span><span class="meta">${railLength(r.points).toFixed(1)} m${r.closed ? ' loop' : ''}</span></li>`).join('')
    : '<li class="empty">None yet. Rail draws one point by point; Edge rail follows a ledge.</li>';
  highlightLists();
}
$('rail-list').onclick = e => {
  const li = (e.target as HTMLElement).closest('li[data-i]') as HTMLElement | null;
  if (li) { view.select({ kind: 'rail', index: Number(li.dataset.i) }); view.frameSelection(); }
};

function railLength(p: number[][]): number {
  let n = 0;
  for (let i = 1; i < p.length; i++) n += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
  return n;
}

function highlightLists() {
  const sel = view.selection;
  for (const [id, kind] of [['object-list', 'object'], ['spawn-list', 'spawn'], ['rail-list', 'rail']] as const)
    $(id).querySelectorAll('li[data-i]').forEach(li => li.classList.toggle('on', sel?.kind === kind && Number((li as HTMLElement).dataset.i) === sel.index));
}

// ---------- inspector ----------
const surfaceOptions = (current?: string, inherit = false) =>
  (inherit ? `<option value="">From material</option>` : '') +
  SURFACES.map(s => `<option value="${s.id}"${s.id === current ? ' selected' : ''}>${s.label}</option>`).join('');

function renderInspector() {
  const sel = view.selection;
  const box = $('inspector');
  $('inspector-section').hidden = !map || !sel;
  if (!map || !sel) return;
  if (sel.kind === 'object') {
    const o = map.objects[sel.index];
    const mats = [...new Set(o.mesh.groups.map(g => g.material))].map(i => map!.materials[i]).filter(Boolean);
    $('inspector-title').textContent = 'Object';
    box.innerHTML = `
      <label class="field"><span>Name</span><input type="text" id="o-name" value="${esc(o.name)}"></label>
      <label class="field"><span>Collision</span><select id="o-mode">${COLLISION_MODES.map(m => `<option value="${m.id}"${m.id === o.collision.mode ? ' selected' : ''}>${m.label}: ${m.hint}</option>`).join('')}</select></label>
      <label class="field"><span>Surface</span><select id="o-surface">${surfaceOptions(o.collision.surface, true)}</select></label>
      <label class="inline"><input type="checkbox" id="o-render"${o.render ? ' checked' : ''}> Visible (off = invisible collision)</label>
      <dl class="stats" style="margin-top:10px">
        <dt>Triangles</dt><dd>${fmt(o.mesh.indices.length / 3)}</dd>
        <dt>Materials</dt><dd>${mats.map(m => esc(m.name)).join(', ') || 'none'}</dd>
      </dl>
      ${mats.map((m, k) => `<label class="field"><span>Surface for material ${esc(m.name)}</span><select data-mat="${map!.materials.indexOf(m)}" class="m-surface">${surfaceOptions(m.surface)}</select></label>`).join('')}
      <div class="inline"><button id="o-apply-similar" type="button">Use these settings on all "${esc(o.name.replace(/[._\s-]*\d+$/, ''))}*" objects</button></div>`;
    ($('o-name') as HTMLInputElement).onchange = e => { o.name = (e.target as HTMLInputElement).value; renderObjects(); scheduleAutosave(); };
    ($('o-mode') as HTMLSelectElement).onchange = e => { o.collision.mode = (e.target as HTMLSelectElement).value as CollisionMode; view.updateObject(sel.index); renderObjects(); scheduleAutosave(); };
    ($('o-surface') as HTMLSelectElement).onchange = e => { const v = (e.target as HTMLSelectElement).value; o.collision.surface = (v || undefined) as SurfaceId | undefined; view.updateObject(sel.index); scheduleAutosave(); };
    ($('o-render') as HTMLInputElement).onchange = e => { o.render = (e.target as HTMLInputElement).checked; view.updateObject(sel.index); renderObjects(); scheduleAutosave(); };
    box.querySelectorAll<HTMLSelectElement>('.m-surface').forEach(s => s.onchange = () => {
      map!.materials[Number(s.dataset.mat)].surface = s.value as SurfaceId;
      view.refreshMaterials(); scheduleAutosave();
    });
    $('o-apply-similar').onclick = () => {
      const stem = o.name.replace(/[._\s-]*\d+$/, '');
      let n = 0;
      map!.objects.forEach((x, i) => {
        if (x !== o && x.name.startsWith(stem)) { x.collision = { ...o.collision }; x.render = o.render; view.updateObject(i); n++; }
      });
      renderObjects(); scheduleAutosave();
      setStatus(`Applied to ${n} more objects.`);
    };
  } else if (sel.kind === 'spawn') {
    const s = map.spawns[sel.index];
    $('inspector-title').textContent = sel.index === 0 ? 'Spawn (start point)' : 'Spawn';
    box.innerHTML = `
      <label class="field"><span>Name</span><input type="text" id="s-name" value="${esc(s.name)}"></label>
      <div class="inline"><span>Facing</span><input type="number" id="s-yaw" value="${Math.round(s.yaw)}" step="15"> degrees</div>
      <div class="inline"><span>Position</span>${[0, 1, 2].map(k => `<input type="number" step="0.1" data-k="${k}" class="s-pos" value="${r2(s.position[k])}">`).join('')}</div>
      <p class="hint" style="margin-top:8px">${sel.index === 0 ? 'The first spawn is where every target starts the skater. Others become ReSkate fast-travel points and Skate 3 freeskate spots.' : 'Becomes a ReSkate fast-travel point and a Skate 3 freeskate spot.'}</p>
      <div class="inline">${sel.index ? '<button id="s-first" type="button">Make start point</button>' : ''}<button id="s-del" type="button">Delete</button></div>`;
    ($('s-name') as HTMLInputElement).onchange = e => { s.name = (e.target as HTMLInputElement).value; view.onChange('map'); };
    ($('s-yaw') as HTMLInputElement).onchange = e => { s.yaw = Number((e.target as HTMLInputElement).value) || 0; view.rebuildSpawns(); view.onChange('map'); };
    box.querySelectorAll<HTMLInputElement>('.s-pos').forEach(inp => inp.onchange = () => { s.position[Number(inp.dataset.k)] = Number(inp.value) || 0; view.rebuildSpawns(); view.onChange('map'); });
    if (sel.index) $('s-first').onclick = () => { map!.spawns.splice(sel.index, 1); map!.spawns.unshift(s); view.select({ kind: 'spawn', index: 0 }); view.onChange('map'); };
    $('s-del').onclick = () => view.deleteSelection();
  } else {
    const r = map.rails[sel.index];
    $('inspector-title').textContent = 'Rail';
    box.innerHTML = `
      <label class="field"><span>Name</span><input type="text" id="r-name" value="${esc(r.name)}"></label>
      <dl class="stats"><dt>Points</dt><dd>${r.points.length}</dd><dt>Length</dt><dd>${railLength(r.points).toFixed(2)} m</dd></dl>
      <label class="inline"><input type="checkbox" id="r-closed"${r.closed ? ' checked' : ''}> Closed loop</label>
      <div class="inline" style="margin-top:8px"><span>Raise</span><input type="number" id="r-lift" value="0" step="0.01"> m <button id="r-lift-btn" type="button">Apply</button></div>
      <div class="inline"><button id="r-del" type="button">Delete</button></div>`;
    ($('r-name') as HTMLInputElement).onchange = e => { r.name = (e.target as HTMLInputElement).value; view.onChange('map'); };
    ($('r-closed') as HTMLInputElement).onchange = e => { r.closed = (e.target as HTMLInputElement).checked; view.rebuildRails(); view.onChange('map'); };
    $('r-lift-btn').onclick = () => {
      const d = Number(($('r-lift') as HTMLInputElement).value) || 0;
      r.points = r.points.map(p => [p[0], p[1] + d, p[2]]);
      view.rebuildRails(); view.onChange('map');
    };
    $('r-del').onclick = () => view.deleteSelection();
  }
}

// ---------- checks ----------
$('check-btn').onclick = () => {
  if (!map) return;
  busy('Checking');
  setTimeout(() => {
    try { checkResults = runChecks(map!); } finally { busy(null); }
    renderChecks();
    view.setMarkers(checkResults.flatMap(r => r.points.map(p => ({ position: p, severity: r.level === 'warn' ? 'warn' as const : 'info' as const }))));
  }, 20);
};

function renderChecks() {
  $('check-list').innerHTML = checkResults.map((r, i) =>
    `<li${r.points.length ? ` data-points="${i}" title="Click to show these in the view"` : ''}><span class="lvl ${r.level}">${r.level}</span><span>${esc(r.text)}</span></li>`).join('');
}
$('check-list').onclick = e => {
  const li = (e.target as HTMLElement).closest('li[data-points]') as HTMLElement | null;
  if (!li) return;
  const r = checkResults[Number(li.dataset.points)];
  view.setMarkers(r.points.map(p => ({ position: p, severity: r.level === 'warn' ? 'warn' : 'info' })));
};

// ---------- export ----------
function loadTargets(): Target[] {
  try { const v = JSON.parse(localStorage.getItem('studio-targets') ?? 'null'); if (Array.isArray(v)) return v.filter(t => TARGETS.some(x => x.id === t)); } catch { /* ignore */ }
  return ['reskate', 'skate'];
}

function renderTargets() {
  $('target-list').innerHTML = TARGETS.map(t => `
    <li><label>
      <input type="checkbox" value="${t.id}"${selectedTargets.has(t.id) ? ' checked' : ''}>
      <span class="t-name">${esc(t.label)}</span><span class="t-file">${t.file}</span>
      <span class="t-note">${esc(t.note)}</span>
    </label></li>`).join('');
  $('target-list').querySelectorAll<HTMLInputElement>('input').forEach(inp => inp.onchange = () => {
    if (inp.checked) selectedTargets.add(inp.value as Target); else selectedTargets.delete(inp.value as Target);
    try { localStorage.setItem('studio-targets', JSON.stringify([...selectedTargets])); } catch { /* ignore */ }
  });
}

$('export-btn').onclick = async () => {
  if (!map || !selectedTargets.size) return setStatus('Pick at least one format to export.');
  const log = $('export-log');
  log.innerHTML = '';
  const btn = $('export-btn') as HTMLButtonElement;
  btn.disabled = true;
  if (!map.spawns.length) {
    const s = autoSpawn(map);
    if (s) { map.spawns.push({ name: 'spawn', position: s.position, yaw: s.yaw }); view.rebuildSpawns(); renderSpawns(); line('No spawn was set; placed one automatically.'); }
  }
  for (const target of TARGETS.filter(t => selectedTargets.has(t.id))) {
    const t0 = performance.now();
    busy(`Exporting ${target.label}`);
    try {
      const out = await exportInWorker(map, target.id, p => busy(`${target.label}: ${p}`));
      download(out.name, out.bytes);
      line(`${target.label}: ${out.name}, ${(out.bytes.length / 1048576).toFixed(1)} MB, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      for (const w of out.warnings.slice(0, 20)) line(`  ${w}`);
      if (out.warnings.length > 20) line(`  and ${out.warnings.length - 20} more notes`);
    } catch (err) {
      console.error(err);
      line(`${target.label}: ${err instanceof Error ? err.message : err}`, true);
    }
  }
  busy(null);
  btn.disabled = false;

  function line(text: string, err = false) {
    const li = document.createElement('li');
    li.textContent = text;
    if (err) li.className = 'err';
    log.appendChild(li);
  }
};

function download(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- credits ----------
$('credits-btn').onclick = () => ($('credits') as HTMLDialogElement).showModal();

renderTargets();
setStatus('Drop a file to start.');
