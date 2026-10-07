// Skate 3 DLC (.big) in and out, through the .NET WebAssembly build of sk3 + ArenaBuilder +
// DlcBuilder (apps/studio/dotnet/Sk3Wasm). Loaded only when a Skate 3 file is involved.
import type { MapIR } from '../../ir';

export async function readSkate3(_bytes: Uint8Array, _name: string, _progress: (t: string) => void): Promise<MapIR> {
  throw new Error('Skate 3 DLC import is not in this build yet.');
}

export async function writeSkate3(_map: MapIR, _target: 'x360' | 'recomp' | 'ps3', _progress: (t: string) => void): Promise<Uint8Array> {
  throw new Error('Skate 3 DLC export is not in this build yet.');
}
