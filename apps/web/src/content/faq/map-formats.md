---
question: What are .big, .psf, .xsf and .skate map files?
answer: Skate 3 stores a world as streamed chunks, .psf on PS3 and .xsf on Xbox 360 and the recomp, packed into EA .big archives. .skate is a separate, portable single-file format made for the community Rust engine.
category: basics
games: [skate-3]
related: [faq/how-conversion-works, guides/convert-ps3-maps, guides/skate-maps-rust-engine]
order: 3
updated: 2026-10-01
---

## The retail formats

Skate 3 runs on EA's RenderWare 4. A district is a folder (`DIST_*`) of **stream files** that the game loads as you skate around:

- **PS3** worlds use `.psf` streams (PlayStation 3 StreamFile). Their arena meshes are `.psg`.
- **Xbox 360** worlds use `.xsf` streams with `.xsm`, `.xmm`, `.xss` and `.xst` manifests. Their arena meshes are `.rx2`.

[RW4ArchiveTool](https://github.com/GHFear/RW4ArchiveTool) and the [Dumbads Skate 3 Modding Tools](https://github.com/Ethanw05/DumbadsSkate3ModdingTools) can read and write all of these. Worlds and DLC ship inside EA **`.big`** archives. On PS3 these are often encrypted as `.big.edat`.

## Which platform uses what

| Platform | Map form | Where it goes |
|---|---|---|
| PS3 / RPCS3 | `.psf` streams in `.big` / `.big.edat` | replaces files in the game folder (`BLUS30464` or `BLES00760`) |
| Xbox 360 / Xenia | `.xsf` streams in DLC `.big` packages | DLC folders (Xenia) or RGH/JTAG |
| skate3recomp | Xbox 360 form | `.big` DLC packs, or the [Level Loader](/guides/install-community-maps/) |
| Rust engine | `.skate` | drag onto the launcher or pick from the map menu |

## .skate

`.skate` belongs to the [Skate 3 Rust engine](https://github.com/SK8-ENGINE/skate-3-rust-engine), a reimplementation with "its own portable .skate map format" ([history](/history/skate-3/)). A whole map, collision included, sits in one file that can be shared and browsed in game through a [custom maps catalog](https://github.com/chasmlol/skate3-custom-maps-backend).

PS3 and Xbox 360 maps differ in byte order, vertex layout and texture tiling, so moving a map between platforms means rebuilding it. See [how conversion works](/faq/how-conversion-works/).
