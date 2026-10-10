---
question: What is ReSkate Studio, and where do I get it?
answer: ReSkate Studio is the ReSkate team's tool for building skate. mods, mostly custom maps, from Blender. It has a Blender add-on and a command-line compiler, reskate_cli. It isn't on GitHub; the team posted it in the ReSkate Discord.
category: other-games
games: [skate-2025]
related: [guides/mod-skate-4, faq/reskate-custom-maps, history/reskate]
order: 37.6
updated: 2026-10-10
---

## What it does

Map makers model a park or city in Blender, mark spawn points, grind curves and collision with ReSkate Studio's add-on, and compile it into a mod that ReSkate loads. Community tools describe the handoff: Porterino's "rebuild and install" button saves, compiles with ReSkate Studio, installs the mod and starts the game ([Porterino](https://github.com/Rinoversal/Porterino)). Skaterino's readme mentions `reskate_cli ebx-values`, a Studio command for reading values from the game's own data ([Skaterino](https://github.com/Rinoversal/Skaterino)).

Mods built with Studio include a small `.reskate-studio-patch` file that records the SHA-256 of the `Skate.exe` they were built for. ReSkate uses that to leave out mods made for a different game build ([source](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Engine/Vfs/mod_list.h)). Several popular map and cosmetic authors credit Studio for their conversions.

## Where to get it

ReSkate Studio isn't published on GitHub or Thunderstore. When a map author asked for it on ReSkate's tracker, another player replied that it was posted and pinned in the ReSkate Discord ([issue #1](https://github.com/Dingo-Shenanigans/ReSkate/issues/1)). Join the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX) and check the pinned messages. Studio download links from anywhere else aren't from the ReSkate team.

## Community tools that work with it

- [Skaterino](https://github.com/Rinoversal/Skaterino) by Rinoversal measures a map against skate.'s real skater limits (scale, drops that bail, rails out of reach) before you build it.
- [Porterino](https://github.com/Rinoversal/Porterino) by Rinoversal is a Blender add-on that finds holes, ramp lips, bad bowl transitions and NPC and lighting problems, and rebuilds the map in one click.
- [ReSkate Map Creator](https://github.com/jonigiuro/ReSkate-Map-Creator) by jonigiuro places kit pieces, grind splines and a spawn without learning Blender, then exports a `.blend` for Studio.

These are third-party projects. Read them before running them. For using maps rather than making them, see [ReSkate custom maps](/faq/reskate-custom-maps/).
