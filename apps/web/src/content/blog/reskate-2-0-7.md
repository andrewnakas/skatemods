---
title: "ReSkate 2.0.7: map downloads, pause menu, Board Break"
description: ReSkate shipped five updates between October 10 and 12, 2026, from 2.0.3 to 2.0.7. Servers now offer their map to players who don't have it, the pause menu has a real server browser, Discord shows where you're skating, and two optional mods break boards and scrape up your skater.
date: 2026-10-13
updated: 2026-10-13
author: skatemods
featured: true
games: [skate-2025]
related: [guides/play-skate-with-reskate, guides/host-a-reskate-server, faq/reskate-not-working, blog/reskate-2]
---

ReSkate is on **2.0.7**, released on October 12, 2026 (October 11 in the Americas). Five releases came out in the three days after [2.0](/blog/reskate-2/). The launcher updates itself when you start it, and dedicated servers install a new version once they're empty. Each release's commits are on its own page in our [changelog](/reskate/changelog/).

## Servers hand you their map

Before 2.0.3, joining a server that ran a custom map meant finding and installing that map first. Now the server tells you which [Thunderstore](https://thunderstore.io/c/reskate/) package its map comes from. If you don't have it, a card shows the map's name, author and version with DOWNLOAD and CANCEL. On yes, ReSkate downloads and installs it while you stay connected, then loads you in ([0ae0e71](https://github.com/Dingo-Shenanigans/ReSkate/commit/0ae0e71f0f)). It only offers packages listed as Maps in the ReSkate community, never deprecated, rejected or NSFW ones.

## A pause menu that works like a browser

zeex64 rebuilt the Multiplayer and Custom Stuff pages of the pause menu in 2.0.3 ([a94bcba](https://github.com/Dingo-Shenanigans/ReSkate/commit/a94bcba9c8)). The server browser has sortable name, map and skater columns, search, and filters for servers, lobbies, friends, full sessions and your current map. 2.0.6 added favorite servers. Mod settings moved to a **Mod Options** page, and the launcher can now change skate.'s own graphics, audio, camera and control settings before you start.

## Discord Rich Presence

From 2.0.3, your Discord profile shows the map you're on, the server or lobby name and how many people are in it ([8a4980c](https://github.com/Dingo-Shenanigans/ReSkate/commit/8a4980c26a)). Sessions anyone can walk into show "Ask to Join" in Discord, and accepting starts the game if it isn't running. Password-protected sessions show only "Private server" or "Private lobby".

## Board Break and Road Rash

Fourth Studio added two optional effects. **Road Rash** (2.0.3) marks your skater after repeated bails: dust and grazes after 10, raw wounds and a bruised face by 20, until you heal ([1b0bb2b](https://github.com/Dingo-Shenanigans/ReSkate/commit/1b0bb2b12f)). **Board Break** (2.0.6) can snap your deck at the nose, middle or tail on a hard slam ([bd628ab](https://github.com/Dingo-Shenanigans/ReSkate/commit/bd628abc76)), and 2.0.7 lets one mod bring a pack of breakable decks. Road Rash started switched on in 2.0.3. Since 2.0.6 both stay off until you turn them on.

## Server owners

- **Roles** with their own tags, commands and permissions (2.0.6). wxndr added a Windows window for running a server, with live stats ([4ea92f0](https://github.com/Dingo-Shenanigans/ReSkate/commit/4ea92f0258)), and zeex64 gave it a roles editor and a word-filter switch.
- **Park mods** as objects the server owns, reloadable while it runs (moelrobi, 2.0.6).
- **Map votes** when a map's time runs out, counted only among players who vote (2.0.7).
- Host bans, messages to a single player, owner-defined chat commands, and chat word lists. 2.0.6 cut false flags from the word filter and lets each server keep its own lists. That change moved the multiplayer protocol to **49**, so players and servers need the same version.
- dubsector fixed the [Pterodactyl](https://pterodactyl.io/) egg's config writes.

[Host a ReSkate server](/guides/host-a-reskate-server/) covers setup.

## Fixes and performance

- 2.0.5 was a hotfix for 2.0.4, which could close the game the moment a DualSense or DualShock 4 was connected, according to the team's patch notes on Discord. 2.0.6 fixes the Insert menu on **Intel Arc** cards, which couldn't attach to the game's picture ([b042bf2](https://github.com/Dingo-Shenanigans/ReSkate/commit/b042bf253a)).
- A hotfix to 2.0.7, shipped under the same version number, waits for a map update to finish before loading the map when you join a server, which used to end on "This map is not loading". It also stops asking you to "update" to an older map than yours, and renames the Staff tag to ReSkate Admin.
- 2.0.4 raised the game's entity limit to four times its normal size for big maps. 2.0.7 brought it down to two times, because every map paid the memory cost and the largest map load seen needs about 150,000 of the 262,144 slots ([0f8af62](https://github.com/Dingo-Shenanigans/ReSkate/commit/0f8af62710)).
- 2.0.7 raises the streamed texture limit to 32,764 and turns off the game's ad system, which has nothing to serve offline. A player measured about 5% more FPS from that; the commit notes the team didn't measure it ([3df1a3c](https://github.com/Dingo-Shenanigans/ReSkate/commit/3df1a3cdfc)).
- 2.0.3 stopped running anything in `scripts/Custom`. Nothing used the folder except one mod that loaded a DLL through it ([b7936a3](https://github.com/Dingo-Shenanigans/ReSkate/commit/b7936a36c6)).

## Still open

On October 13, ReSkate tagged 2.0.8 and 2.0.9 on GitHub, but neither is a published release. That evening the team posted in its patch-notes channel that it was reverting to 2.0.7 while it fixed the update, so 2.0.7 is still the version to run.

The same day, EA's skate. update reached Steam and broke ReSkate for anyone who had installed it in Steam's skate. folder. The fix is to move ReSkate to its own folder: [ReSkate not launching after a skate. update?](/faq/reskate-wont-launch-after-update/).

Some players see an invisible board on 2.0.6 and 2.0.7, including on Steam Deck, and some Linux and Wine setups stop right after starting unless mods are off. Our [known issues](/guides/play-skate-with-reskate/#known-issues) list has the workarounds, and [ReSkate isn't working](/faq/reskate-not-working/) maps errors to fixes.
