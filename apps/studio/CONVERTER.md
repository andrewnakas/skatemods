# ReSkate map → Skate 3 converter

The converter turns a ReSkate (skate.) map mod, given as the Thunderstore `.zip` or its folder, into a Skate 3 DLC
pack for the recomp: `<CONTENTID>/<slug>_00000000.big` plus `.header`. Install it by unzipping into the recomp's
`dlc/` folder. It reads only the mod: no skate. install, no Oodle DLL, no EA code.

| Where | How |
|---|---|
| Browser | https://skatemods.com/convert-reskate-maps/ (the page frames `convert.html` from the Map Studio). Runs in a Web Worker; nothing is uploaded. |
| CLI | `cd apps/studio && npm ci && npm run convert -- <mod.zip or folder> -o out [--base-pack <dir or url>] [-v]`. A single-file bundle: `npm run build:cli` produces `dist-cli/skate3-convert.mjs`. |
| Library | `convertMod(source, { basePack, extraBaseRefs, shiftY, log, progress })` in `src/formats/convert/convert.ts`. It does no file-system access, so the same code runs in Node and in the browser. |

## For multiplayer: the output is deterministic

The same mod and the same pack version always give a **byte-identical** `.big`, whether converted from a folder, a
zip, the CLI or the browser. This was verified on DM Jumpline: CLI, zip, folder, browser and the live pack URL all
produce the same sha256. Every player who converts the same map therefore ends up with the same file. A lobby can
compare the `.big` sha256, or the mod's name and version, to make sure everyone has the same map.

The `.big` changes only when one of these changes:
- the converter code;
- the mod's own files;
- the base pack, for maps that use base-game textures or props.

## The CC0 base pack

skate. map mods sometimes reference the base game's own textures and props. These include Studio's neutral
defaults, the sticker decal, and props placed from the base library. The converter replaces them with
[skate-base-cc0](https://github.com/andrewnakas/skate-base-cc0): original, public-domain stand-ins with the same size,
collision and grind lines.
- In the browser, the pack is used by default. `?pack=<url>` points it at another copy, and `?pack=none` turns it off.
- Only the files a map uses are fetched from https://andrewnakas.github.io/skate-base-cc0-pack/: an index of about
  1.4 MB plus a few textures and meshes.
- From the CLI, `--base-pack` takes either the unzipped release or that URL.
- The conversion report lists what came from the pack: `textures.fromPack`, and `basePack.placed` and `missing`.
- `extraBaseRefs` places extra base props on top of a map, for example a test course or a lobby's shared spot.
  Each entry is a partition guid plus a 3×4 transform; see `test/dev/base_pack_e2e.ts`.

## Verified (2026-10-21)

- **Pack contents:** DM Jumpline gives 160 tiles, 900k triangles, 4,939 grind lines, its own spawn and 178 MB, with no
  base props.
- **Placed props, end to end:** 36 base props placed through the live pack all landed, adding 100 grind lines.
- **Determinism:** the output is byte-identical across CLI, zip, folder, browser (headless Edge) and the live pack.
- **Standalone:** `test/standalone_guard.ts` runs the CLI under Node's permission model, allowed to read only the mod.
- **Not yet:** an in-game boot of these packs on the recomp is still to do. A large map takes about 3–4 minutes and a
  few GB of RAM in the browser.

## Known limits

- **Thunderstore links in the page** need the API route `/api/thunderstore/...` (in `apps/api`) to be deployed. Until
  then the page hides that field; dropping the downloaded zip works.
- **Lightmaps** are flat white.
- **Prefab and effect references** inside maps are not converted. They are counted in the report.
- **Base props placed inside an own blueprint** are positioned at the blueprint transform; the entity's own offset is
  not applied yet.
