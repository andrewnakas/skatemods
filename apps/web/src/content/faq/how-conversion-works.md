---
question: How does map conversion on skatemods work?
answer: When you upload a map, an isolated GitHub Actions runner unpacks it, checks it for executables and retail content, and rebuilds it for the other platforms. PS3 maps become recomp .big packs and .skate files, and Xbox 360 maps become .skate. No game files are stored or used.
category: basics
games: [skate-3]
related: [faq/map-formats, faq/uploading-other-peoples-maps, guides/convert-ps3-maps]
order: 4
updated: 2026-10-01
---

## The pipeline

1. **Unpack.** Archives (`.zip`, `.7z`, `.rar`) and EA `.big` files, including PS3 `.big.edat`, are unpacked with path-traversal and size checks. Every `DIST_*` world inside is detected as PS3 (`.psf`) or Xbox 360 (`.xsf`).
2. **Check.** Executables and stock retail districts are rejected. The moderator sees the check results alongside your rights declaration ([policy](/policy/)).
3. **PS3 → recomp.** [skate3-ps3-to-x360](https://github.com/andrewnakas/skate3-ps3-to-x360) rebuilds vertex and index buffers, vertex descriptors, mesh islands and textures in Xbox 360 form. DlcBuilder from the [Dumbads toolset](https://github.com/Ethanw05/DumbadsSkate3ModdingTools) then packs a standalone DLC `.big`.
4. **Xbox 360 → .skate.** The [Rust engine's](https://github.com/SK8-ENGINE/skate-3-rust-engine) asset pipeline decodes the world, builds collision and writes a `.skate` file.
5. **Deliver.** You get each output with its size, timing and a log. Anything the converter can't handle is refused and explained, never silently emitted wrong.

## Why it needs no game files

Conversion only touches what's in your upload. A test run on a free GitHub runner, with no game data present, converted maps in seconds using under 0.5 GB of memory ([details](/convert/)). Approved maps are published as GitHub Releases on a public repository, so downloads stay free.

## What doesn't convert yet

Reverse paths (recomp → PS3, `.skate` → recomp) are planned. The [conversion page](/convert/) has the current matrix.
