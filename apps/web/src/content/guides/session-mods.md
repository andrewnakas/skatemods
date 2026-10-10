---
title: "Session mods in 2026: maps, gear and Steam Deck"
description: How to mod Session, Skate Sim on PC in 2026. Install Session Mod Manager and the Illusory unlocker, add custom maps and gear, set it up on Steam Deck and Linux, and what to expect when the Barcelona DLC lands on October 28.
game: session
level: beginner
order: 14
updated: 2026-10-10
downloads:
  - { label: "Session Mod Manager (latest release)", url: "https://github.com/rodriada000/SessionMapSwitcher/releases/latest", note: "Windows and Linux builds, MIT licensed" }
  - { label: "Illusory Universal Mod Unlocker", url: "https://illusory.dev/", note: "the patch that lets Session load custom maps and textures" }
  - { label: "Illusory Discord", url: "https://discord.gg/Mt3qzgN", note: "where most maps and gear are shared" }
  - { label: "Session on Steam", url: "https://store.steampowered.com/app/861650/", note: "mods only work on the PC version" }
---

Session has never had official mod support. Everything here runs on community tools, mainly rodriada000's open-source [Session Mod Manager](https://github.com/rodriada000/SessionMapSwitcher) and Illusory's mod unlocker. Mods work on the **PC version only**. There is no way to load them on PlayStation, Xbox or Switch ([why](/faq/session-mods-console/)).

## What you can add

- **Maps.** Original parks and recreations of real spots and other games' levels. Within a month of early access, players had rebuilt levels from Skate 3 and THPS2 ([PC Gamer](https://www.pcgamer.com/session-mods-custom-maps/)).
- **Gear textures.** Decks, wheels, shirts and other clothing, through the Mod Manager's Texture Replacer.
- **Settings the game doesn't expose.** The Mod Manager can raise the object dropper limit (from 1 up to 65,000) and, since 3.0, set your money ([3.0 release notes](https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v3.0.0)).

## Install Session Mod Manager

These steps follow the project's [README](https://github.com/rodriada000/SessionMapSwitcher#readme).

1. Download the latest release from [GitHub](https://github.com/rodriada000/SessionMapSwitcher/releases/latest). The current version is **3.0.5**, which added Epic Games Store support. Pick the build for your OS and unzip it anywhere.
2. Open `SessionModManager.exe` and set **Path To Session** to the top-level game folder, for example `C:\Program Files (x86)\Steam\steamapps\common\Session`. It usually finds this on its own.
3. Click **Patch With Illusory Mod Unlocker**. The Mod Manager opens [illusory.dev](https://illusory.dev/) so you can download the unlocker.
4. Run the unlocker's setup, set its path to `...\Session\SessionGame\Binaries\Win64` (one level deeper than the path in step 2), and click **patch**.

Without the patch, custom maps and textures don't load.

## Add maps and gear

- **Asset Store (easiest).** Click **Asset Store** in the Mod Manager, pick a map or texture and click install. Downloads queue and install one at a time.
- **From a .zip or folder.** Use **Import Map**, tick **Import .zip File** if it's zipped, and browse to it. Map makers can right-click a map and choose **Re-import Selected Map** after each change.
- **By hand.** Copy the map files into `Session\SessionGame\Content`, then click **Reload Available Maps**.

Switch maps from the Mod Manager while the game is running. You don't need to restart. Since 3.0 you can turn mods off without deleting them, and the manager won't enable two mods that conflict.

## Steam Deck and Linux

Session Mod Manager 3.0 rewrote the interface to run natively on Linux, so download the Linux build rather than running the Windows one under Proton ([release notes](https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v3.0.0)). The game itself still runs through Proton. For the unlocker step and Deck-specific setup, follow agentender's [Session modding on Steam Deck](https://hackmd.io/@agentender/H102AjAro) guide.

## When an update breaks mods

Game updates have broken mods before. In 2020, crea-ture's own [patch notes](https://steamcommunity.com/games/861650/announcements/detail/2578811485588754826) warned that older mods would crash and told modders to remove the patch first. The Mod Manager also warns about assets older than the April 2020 engine update. Players who come back after a long break sometimes find the unlocker asking to reset its settings and mods still not loading ([Steam thread, May 2025](https://steamcommunity.com/app/861650/discussions/0/597401989046903367/)).

If mods stop working after an update:

1. Update Session Mod Manager to the latest release.
2. Run the Illusory unlocker's patch again against `SessionGame\Binaries\Win64`.
3. Turn off all mods, then turn them back on one at a time to find the one that fails.
4. Check the [Mod Manager's issues FAQ](https://github.com/rodriada000/SessionMapSwitcher/wiki/Issues-FAQ) and the Illusory Discord for re-released maps.

### The Barcelona DLC

Session's **Barcelona** DLC is due on **October 28, 2026** ([shredder.news](https://shredder.news/session-skate-sim-barcelona-dlc/)). Treat its release day like any other game update. If the update changes the game's files, the unlocker patch may need to be applied again, and some maps may need updates from their makers. We'll update this guide once players have tested it.

## Make your own maps

Session is an Unreal Engine 4 game. A planned move to Unreal Engine 5 was cancelled in September 2024 ([Wikipedia](https://en.wikipedia.org/wiki/Session:_Skate_Sim)), so maps are still built in the UE4 editor. The Mod Manager's settings tab has a **Project Watcher** that re-imports your map each time you cook it. The [Session modding history](/history/session/) covers who built the tools, and [Skater XL vs Session](/faq/skater-xl-vs-session/) compares the two sims' mod scenes.
