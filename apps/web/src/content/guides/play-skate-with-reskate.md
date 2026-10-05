---
title: Play skate. with ReSkate
description: Install ReSkate, the community modding platform for skate. (2025), the game fans call Skate 4. Play offline, add custom maps and cosmetics from Thunderstore, build parks and skate with friends in lobbies and on dedicated servers.
game: skate-2025
level: beginner
order: 6
updated: 2026-10-05
downloads:
  - { label: "ReSkate for Windows (latest release)", url: "https://github.com/Dingo-Shenanigans/ReSkate/releases/latest", note: "the ReSkate-<version>.zip, with ReSkateLauncher.exe and ReSkate.dll" }
  - { label: "skate. on Steam", url: "https://store.steampowered.com/app/3354750/", note: "free-to-play; add it to your library" }
  - { label: "Steam", url: "https://store.steampowered.com/about/", note: "open and signed in for multiplayer" }
  - { label: "ReSkate mods", url: "/reskate/", note: "browse every mod; install from the launcher" }
---

[ReSkate](/history/reskate/) runs one pinned Steam build of skate. offline, with a community runtime that adds mods, a park editor and its own multiplayer. It doesn't touch EA's live game or servers. This guide covers ReSkate **1.1.1** (October 5, 2026). The project's [README](https://github.com/Dingo-Shenanigans/ReSkate#readme) is the source of truth if anything here drifts.

## What you need

