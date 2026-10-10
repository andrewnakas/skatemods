---
title: "Skate 3 in a web browser: the browser port explained"
description: A Skate 3 browser game at skate.aaddpp.lol went viral on October 8, 2026. What it runs, where its game data comes from, and the browser options that need no game files at all.
date: 2026-10-10
author: skatemods
games: [skate-3]
related: [guides/play-skate-3-anywhere, faq/skate-3-online, faq/dumping-your-own-games, guides/skate-maps-rust-engine]
---

On October 8, 2026, [Operation Sports](https://www.operationsports.com/an-18-year-old-student-figured-out-how-to-make-skate-3-playable-in-a-web-browser/) and [TweakTown](https://www.tweaktown.com/news/113993/you-can-now-play-skate-3-black-ops-and-20-plus-classic-games-in-your-web-browser/index.html) covered a Skate 3 browser game at **skate.aaddpp.lol**. Its maker, aaddpp (GitHub [vmpprotect](https://github.com/vmpprotect)), told Operation Sports they built it over a few days and were "averaging 360fps LOCKED". Searches for "skate 3 browser game" have been climbing since.

## What it runs

The page calls itself "skate. 3 Rust Engine, an unofficial fan game. Not made by EA." It's a web build of the open-source [Skate 3 Rust engine](https://github.com/SK8-ENGINE/skate-3-rust-engine) (GPL-3.0), a Rust and Bevy reimplementation of Skate 3's skating, compiled to run in the browser on WebGPU. The engine's README says "Game assets not included." It isn't an emulator and it isn't EA's code: the physics, tricks and grinds are a rewrite, and the look comes from whatever game data you feed it.

The port adds a menu modelled on Skate 3's, loading screens, touch controls for phones and tablets, and a lighter graphics mode for mobile browsers. It needs a browser with WebGPU. Operation Sports reports that it runs on phones and tablets as well as PCs.

## Where the game data comes from

The page's own text says "Game data streams from your own converted copy of Skate 3", and Operation Sports reported that the server "hosts only the engine". The code supports that setup: you convert your copy on your PC, run its `SERVE.bat`, and point the page at your own machine.

The public site isn't set up that way. As of October 10, its `config.json` points the engine at a **278 MB zip of converted Skate 3 game data on another domain**, so a visitor who presses Play streams that data rather than their own. The zip's file list shows a converted game install, including Skate 3's own sound banks (grinds, foley, crowds, Hall of Meat). We don't link it.

If you want to use the engine with your own copy:

1. Dump your own disc ([how](/faq/dumping-your-own-games/)). Nothing on skatemods hosts game files.
2. Convert and serve it with the engine's own tools ([.skate maps in the Rust engine](/guides/skate-maps-rust-engine/) covers the format).

The site also links a Discord, donation pages and a pump.fun token. skatemods has no connection to any of them.

## Options that need no game files

[Clean Room Skate Online](/skate-3-online/) runs the same Rust engine in your browser with a **clean-room asset pack**: every texture, sound and visual mesh is regenerated, and no retail data is sent to you. It has multiplayer rooms for up to 10 players and loads [community maps](/maps/). It doesn't have the big Skate 3 districts or the soundtrack.

For the full game on your own hardware, the native [Skate 3 Recomp](/guides/skate-3-recomp/) runs your Xbox 360 copy on Windows, Linux and macOS. [Every way to play Skate 3](/guides/play-skate-3-anywhere/) compares all of them in one table.

## Who built the engine

chasmlol is the main author of the [Rust engine](https://github.com/SK8-ENGINE/skate-3-rust-engine) and its `.skate` map format, under the SK8-ENGINE organisation. It builds on years of format research in the Skate 3 scene, including Dumbads' [ArenaBuilder and DlcBuilder](https://github.com/Ethanw05/DumbadsSkate3ModdingTools). The [Skate 3 history](/history/skate-3/) has the credits and timeline. aaddpp's build is one of several web builds of that engine. Operation Sports reports that a Skate 2 version is planned.
