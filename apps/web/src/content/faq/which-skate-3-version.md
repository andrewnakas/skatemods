---
question: Which version of Skate 3 should I mod?
answer: For most people it's the Xbox 360 version running natively through skate3recomp. Use RPCS3 if you want PS3-only mods or online play on the custom server, and Xenia or a modded console if you need the original hardware experience.
category: basics
games: [skate-3]
related: [faq/recomp-vs-emulator, faq/map-formats, guides/play-skate-3-on-pc, guides/skate-3-on-rpcs3]
order: 2
updated: 2026-10-01
---

## The short version

| You want… | Use |
|---|---|
| The best performance, custom maps, mods on PC, Mac, Linux or phone | **Xbox 360 copy + [skate3recomp](https://github.com/mchughalex/skate3recomp)** |
| Online play with other people today | **PS3 copy + RPCS3 + the [custom Blaze server](https://github.com/skate6743/Skate3BlazeServer)** |
| Older PS3 custom maps as they were released | **RPCS3**, or [convert them](/convert/) to the recomp |
| The original console experience | A modded PS3 (HEN/CFW) or RGH/JTAG Xbox 360 |

## Why the Xbox 360 version is the default

The recompilation was built from the Xbox 360 executable. It needs files "from your own legally obtained Xbox 360 copy of Skate 3" ([README](https://github.com/mchughalex/skate3recomp)). The new tools grew up around it: the [Level Loader](/guides/install-community-maps/), the Android, iOS and web builds, and the [Rust engine](/guides/skate-maps-rust-engine/)'s `.skate` maps.

## Why you might still want the PS3 version

Most custom maps from before 2026 were made for PS3, and the community Blaze server is built for "[RPCS3](/faq/rpcs3-basics/)/PS3" ([README](https://github.com/skate6743/Skate3BlazeServer)). RPCS3 rates Skate 3 **Playable** for the US (BLUS30464), EU (BLES00760) and Japanese (BLJM60296) releases ([compatibility](https://rpcs3.net/compatibility?g=BLUS30464)). PS3 maps don't have to stay on PS3, though: skatemods converts them to the recomp and `.skate` automatically.
