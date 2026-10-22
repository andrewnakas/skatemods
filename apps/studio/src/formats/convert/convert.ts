// mod (any ModSource) -> Skate 3 pack, in memory. No fs, no game install: shared by the CLI and the browser worker.
import type { ModSource } from '../reskate-mod/frostbite.ts';
import { exportMod } from '../skate3/export.ts';
import { buildPack, type BuiltPack } from '../skate3/pack_build.ts';
import type { Spawn } from '../skate3/spawns.ts';
import type { BasePack } from './base_pack.ts';
import type { BaseRef } from '../reskate-mod/mod.ts';

export interface ConvertOptions {
  shiftY?: number;
  /** CC0 base-asset pack for the base-game props a map places */
  basePack?: BasePack;
  extraBaseRefs?: BaseRef[];
  log: (s: string) => void;
  progress: (f: number, what: string) => void;
}

export interface ConvertResult {
  pack: BuiltPack;
  spawn: Spawn | undefined;
  report: Record<string, unknown>;
}

export async function convertMod(src: ModSource, o: Partial<ConvertOptions> = {}): Promise<ConvertResult> {
  const log = o.log ?? (() => {}), progress = o.progress ?? (() => {});
  const ex = await exportMod(src, { log, basePack: o.basePack, extraBaseRefs: o.extraBaseRefs, progress: (f, w) => progress(f * 0.6, w) });
  const pack = buildPack(ex, { shiftY: o.shiftY, releaseInput: true, log, progress: (f, w) => progress(0.6 + f * 0.4, w) });
  return { pack, spawn: ex.spawns[0], report: { export: ex.report, pack: pack.report } };
}

/** The directory inside an archive that holds the mod (layout.toc / Win32/ beside it), '' for the archive root. */
export function modRoot(paths: string[]): string {
  let best: string | null = null;
  for (const p of paths) {
    const m = /^(.*?)(?:layout\.toc|reskate-levels\.json)$/i.exec(p);
    if (m && (best === null || m[1].length < best.length)) best = m[1];
  }
  return best ?? '';
}

/** A ModSource seen from `root` inside another one. */
export function subSource(src: ModSource, root: string): ModSource {
  if (!root) return src;
  const files = src.list().filter((p) => p.startsWith(root)).map((p) => p.slice(root.length));
  return { list: () => files, size: (p) => src.size(root + p), read: (p, off, len) => src.read(root + p, off, len) };
}
