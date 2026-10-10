---
question: "Skate 3 on Xenia: does it work, which settings?"
answer: Yes. Xenia Canary's compatibility tracker marks Skate 3 playable from start to finish. Some players hit freezes, and there are known config fixes for them. For most PC players the recomp is the better choice, since it uses the same Xbox 360 copy.
category: skate-3
games: [skate-3]
related: [faq/xenia-or-rpcs3, faq/recomp-vs-emulator, faq/dumping-your-own-games, guides/play-skate-3-anywhere]
order: 12
updated: 2026-10-10
---

## Status

Skate 3 (title ID `454108E6`) is labeled **state-playable** in [Xenia Canary's game compatibility tracker](https://github.com/xenia-canary/game-compatibility/issues/349). That label means the game "can be reasonably played from start to finish with little to no issues". The report itself reads: "Fully playable from start to finish. No issues with 720/1440p mods."

## Settings that fix it

Players in that issue thread share two config fixes for `xenia-canary.config.toml`:

- **Freezes after a few minutes:** set `xma_decoder` from `new` to `old` and `use_dedicated_xma_thread` to `false`.
- **Missing billboard photo or skater preview:** set `readback_resolve` to `fast`. One tester reports that this only worked in the Edge build, not Canary.

## Getting the game in

Xenia can't run games straight from a PC disc drive. Install the disc on a stock Xbox 360, then copy it to USB, as the [quickstart](https://github.com/xenia-canary/xenia-canary/wiki/Quickstart) describes.

## Xenia or the recomp?

They take the same Xbox 360 game data. [skate3recomp](https://github.com/mchughalex/skate3recomp) runs it natively, with a D3D12 and Vulkan renderer, community map loading and builds for other platforms. Xenia is still useful for checking how something behaves under emulation.
