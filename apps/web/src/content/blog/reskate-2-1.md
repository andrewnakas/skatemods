---
title: "ReSkate 2.1: Spotify in game, FPV drone, mod profiles"
description: ReSkate 2.1.0 arrived as a pre-release on October 15, 2026. It plays Spotify, YouTube Music, local files and online radio through skate.'s own music player, adds a flyable FPV drone, shareable mod profiles, Board Break wear and grind-exit controls, and fixes crashes on dense custom maps.
date: 2026-10-16
author: skatemods
featured: true
games: [skate-2025]
related: [guides/play-skate-with-reskate, faq/reskate-wont-launch-after-update, faq/reskate-not-working, blog/reskate-2-0-7]
---

ReSkate **2.1.0** went up on GitHub on **October 15, 2026** as a **pre-release**, a test build for players who want new features before the stable release. 2.0.8 and 2.0.9 were pulled after too many players crashed on them, so 2.1.0 follows 2.0.7 and carries everything from those two plus the fixes. Unlike most ReSkate releases, this one has full notes on GitHub, and this post is built from them ([release notes](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v2.1.0-pre)).

**2.0.7 is still the current stable version.** To try 2.1.0, download `ReSkate-2.1.0.zip` from the [pre-release page](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v2.1.0-pre) and extract it into your ReSkate folder, replacing the old files. From 2.1.0 on, the launcher has its own setting to test pre-releases. ReSkate has to live in a folder of its own, not Steam's skate. folder; 2.1.0's launcher tells you to move it if it isn't ([why](/faq/reskate-wont-launch-after-update/)).

## Your music in the game's player

Spotify, YouTube Music and "External Audio" now play through skate.'s own music player, each with its own row showing the track, the cover, pause and next. You can also add a folder of your own music (MP3, M4A, AAC, Ogg, FLAC or WAV), find online radio stations by name or add a stream's address, and use a five-band equaliser with loudness levelling. There's a queue and a Music page in the ReSkate menu ([48a9cb8](https://github.com/Dingo-Shenanigans/ReSkate/commit/48a9cb8f5b), [86aa8d3](https://github.com/Dingo-Shenanigans/ReSkate/commit/86aa8d38fb)). Until now, custom music meant installing a song pack from Thunderstore.

## An FPV drone

From the free camera you can fly a drone with quad physics, collisions and a goggle-style display, on keyboard and mouse, a gamepad or a USB RC radio. Presets cover a Tinywhoop, a toothpick and a 5-inch quad, and every setting is on the new DRONE page of the ReSkate menu (the console command `dronemenu` opens it) ([57d9830](https://github.com/Dingo-Shenanigans/ReSkate/commit/57d98307a7)). It's a filming tool as much as a toy: 2.1.0 also exports replays at much higher quality.

## Mod profiles

The launcher can save which mods are on and in what order as a **profile**, switch between profiles, and share one as a code or a file that r2modman can read. Installing a mod now brings the mods it depends on from Thunderstore, so mod packs install in one step ([2e186b9](https://github.com/Dingo-Shenanigans/ReSkate/commit/2e186b9839)).

## Skating

- **Board Break** gets wear and tear. Hard landings, rail hits, grinding and slams wear a board down; a worn board steers lazier and breaks more easily, and coming down too hard on a rail can snap it. New crack and impact sounds have their own settings ([b999f37](https://github.com/Dingo-Shenanigans/ReSkate/commit/b999f37e7b)). Board Break is still off until you turn it on.
- **Grind exits:** pick the side you leave a grind with LT and RT, set the pop-out strength, and a trigger pressed up to a second before the grind still counts. It works with DualShock 4 and DualSense pads ([837bea4](https://github.com/Dingo-Shenanigans/ReSkate/commit/837bea4c40)).

## Multiplayer

- Other players' placed objects are **ghosts** you skate through by default. Each player's row in the session menu has a switch to make theirs solid, and a server's own park objects stay solid.
- Typing dots show above a skater who is writing a message.
- Kicks and bans show a popup that says why. Server owners get timed kicks, and vote kicks last five minutes by default.
- Custom map downloads on join are more reliable: a download that has started finishes and installs even if the server stops waiting.

## Fixes

Dense custom maps such as Los Santos City and San Andreas no longer crash or hang the GPU ([164fdff](https://github.com/Dingo-Shenanigans/ReSkate/commit/164fdffbd0)), and levels with a very large number of lights no longer crash. The music screen no longer comes up empty with more than 1,024 songs, PlayStation controllers no longer drop input for a moment, and a mod with one unreadable script keeps the rest of its changes. Crash reports now go to ReSkate's own server, with an opt-in setting for performance timings.

Every release, with notes where the team wrote them, is in our [ReSkate changelog](/reskate/changelog/). What came before: [ReSkate 2.0.7](/blog/reskate-2-0-7/).
