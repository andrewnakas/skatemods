---
title: Skate 3
short: EA Black Box's 2010 finale, and the most actively modded skate game in 2026. It now has a native PC port, a custom online server, cross-platform map conversion and a Rust rewrite.
year: 2010
developer: EA Black Box
engine: RenderWare 4 (EA in-house)
platforms: [PlayStation 3, Xbox 360, PC via recomp, Android, iOS, Web (clean-room)]
series: skate
scene: thriving
featured: true
order: 1
howToMod:
  - Play it natively on Windows, Linux or macOS with skate3recomp or SK8-Engine. You bring your own Xbox 360 disc image.
  - Load community maps as DLC packs through the Skate 3 Level Loader.
  - Convert PS3 custom maps to recomp packs with the PS3 Map Importer, or on this site.
  - Mod textures on RPCS3 and Xenia with Skate 3 Texture Tools.
  - Restore online play on RPCS3 with the custom Blaze server.
links:
  - { label: skate3recomp, url: 'https://github.com/mchughalex/skate3recomp' }
  - { label: SK8-Engine, url: 'https://github.com/andrewnakas/SK8-Engine' }
  - { label: Skate 3 Level Loader, url: 'https://github.com/andrewnakas/skate3-level-loader' }
  - { label: PS3 Map Importer, url: 'https://github.com/andrewnakas/skate3-ps3-map-importer' }
  - { label: Skate 3 Blaze Server, url: 'https://github.com/skate6743/Skate3BlazeServer' }
  - { label: Rust engine, url: 'https://github.com/SK8-ENGINE/skate-3-rust-engine' }
---

Skate 3 came out on **May 11, 2010** in North America (May 13 in Europe and Australia) for PlayStation 3 and Xbox 360. It moved the series to Port Carverton, a city split into three districts: Downtown, with ledges and rails; University, with banks and open plazas; and Industrial, with a huge quarry. It shipped with **Skate.Park**, an object-dropper park editor, plus online team modes and **Hall of Meat**, the bail mode that later made the game famous on YouTube.

EA Black Box closed in 2013, and the series went quiet for over a decade, but Skate 3 kept its audience. A 2014 wave of YouTube videos about its ragdoll physics and glitches led EA to reprint discs. Xbox One backward compatibility followed in **November 2016**. The servers went down without notice around 2015–2016 and came back just as quietly before E3 2018.

## Why Skate 3 is the center of this site

For most of its life, modding Skate 3 meant a jailbroken console or an emulator. Three developments in 2026 moved it onto PC and beyond:

- **June 2026:** [skate3recomp](https://github.com/mchughalex/skate3recomp) statically recompiled the Xbox 360 executable to native code for Windows, Linux and macOS. In July, v2.0 added a native Direct3D 12 and Vulkan renderer.
- **Summer 2026:** the community built tools that read and write Skate 3's world format directly (ArenaBuilder, DlcBuilder), so maps that only ran on modded PS3s can now be converted to the PC build.
- **Late summer 2026:** Android and iOS builds of the recomp appeared, along with a Rust and Bevy reimplementation that loads its own portable `.skate` map format.

The full story, with dates and credits, is in the [Skate 3 modding history](/history/skate-3/).

## Platforms and formats at a glance

| Platform | World format | How mods load |
|---|---|---|
| PS3 / RPCS3 | `.psf` streams in `DIST_*` folders, packed in EA `.big` (often named `.big.edat`) | Replace files under `dev_hdd0/game/BLUS30464` (US) or `BLES00760` (EU) |
| Xbox 360 / Xenia | `.xsf` streams + `.xsm/.xmm/.xss/.xst` manifests, in `.big` DLC packages | RGH/JTAG, or DLC folders in Xenia |
| skate3recomp / SK8-Engine | Xbox 360 form | `.big` DLC packs in the `dlc` folder, or through the Level Loader |
| Rust engine | `.skate` (SKATE01–15) | Drag onto `PLAY.bat`, or pick from the in-game map menu |

skatemods converts maps between these formats automatically. See [map conversion](/convert/).