- **Windows 10 or 11**, 64-bit. On **Linux** (Steam Deck included) the launcher runs under Proton, and since 1.0.4 it detects Steam there. It isn't officially documented, so see [Linux and Steam Deck](#linux-and-steam-deck) below.
- **Your own copy of [skate. on Steam](https://store.steampowered.com/app/3354750/).** The game is free-to-play, so adding it to your library is enough.
- About **14 GB** free if the launcher has to download the game build for you.

## Install

1. Download the latest `ReSkate-<version>.zip` from [GitHub Releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest). Don't use any other mirror. If you already have ReSkate and only need to replace a file, [ReSkateLauncher.exe](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest/download/ReSkateLauncher.exe) and [ReSkate.dll](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest/download/ReSkate.dll) are direct downloads of the latest version.
2. Extract `ReSkateLauncher.exe` and `ReSkate.dll` into one of two places:
   - **your skate. folder**, beside `Skate.exe` (Steam → skate. → Manage → Browse local files), or
   - **an empty folder**, where the launcher installs the game for you.
3. **Open [Steam](https://store.steampowered.com/about/) and sign in** if you want to play online. Without Steam, PLAY starts in offline mode as "Unknown Player", with no multiplayer.
4. Run `ReSkateLauncher.exe`. It updates itself, then checks your game files against the supported build.
5. If the game is missing, or Steam has updated it past that build, sign in when asked, with a QR code from the Steam app or your username, password and Steam Guard. The launcher downloads only the files it needs.
6. Press **PLAY**.

ReSkate supports **one game build at a time** (Steam build `25414733`, unchanged through 1.1.1). Steam will keep updating your normal install, and the launcher puts the supported build back. ReSkate keeps its own settings and saves in `%LOCALAPPDATA%\ReSkate\`, apart from the normal game's.

## Controls

| Key | Opens |
|---|---|
| **Insert** | the ReSkate menu: map and fast travel, world, park editor, skater, trainer, mods, multiplayer |
| **~** | the console (`help` lists every command) |
| **T** | chat, in multiplayer |

You can rebind the menu and console keys in the launcher's Settings.

## Add mods

Browse everything that's out on [skate. mods](/reskate/), which lists the ReSkate Thunderstore live. Install them from the launcher's **MODS** page: browse the [ReSkate Thunderstore](https://thunderstore.io/c/reskate/) and click install, or drag a mod `.zip` or folder onto the window.

**MY MODS** lists what you have, with each mod's size on disk, a search box, a filter and a switch per mod. Tick several (Shift-click and Ctrl+A work) to enable, disable, update or uninstall them together. When Thunderstore has newer versions, the PLAY tile shows a count like "2 MOD UPDATES" and asks before launching without them.

You can also install by hand. Every mod is a folder in `Mods\` beside `Skate.exe`, and `Mods\mods.json` sets the load order. In game, the **MODS** tab of the ReSkate menu turns mods on and off, and most changes apply without a restart.

Good first downloads:

- [Full Skate 3 Map](https://thunderstore.io/c/reskate/p/zeex64/Full_Skate_3_Map/): Port Carverton in skate.'s engine.
- [Skate 2 Map](https://thunderstore.io/c/reskate/p/brassy/Skate2Map/): New San Vanelona.
- [Losal Streets](https://thunderstore.io/c/reskate/p/TeamMeebs/Losal_Streets/) from Skater XL, and Yaky's [Desert Springs](https://thunderstore.io/c/reskate/p/memori/Desert_Springs/).
- [South Florida](https://thunderstore.io/c/reskate/p/AltDoug/South_Florida/), B-Row's Skater XL map, and forestmouse's [SLS Hangar](https://thunderstore.io/c/reskate/p/forestmouse/The_SLS_Hangar/).
- The [Skate 3 Soundtrack](https://thunderstore.io/c/reskate/p/Prayboy/Skate3Soundtrack/) as a radio station.
- [SunJay's Low Cam](https://thunderstore.io/c/reskate/p/SunJayTeam/SunJays_Low_Cam/), a lower camera for street skating.

Custom maps show up in the ReSkate menu's level list. Song mods show up in the game's music screen next to the licensed stations, and can bring their own playlists. Mods are checked against the game build they were made for. PLAY merges your mods before the game starts, and if one is outdated or can't merge cleanly, the launcher names it and the rest still load.

**Only install mods you trust.** Mods change game data, and custom scripts can run code.

## Build a park

Open the ReSkate menu and pick the **Park Editor**. You place, move and save objects with a free camera, snapping and undo. Saved parks become mods, so you can share them like any other.

## Practice with the trainer

Since **1.0.9**, ReSkate has a **TRAINER** page built in (Insert → TRAINER). It started as Nakas's [ReSkate Trainer](https://github.com/andrewnakas/reskate-trainer) fork and was [merged upstream](https://github.com/Dingo-Shenanigans/ReSkate/pull/37), so there's nothing extra to install.

- **TUNE** opens on dials, one per preset (ollie height, push speed, flip and spin speed, bail resistance, grind lock-on, on-foot jump, glide and more), where 1 is the game's own. Below are switches (Auto Push, No Speed Wobble, Never bail), trick sliders for flip speed, no comply, boneless and hippy jump height, and the full table of values under EVERYTHING. Type a number beside any slider to go past its range. **Reset everything** puts the game back as it shipped.
- **PRACTICE** has game speed and pause, five marker slots per map, return to the marker after a bail, and teleport.
- **MAP & HUD** has a speed HUD, a read-out after every jump, telemetry recording to CSV, and spots or tuning a map's author ships in a `trainer.json`.

The HUD, the jump read-out and the LB + RB controller shortcuts start off. Online, a host's whole setup reaches guests, and under enforced physics a guest can't change their own. Every control is also a console command, such as `trainer set`, `trainer marker save` or `trainer reset everything` ([README](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Extension/Trainer/README.md)).

## Skate with friends

- **Steam lobby.** From the Multiplayer menu, host a lobby for up to 32 players. Make it public, or share its code, optionally with a password. Since 1.0.9 lobbies have parties like dedicated servers do: invite, join, leave, kick and promote, with `/p` for party chat.
- **Dedicated servers.** Open **Multiplayer → Servers** to browse community servers. To run your own, see [Host a ReSkate server](/guides/host-a-reskate-server/).
- In multiplayer you get proximity voice, text chat with emotes, parties, throwdowns (Jam, Spot Battle and S.K.A.T.E.) and co-op challenges.

To join a server running a custom map, you need the same map mod installed, and the same ReSkate version as the server.

## Known issues (1.1.1)

These are open on [ReSkate's issue tracker](https://github.com/Dingo-Shenanigans/ReSkate/issues) as of October 5:

- **Windows Defender or your browser calls it a Trojan.** Since around 1.0.8, the download and `ReSkate.dll` get flagged, usually as `Behavior:Win32/DefenseEvasion.A!ml` ([#47](https://github.com/Dingo-Shenanigans/ReSkate/issues/47), [#27](https://github.com/Dingo-Shenanigans/ReSkate/issues/27)). The `!ml` means a machine-learning guess. ReSkate loads a DLL into the game, which looks like what malware does. Only download from [GitHub Releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest). If you trust that copy, restore the file from quarantine and add the ReSkate folder to your antivirus exclusions. Otherwise the launcher can't read its own files ("Cannot open file for SHA-256", [#29](https://github.com/Dingo-Shenanigans/ReSkate/issues/29)).
- **Board graphics or maps crash since 1.1.0** ([#46](https://github.com/Dingo-Shenanigans/ReSkate/issues/46)). Some mods installed before 1.1.0 break. Uninstall the mod and install it again from MY MODS. If the game still crashes, turn mods off one at a time to find the culprit.
- **Linux/Proton: custom maps and servers hang on loading since 1.0.8** ([#31](https://github.com/Dingo-Shenanigans/ReSkate/issues/31)). Free skating in San Van works, but modded maps and servers running them loop on the loading screen. Players report that 1.0.7 loads custom maps fine.

## When something breaks

The [ReSkate troubleshooting table](/faq/reskate-not-working/) maps each error to its fix. The most common ones:


- The log is `logs\ReSkate.log` beside `Skate.exe`. Attach it when you ask for help in the bug-reports forum on the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX) or open a [GitHub issue](https://github.com/Dingo-Shenanigans/ReSkate/issues).
- **"Cannot open file" or the launcher can't read `ReSkate.dll`**: your antivirus is holding or blocking it. Add the ReSkate folder to its exclusions. Since 1.1.0 the error names the file and the Windows error code.
- **The launcher window is blank** on a laptop or PC with two GPUs: update to 1.0.6 or later, which draws on the best card instead of the onboard chip.
- **A big custom map crashes on load**: update to 1.1.0 or later, which raises the game's physics body limit for large maps.
- **A mod is missing in game**: PLAY names any mod it couldn't merge. Update it, or turn it off in MY MODS.
- **Crash while loading on an older GPU** (an RX 580, for example): update to 1.0.2 or later, which sizes map streaming memory to your card's VRAM.
- **"Can't host" or "can't join" with no reason**: update to 1.0.9 or later, which shows why the session refused.
- **"Unknown Player" or no multiplayer**: Steam wasn't running or signed in when you pressed PLAY.
- The launcher sends crash reports (a minidump and that session's log, never your Steam login). Untick **Send crash reports** under Settings → Advanced to turn this off.

## Linux and Steam Deck

More detail, with what players report on Steam Deck, is in [Does ReSkate work on Steam Deck?](/faq/reskate-steam-deck/)


ReSkate's launcher and runtime are Windows programs, but people run them on Linux:

- **Through Steam with Proton.** Add `ReSkateLauncher.exe` to Steam as a non-Steam game and force a recent Proton. Since 1.0.4 the launcher detects that Steam is signed in under Proton. Joining servers was fixed in 1.0.9 ([#28](https://github.com/Dingo-Shenanigans/ReSkate/issues/28)), but hosting a lobby may still say "Multiplayer is off" ([#19](https://github.com/Dingo-Shenanigans/ReSkate/issues/19)), and custom maps hang on loading since 1.0.8 (see [Known issues](#known-issues-111)).
- **With a script.** [ReSkate Linux Setup](https://github.com/vitorioaugusto/ReSkate-Linux-Setup) builds a dedicated Wine prefix with VKD3D-Proton and DXVK, and has backup and repair options. It was tested on Arch/CachyOS with NVIDIA. It's a third-party project, so read it before running it.

Hosting is easier: the [dedicated server](/guides/host-a-reskate-server/) has a native Linux build.

## Stay on the right side

ReSkate is a fan project, not affiliated with EA or Full Circle. Its FAQ says EA can't ban you for using it. The ReSkate team can, though: since 1.1.1, lobbies and most dedicated servers turn away players on its global multiplayer ban list. Don't use it to get paid cosmetics or share leaks; the project rules both out. It runs EA's client, so EA's terms still apply. Read [Can skate. be modded?](/faq/skate-2025/) for the background.
