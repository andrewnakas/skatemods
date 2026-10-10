---
question: Should I play Skate 3 on Xenia or RPCS3?
answer: Use RPCS3 if you have the PS3 version or want to play online, since it has the community Blaze server and most classic PS3 mods. If you have the Xbox 360 version, skip Xenia and use the native Skate 3 Recomp, which takes the same disc image and runs much faster.
category: skate-3
games: [skate-3]
related: [guides/play-skate-3-anywhere, faq/rpcs3-basics, faq/xenia-basics, guides/skate-3-recomp]
order: 38
updated: 2026-10-10
---

## It depends on which disc you own

Xenia emulates the Xbox 360 and RPCS3 emulates the PS3. Each needs a dump of that console's version of the game ([how to dump your own](/faq/dumping-your-own-games/)), so the copy you own usually decides it.

| | RPCS3 | Xenia | Skate 3 Recomp |
|---|---|---|---|
| Game version | PS3 (BLUS30464, BLES00760, BLJM60296) | Xbox 360 | Xbox 360 |
| Status | [Playable](/faq/rpcs3-basics/) | [state-playable](/faq/xenia-basics/) | native port, [v2.0.2](/guides/skate-3-recomp/) |
| Online | yes, [community Blaze server](/faq/skate-3-online/) | no | no |
| Mods | PS3 custom maps, texture mods, Native Menu | texture mods | DLC-format maps, [Level Loader](/guides/install-community-maps/), converted PS3 maps |
| Mac | yes | no | Apple Silicon, experimental |

## Pick RPCS3 if

- you own the PS3 version,
- you want to skate online with other people on the original game, or
- you want the PS3 mod menus and maps from the emulator era. The [RPCS3 guide](/guides/skate-3-on-rpcs3/) covers settings, DLC and maps.

## Pick the Recomp over Xenia if

you own the Xbox 360 version. [skate3recomp](https://github.com/mchughalex/skate3recomp) takes the same ISO and, since v2.0, its native renderer gives "more than twice the frame rate" of the emulated renderer, by its README's numbers. Most current Skate 3 modding targets it. Xenia is still handy for checking how something behaves under emulation.

## Not sure?

[Every way to play Skate 3](/guides/play-skate-3-anywhere/) compares all five options, including the browser versions that need no disc.
