---
title: Mod Skate 3 on RPCS3
description: Where Skate 3 files live in RPCS3, how to install DLC and custom maps, texture mods, and how to get online again.
game: skate-3
level: intermediate
order: 4
updated: 2026-10-01
---

RPCS3 is where most Skate 3 custom content was made and played for years. Use it if you play the PS3 version.

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

[Skate 3 Texture Tools](https://github.com/Shellywell123/Skate-3-Texture-Tools) automates the whole loop: it extracts `.big` archives, converts `.psg` textures to `.dds` (through Noesis) for editing, and repacks and installs them. It covers character creation items, Park Creator objects, menus, skies and ground, and works on Xenia too.

## Back online

EA's servers are unreliable, but the community [Skate 3 Blaze Server](https://github.com/skate6743/Skate3BlazeServer) emulates EA's Blaze backend for RPCS3. It brings back matchmaking, friend invites and **Skate.Park upload and download**, with relay servers instead of peer-to-peer. Use the public server or host your own. It doesn't support Xenia or real PS3s.

## Moving to the native PC port?

Your PS3 maps can come with you: [convert them](/guides/convert-ps3-maps/).
