---
title: "Skate 3 on RPCS3: settings, patches and custom maps"
description: The RPCS3 settings Skate 3 needs, game patches and the 1.05 update, where its files live, how to install DLC, custom maps and texture mods, and how to get online again.
game: skate-3
level: intermediate
order: 4
updated: 2026-10-10
downloads:
  - { label: "RPCS3", url: "https://rpcs3.net/download", note: "the PS3 emulator" }
  - { label: "RPCS3 quickstart", url: "https://rpcs3.net/quickstart", note: "firmware and dumping your own disc" }
  - { label: "Skate 3 Texture Tools", url: "https://github.com/Shellywell123/Skate-3-Texture-Tools", note: "for texture mods" }
  - { label: "Skate 3 Blaze Server", url: "https://github.com/skate6743/Skate3BlazeServer", note: "online play on RPCS3" }
---

[RPCS3](https://rpcs3.net/download) is where most Skate 3 custom content was made and played for years. Use it if you play the PS3 version. Its [quickstart](https://rpcs3.net/quickstart) covers the firmware and dumping your own disc.

## Settings

Make a per-game config: right-click Skate 3 in RPCS3's game list and choose **Create Custom Configuration** (or **Change Custom Configuration**). The [Blaze server README](https://github.com/skate6743/Skate3BlazeServer) gives the CPU settings the community plays on:

- **CPU → XFloat Accuracy:** Approximate
- **CPU → Enable SPU loop detection:** off

These matter most online. "Any setting that affects physics that you have set to different value will cause you to desync out of all lobbies immediately," so everyone in a lobby needs the same values. The same goes for physics mods from the Native Menu.

Install the **1.05 game update** too: drag the update `.pkg` onto RPCS3's game list. The list's Version column shows 1.00 if you're missing it, and players still on 1.00 are put in separate lobbies from 1.05 players.

## Patches

RPCS3's **Patch Manager** (**Manage → Game Patches**) downloads community patches and lists the ones available for your game ID. Turn on only what you need, and turn patches off before reporting a bug. tuukkas made widescreen patches for Skate 3 on RPCS3 and Xenia ([Skate 3 history](/history/skate-3/)).

## Find your game folder

Everything lives under RPCS3's `dev_hdd0`:

| Region | Game ID | Folder |
|---|---|---|
| US | BLUS30464 | `dev_hdd0/game/BLUS30464/USRDIR/` |
| EU | BLES00760 | `dev_hdd0/game/BLES00760/USRDIR/` |

**Back up `dev_hdd0` before you change anything.** One wrong overwrite can mean reinstalling.

## DLC and custom maps

Custom PS3 maps usually take over a DLC park slot. Copy the map's files into your game's `USRDIR` as the map's readme says. If the game keeps loading old data, delete the cached install folder (for example `dev_hdd0/game/BLES00760_INSTALL`) and launch again.

## Texture mods

[Skate 3 Texture Tools](https://github.com/Shellywell123/Skate-3-Texture-Tools) automates the whole loop: it extracts `.big` archives, converts `.psg` textures to `.dds` (through [Noesis](https://richwhitehouse.com/index.php?content=inc_projects.php&showproject=91)) for editing, and repacks and installs them. It covers character creation items, Park Creator objects, menus, skies and ground, and works on [Xenia](/faq/xenia-basics/) too.

## Back online

EA's servers are unreliable, but the community [Skate 3 Blaze Server](https://github.com/skate6743/Skate3BlazeServer) emulates EA's Blaze backend for RPCS3. It brings back matchmaking, friend invites and **Skate.Park upload and download**, with relay servers instead of peer-to-peer. Use the public server or host your own. It doesn't support Xenia or real PS3s.

## Moving to the native PC port?

Your PS3 maps can come with you: [convert them](/guides/convert-ps3-maps/).
