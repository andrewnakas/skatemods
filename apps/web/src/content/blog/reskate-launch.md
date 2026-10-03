---
title: ReSkate 1.0 is out, and skate. finally has mods
description: On October 2, 2026, ReSkate shipped an open-source launcher, runtime and dedicated server for EA's skate. Within a day there were custom maps from Skate 3, skate 2 and Skater XL, community servers, two hotfixes and nearly 2,900 people in its Discord.
date: 2026-10-03
author: skatemods
featured: true
games: [skate-2025, skate-3, skate-2, skater-xl]
related: [guides/play-skate-with-reskate, guides/host-a-reskate-server, history/reskate, faq/skate-2025]
---

For a year, the answer to "can you mod the new skate.?" was no. EA's free-to-play revival is online-only, sits behind Javelin kernel anti-cheat, and changes with every live-service patch. Its user agreement calls mods unauthorized third-party programs. While the 2010 game got a native PC port and a fully writable world format, the newest game in the series stayed closed.

That changed on **Friday, October 2, 2026**. [ReSkate](https://github.com/Dingo-Shenanigans/ReSkate), from the Dingo Shenanigans team led by **zeex64**, published its source in the morning and shipped **v1.0.0** that afternoon. "Welcome to ReSkate!" the announcement in [its Discord](https://discord.gg/Tkd5D2Y6EX) began. It called the project "a modding platform for skate.: play offline, skate custom maps, host lobbies with your friends and build your own spots, parks and skins."

## The trick: freeze the game

ReSkate doesn't fight the live service. It sidesteps it. The launcher checks your Steam copy of skate. against **one pinned build** (Steam build `25414733`). If the game is missing or Steam has updated past that build, it signs in to Steam and downloads exactly the files it needs. Then it loads `ReSkate.dll` into the game. You play offline, with no EA servers involved, and your skater, outfits, unlocks and progress live on your PC.

Freezing the game build is what makes everything else possible. Every mod targets the same build, every address the runtime patches is kept in a per-build table, and hooks check the bytes they expect before touching anything. When ReSkate moves to a new build, mods made for the old one are skipped with a message instead of breaking the game.

## What shipped

Three programs, all open source under the **GPL-3.0**:

- **The launcher.** It updates ReSkate, verifies or downloads the supported build, and manages mods, with a built-in browser for the new [ReSkate Thunderstore](https://thunderstore.io/c/reskate/).
- **The runtime.** Press **Insert** for the ReSkate menu: map and fast travel; time of day, population, district levels and rotating parks; first person, noclip and boosts; and a **Park Editor** with a freecam, snapping and undo. Press **~** for a console.
- **The dedicated server.** `ReSkateServer.exe` needs neither the game nor Steam installed. It connects players through Steam's relay network, so there are no ports to open, and handles up to 249 players with votes, parties, admins and custom maps.

In game, multiplayer means 32-player Steam lobbies, an in-game server browser, proximity voice, text chat with emotes, parties, throwdowns (Jam, Spot Battle and S.K.A.T.E.) and co-op challenges.

## Day one on Thunderstore

The mod list from the first day says more than any feature list could. Thirteen mods went up on the [ReSkate Thunderstore](https://thunderstore.io/c/reskate/), and most of them are cities and parks from other games:

- **[The full Skate 3 map](https://thunderstore.io/c/reskate/p/zeex64/Full_Skate_3_Map/)**, ported by zeex64. Port Carverton, in the engine of the game that replaced it. It was the most downloaded mod of day one.
- **[New San Vanelona](https://thunderstore.io/c/reskate/p/brassy/Skate2Map/)** from skate 2, ported by brassy.
- **[Losal Streets](https://thunderstore.io/c/reskate/p/TeamMeebs/Losal_Streets/)** from [Skater XL](/history/skater-xl/), by TeamMeebs.
- Three maps by **Yaky**, a map maker the Skater XL scene already knows: [Shred Cavern](https://thunderstore.io/c/reskate/p/zeex64/Shred_Cavern_By_Yaky/), [The Lost Loop](https://thunderstore.io/c/reskate/p/zeex64/The_Lost_Loop_By_Yaky/), and [Desert Springs](https://thunderstore.io/c/reskate/p/memori/Desert_Springs/), ported from BMX Streets by memori.
- **SunJay**, co-runner of the Dumbads & SunJays Skate 3 modding Discord, brought [Warehouse Park](https://thunderstore.io/c/reskate/p/SunJay/Warehouse_Park_By_SunJay/), a [low street camera](https://thunderstore.io/c/reskate/p/SunJayTeam/SunJays_Low_Cam/) and [TotalWipeout](https://thunderstore.io/c/reskate/p/SunJay/SunJays_TotalWipeout_V1/).
- Maps from well outside skating: Garry's Mod's [gm_mcdonalds](https://thunderstore.io/c/reskate/p/crowkrow/gm_mcdonalds/) (crowkrow) and Black Ops 2's [Grind](https://thunderstore.io/c/reskate/p/relsmodding/Bo2_Grind/) (relsmodding). There was also a custom [Supreme box tee](https://thunderstore.io/c/reskate/p/akia47/SupremeBoxTee/) from akia47 and an early, collision-free [downhill jump line](https://thunderstore.io/c/reskate/p/Nakas/DM_Jumpline/) from Nakas, who runs this site.

The maps are built with ReSkate Studio, the project's map tool. Each one ships as a mod folder with Frostbite layout and CAS data plus a small `reskate-levels.json` that registers the level and its start points.

## The first 24 hours

Launches break things, and ReSkate's fixes came fast. **1.0.1** made the launcher warn when Steam isn't running or signed in. Without Steam, PLAY quietly starts offline as "Unknown Player" with no multiplayer. That evening, **[1.0.2](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.2)** fixed a loading crash on older graphics cards like the RX 580 by sizing map streaming memory to each card's VRAM, and made busy servers smoother by updating off-screen players less often. Dedicated servers update themselves once they're empty, so hosts didn't have to do anything.

By the end of the day, over a thousand people had downloaded the release from GitHub, the full Skate 3 map had passed 750 downloads on Thunderstore, and the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX) was near **2,900 members**. By the next morning it had passed 3,400. The launch announcement had already answered the question everyone asked first, whether you can get banned: the project's FAQ says you can't. zeex64 also promised a Linux fix for the next day.

## Where it fits

ReSkate is the newest chapter in a story this site keeps coming back to. Publishers move on and players keep the games alive: [PARTYMOD](/history/partymod/) and [THUG Pro](/history/thug-pro/) for the Tony Hawk's games, the [Skater XL](/history/skater-xl/) modders who built multiplayer before the studio did, and the [Skate 3](/history/skate-3/) scene that recompiled a 2010 console game into a native PC one. Some of the same people are at work again here. The groundwork happened around the Dumbads & SunJays Discord, where Skate 3's world format first became writable.

What's different this time is the target: a live game that EA is still developing. ReSkate is careful about that. It's a fan project "not affiliated with or endorsed by Electronic Arts or Full Circle." You need your own copy of the game, and the project says it's "NOT a replacement for the live game, a way to get paid cosmetics, or a place for leaks." The GPL covers ReSkate's code, not anything from skate. itself, and because it still runs EA's client, EA's terms still apply. The project's README also discloses that parts of its code and reverse-engineering notes were written with AI coding assistants, directed and tested by the maintainers.

## Get started

- **Play:** [Play skate. with ReSkate](/guides/play-skate-with-reskate/) covers install, controls, mods and fixes.
- **Host:** [Host a ReSkate server](/guides/host-a-reskate-server/) walks through the config, custom maps and fair-play checks.
- **History:** the [ReSkate scene page](/history/reskate/) has the timeline and the people behind it.
- **Mods:** [browse every skate. mod](/reskate/), updated live from Thunderstore.
- **Talk:** the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX) for help, bug reports and mod releases.
- **Download:** [github.com/Dingo-Shenanigans/ReSkate](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest). Get it there, not from a mirror.

skate. took a year to open up, and it was worth the wait.
