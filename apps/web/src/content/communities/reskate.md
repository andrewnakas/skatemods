---
title: ReSkate
short: A community modding platform for EA's skate. (2025). It runs a pinned, older build of the game with its own runtime, so players can load custom maps, mods and community servers without touching the live service.
games: [skate-2025]
years: 2026–present
scene: niche
order: 7
updated: 2026-10-02
people:
  - name: zeex64
    role: Set up ReSkate's launcher configuration, which pins the game build and runtime, and its in-game news feed.
    url: https://zeex64.com
    source: https://github.com/Dingo-Shenanigans/LauncherConfig
  - name: AyeZeeBB
    role: Works on ReSkate's repositories alongside zeex64.
    source: https://github.com/Dingo-Shenanigans/ReSkateCache
milestones:
  - date: 2025-09-16
    title: skate. enters early access
    body: EA's free-to-play skate. launches on PC and consoles. It's online-only and protected by Javelin anti-cheat, so the live game can't be modded.
    source: https://news.ea.com/press-releases/press-releases-details/2025/EA-and-Full-Circle-Reveal-September-16-Early-Access-Release-Date-for-skate-/default.aspx
  - date: 2026-09-10
    title: Dingo Shenanigans
    body: The GitHub organization behind ReSkate is created.
    source: https://github.com/Dingo-Shenanigans
  - date: 2026-09-21
    title: '"Modded Skate 4 is coming"'
    body: Early footage of custom maps and time-of-day changes in skate. spreads on YouTube.
    source: https://www.youtube.com/watch?v=ubEv_Pkk4OU
  - date: 2026-09-23
    title: The launcher config
    body: ReSkate's launcher pins one specific Steam build of skate. and fetches it with DepotDownloader, then loads the ReSkate runtime on top. Mods target a fixed game version instead of the live service, which updates constantly.
    who: zeex64
    source: https://github.com/Dingo-Shenanigans/LauncherConfig
  - date: 2026-09-26
    title: '"Welcome to ReSkate"'
    body: An in-game news feed describes the pause-menu additions, Multiplayer (servers and sessions), Custom Stuff (world layers and parks) and Mods, and sets the ground rules.
    who: zeex64
    source: https://github.com/Dingo-Shenanigans/ReSkateCache
links:
  - label: Dingo Shenanigans on GitHub
    url: https://github.com/Dingo-Shenanigans
  - label: Dumbads & SunJays Skate3 Modding Discord
    url: https://discord.com/invite/AgDEQFR2Jj
  - label: Why the live game is locked
    url: https://skatemods.com/faq/skate-2025/
---

## A way around the live service

[skate.](/games/skate-2025/) is the hardest skate game to mod. It's online-only, free-to-play, protected by [EA Javelin anti-cheat](https://www.ea.com/news/ea-javelin-anticheat-2026-update), and updated constantly, and EA's [user agreement](https://www.ea.com/legal/user-agreement) treats mods as unauthorized third-party programs. ReSkate doesn't try to mod that live game. Its [launcher configuration](https://github.com/Dingo-Shenanigans/LauncherConfig) pins one specific Steam build of skate., downloads it with DepotDownloader, and loads a community runtime, `ReSkate.dll`, on top. Every mod targets the same fixed version of the game, and players connect to community servers instead of EA's.

## What it adds

According to its own [in-game news feed](https://github.com/Dingo-Shenanigans/ReSkateCache), ReSkate is "the modding platform for skate." with the tagline "San Van is yours. Skate it your way." The pause menu gains three things:

- **Multiplayer:** community servers and sessions.
- **Custom Stuff:** world layers and parks, which means custom maps in San Vansterdam.
- **Mods:** anything you drop into your Mods folder.

The project draws its own lines in that feed. ReSkate is "a community modding platform for skate: custom maps, models, skins and more", and "it's NOT a replacement for the live game, a way to get paid cosmetics, or a place for leaks."

## Where it's happening

The work is happening around the **Dumbads & SunJays Skate3 Modding Discord** ([invite](https://discord.com/invite/AgDEQFR2Jj)), whose description is simply "We mod Skate Games". That's the same server where Skate 3's world format became writable, so it makes sense the newest skate game is next. Footage of [custom maps and time-of-day changes](https://www.youtube.com/watch?v=ubEv_Pkk4OU) started circulating in September 2026.

## Status

ReSkate is early. The launcher config points at version 0.1.0, but as of October 2, 2026 there's no public release on GitHub. It still runs EA's game client, so EA's terms still apply to anyone who uses it. This page will follow the project as it ships. If you're involved and something here is wrong or missing, [fix it on GitHub](https://github.com/andrewnakas/skatemods/edit/main/apps/web/src/content/communities/reskate.md).
