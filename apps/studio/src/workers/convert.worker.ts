// ReSkate map mod -> Skate 3 pack, entirely in this worker. Nothing leaves the browser.
import { convertMod } from '../formats/convert/convert.ts';
import { filesSource, zipSource, storedZipFile, type Unpacked } from '../formats/convert/browser_sources.ts';
import { urlPack } from '../formats/convert/base_pack.ts';

export type ConvertRequest =
  | { kind: 'zip'; zip: Blob; name: string; basePackUrl?: string }
  | { kind: 'folder'; files: { path: string; file: File }[]; basePackUrl?: string };

export type ConvertMessage =
  | { type: 'progress'; f: number; what: string }
  | { type: 'log'; line: string }
  | { type: 'done'; zip: Blob; fileName: string; contentId: string; summary: Record<string, unknown> }
  | { type: 'error'; message: string };

const post = (m: ConvertMessage) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (ev: MessageEvent<ConvertRequest>) => {
  const req = ev.data;
  let unpacked: Unpacked | null = null;
  try {
    let src;
    if (req.kind === 'zip') {
      unpacked = await zipSource(req.zip, (f, what) => post({ type: 'progress', f: f * 0.15, what }));
      src = unpacked.src;
    } else src = filesSource(req.files);
    // the CC0 base pack (served web layout): only the meshes/textures this map uses are fetched
    const basePack = req.basePackUrl ? await urlPack(req.basePackUrl) : undefined;
    const t0 = performance.now();
    const r = await convertMod(src, {
      basePack,
      log: (line) => post({ type: 'log', line: `${((performance.now() - t0) / 1000).toFixed(1)}s ${line}` }),
      progress: (f, what) => post({ type: 'progress', f: 0.15 + f * 0.8, what }),
    });
    post({ type: 'progress', f: 0.97, what: 'zipping the pack' });
    const pk = r.pack;
    const zip = await storedZipFile([
      { name: `${pk.contentId}/${pk.bigName}`, parts: pk.bigParts },
      { name: `${pk.contentId}/${pk.headerName}`, parts: [pk.header] },
    ], `${pk.contentId}.zip`);
    pk.bigParts.length = 0;                       // the zip is on disk now; let the in-memory pack go
    post({ type: 'done', zip, fileName: `${pk.contentId}.zip`, contentId: pk.contentId, summary: { ...r.report, spawn: r.spawn, bigBytes: pk.bigSize } });
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    await unpacked?.dispose();
  }
};
