---
title: Play skate. with ReSkate
description: Install ReSkate, the community modding platform for skate. (2025). Play offline, add custom maps and cosmetics from Thunderstore, build parks and skate with friends in lobbies and on dedicated servers.
game: skate-2025
level: beginner
order: 6
updated: 2026-10-03
---

[ReSkate](/history/reskate/) runs one pinned Steam build of skate. offline, with a community runtime that adds mods, a park editor and its own multiplayer. It doesn't touch EA's live game or servers. This guide covers ReSkate **1.0.2** (October 2026). The project's [README](https://github.com/Dingo-Shenanigans/ReSkate#readme) is the source of truth if anything here drifts.

## What you need

- **Windows 10 or 11**, 64-bit. At launch ReSkate was Windows-only. A Linux fix was promised soon after, so check the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX) for the current state.
- **Your own copy of skate. on Steam.** The game is free-to-play, so adding it to your library is enough.
- About **14 GB** free if the launcher has to download the game build for you.

## Install

1. Download the latest `ReSkate-<version>.zip` from [GitHub Releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest). Don't use any other mirror.
2. Extract `ReSkateLauncher.exe` and `ReSkate.dll` into one of two places:
   - **your skate. folder**, beside `Skate.exe` (Steam → skate. → Manage → Browse local files), or
   - **an empty folder**, where the launcher installs the game for you.
3. **Open Steam and sign in** if you want to play online. Without Steam, PLAY starts in offline mode as "Unknown Player", with no multiplayer.
4. Run `ReSkateLauncher.exe`. It updates itself, then checks your game files against the supported build.
5. If the game is missing, or Steam has updated it past that build, sign in when asked, with a QR code from the Steam app or your username, password and Steam Guard. The launcher downloads only the files it needs.
6. Press **PLAY**.

ReSkate supports **one game build at a time** (Steam build `25414733` for 1.0). Steam will keep updating your normal install. That's fine, because the launcher puts the supported build back. ReSkate keeps its own settings and saves in `%LOCALAPPDATA%\ReSkate\`, apart from the normal game's.

## Controls

| Key | Opens |
|---|---|
| **Insert** | the ReSkate menu: map and fast travel, world, park editor, skater, mods, multiplayer |
| **~** | the console (`help` lists every command) |
| **T** | chat, in multiplayer |

You can rebind the menu and console keys in the launcher's Settings.

## Add mods

The easiest way is the launcher's **MODS** page. Browse the [ReSkate Thunderstore](https://thunderstore.io/c/reskate/) and click install, or drag a mod `.zip` or folder onto the window.

You can also install by hand. Every mod is a folder in `Mods\` beside `Skate.exe`, and `Mods\mods.json` sets the load order. In game, the **MODS** tab of the ReSkate menu turns mods on and off, and most changes apply without a restart.

Good first downloads:

- [Full Skate 3 Map](https://thunderstore.io/c/reskate/p/zeex64/Full_Skate_3_Map/): Port Carverton in skate.'s engine.
- [Skate 2 Map](https://thunderstore.io/c/reskate/p/brassy/Skate2Map/): New San Vanelona.
- [Losal Streets](https://thunderstore.io/c/reskate/p/TeamMeebs/Losal_Streets/) from Skater XL, and Yaky's [Desert Springs](https://thunderstore.io/c/reskate/p/memori/Desert_Springs/).
- [SunJay's Low Cam](https://thunderstore.io/c/reskate/p/SunJayTeam/SunJays_Low_Cam/), a lower camera for street skating.

Custom maps show up in the ReSkate menu's level list. Mods are checked against the game build they were made for. If one is outdated or can't merge cleanly, ReSkate leaves it out and names it, and the rest still load.

**Only install mods you trust.** Mods change game data, and custom scripts can run code.

## Build a park

Open the ReSkate menu and pick the **Park Editor**. You place, move and save objects with a free camera, snapping and undo. Saved parks become mods, so you can share them like any other.

## Skate with friends

- **Steam lobby.** From the Multiplayer menu, host a lobby for up to 32 players. Make it public, or share its code, optionally with a password. Everyone in a lobby is in one party.
- **Dedicated servers.** Open **Multiplayer → Servers** to browse community servers. Want your own? See [Host a ReSkate server](/guides/host-a-reskate-server/).
- In multiplayer you get proximity voice, text chat with emotes, parties, throwdowns (Jam, Spot Battle and S.K.A.T.E.) and co-op challenges.

To join a server running a custom map, you need the same map mod installed, and the same ReSkate version as the server.

## When something breaks

- The log is `logs\ReSkate.log` beside `Skate.exe`. Attach it when you ask for help in the bug-reports forum on the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX) or open a [GitHub issue](https://github.com/Dingo-Shenanigans/ReSkate/issues).
- **Crash while loading on an older GPU** (an RX 580, for example): update to 1.0.2 or later, which sizes map streaming memory to your card's VRAM.
- **"Unknown Player" or no multiplayer**: Steam wasn't running or signed in when you pressed PLAY.
- The launcher sends crash reports (a minidump and that session's log, never your Steam login). Untick **Send crash reports** under Settings → Advanced to turn this off.

## Stay on the right side

ReSkate is a fan project, not affiliated with EA or Full Circle. Its FAQ says you can't be banned for using it. Don't use it to get paid cosmetics or share leaks; the project rules both out. It runs EA's client, so EA's terms still apply. Read [Can skate. be modded?](/faq/skate-2025/) for the background.
