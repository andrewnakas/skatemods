---
title: "Every way to play Skate 3 in 2026 (PC, Mac, browser)"
description: Xenia, RPCS3, the native Skate 3 Recomp, the browser port and Clean Room Skate Online compared in one table, with what each needs, what it costs and which one to pick.
game: skate-3
level: beginner
order: 0
updated: 2026-10-10
downloads:
  - { label: "Skate 3 Recomp (Windows, Linux, macOS)", url: "https://github.com/mchughalex/skate3recomp/releases/latest", note: "needs your own Xbox 360 disc image" }
  - { label: "RPCS3", url: "https://rpcs3.net/download", note: "PS3 emulator; needs your own PS3 disc dump" }
  - { label: "Xenia Canary", url: "https://github.com/xenia-canary/xenia-canary/releases", note: "Xbox 360 emulator for Windows and Linux" }
  - { label: "Clean Room Skate Online", url: "/skate-3-online/", note: "in your browser, no game files" }
---

Skate 3 was never released on PC. EA still sells it on the [Xbox store](https://www.xbox.com/en-US/games/store/skate-3/bnkdkqxmxrr2) for Xbox One and Series X|S, where it's also in EA Play. Everywhere else, you play it through one of the community projects below. All but one need a copy of the game you own.

## The short answer

- **Windows or Linux PC, own the Xbox 360 disc:** [Skate 3 Recomp](/guides/skate-3-recomp/). It runs natively and has the most mods.
- **Own the PS3 disc, or want online lobbies with the original game:** [RPCS3](/guides/skate-3-on-rpcs3/) with the community Blaze server.
- **Mac:** the Recomp's experimental Apple Silicon build, or RPCS3. See [Skate 3 on Mac](/faq/skate-3-on-mac/).
- **Steam Deck:** the Recomp, or RPCS3. See [Skate 3 on Steam Deck](/faq/skate-3-on-steam-deck/).
- **Android:** [Skate3-Mobile](https://github.com/Buku313/Skate3-Mobile), a community ARM64 build of the Recomp that installs from your own ISO.
- **No game files, any computer with Chrome or Edge:** [Clean Room Skate Online](/skate-3-online/).

## Compared

| | Skate 3 Recomp | RPCS3 | Xenia | Browser port (skate.aaddpp.lol) | Clean Room Skate Online |
|---|---|---|---|---|---|
| What it is | native PC port of the Xbox 360 code | PS3 emulator | Xbox 360 emulator | fan engine rewrite in the browser | the same fan engine with regenerated assets |
| Game files | your Xbox 360 ISO | your PS3 disc dump | your Xbox 360 game | meant for your own converted copy (see [below](#the-browser-port)) | none |
| Cost | free | free | free | free | free |
| Full game (career, city, DLC) | yes | yes | yes | city and skating, not the full game | parks and community maps only |
| Custom maps and mods | most: DLC packs, [Level Loader](/guides/install-community-maps/), [converted PS3 maps](/guides/convert-ps3-maps/) | PS3 maps, texture mods, menus | texture mods | `.skate` maps | `.skate` maps from [/maps/](/maps/) |
| Online multiplayer | no | yes, [community Blaze server](/faq/skate-3-online/) | no | rooms | rooms for up to 10 |
| Windows | yes | yes | yes | yes | yes |
| Linux / Steam Deck | yes (native or Proton) | yes | yes | yes | yes |
| Mac | Apple Silicon, experimental | yes | no | yes | yes |
| Android | [Skate3-Mobile](https://github.com/Buku313/Skate3-Mobile), a community build | no official build | no | phone browser with WebGPU | phone browser with WebGPU |

## Skate 3 Recomp

[skate3recomp](https://github.com/mchughalex/skate3recomp) is "an unofficial native recompilation of the Xbox 360 version of Skate 3". Since v2.0 it draws the game with its own Direct3D 12 and Vulkan renderer. You click **Select ISO**, pick your disc image, and it installs the game. Most current Skate 3 modding targets it. [Full guide](/guides/skate-3-recomp/).

## RPCS3

[RPCS3](/faq/rpcs3-basics/) rates the US, EU and Japanese releases Playable. It's the only way to play the original game online, through [skate6743's Blaze server](https://github.com/skate6743/Skate3BlazeServer), which brings back lobbies, friend invites and Skate.Park uploads. [Settings and mods](/guides/skate-3-on-rpcs3/).

## Xenia

[Xenia Canary](/faq/xenia-basics/) marks Skate 3 playable from start to finish. It takes the same Xbox 360 copy as the Recomp, which runs faster and loads more mods, so most people use Xenia only to compare behaviour. [Xenia or RPCS3?](/faq/xenia-or-rpcs3/)

## The browser port

The skate.aaddpp.lol port runs the open-source Skate 3 Rust engine in the browser. It's designed to read your own converted copy, but the public site is set up to stream a converted data pack from another server. [The browser port explained](/blog/skate-3-browser-port/).

## Clean Room Skate Online

[Clean Room Skate Online](/skate-3-online/) is the same engine with every texture, sound and mesh regenerated, so no game files are involved. Open it in Chrome or Edge and skate, or start a room and send friends the link. It doesn't have the Skate 3 city or soundtrack.

## Where the game files come from

Every option except Clean Room Skate Online needs a dump of a disc you own. [Dumping your own games](/faq/dumping-your-own-games/) covers the Xbox 360 and PS3. Don't download ISOs from other sites. They're not legal to share, and some carry malware.
