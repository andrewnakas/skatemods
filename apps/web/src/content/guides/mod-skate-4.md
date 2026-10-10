---
title: "How to mod skate. (Skate 4) with ReSkate"
description: How to mod EA's skate. (2025), the game players call Skate 4, on PC. Install ReSkate, add maps, boards, clothing and music from Thunderstore, then make your own mod and package it for upload. Covers what a mod folder holds and what the rules allow.
game: skate-2025
level: beginner
order: 8
updated: 2026-10-10
downloads:
  - { label: "ReSkate (latest release)", url: "https://github.com/Dingo-Shenanigans/ReSkate/releases/latest", note: "ReSkate-<version>.zip, the launcher and runtime" }
  - { label: "skate. on Steam", url: "https://store.steampowered.com/app/3354750/", note: "free-to-play; add it to your library" }
  - { label: "ReSkate mods on Thunderstore", url: "https://thunderstore.io/c/reskate/", note: "where mods are published" }
  - { label: "Thunderstore package format", url: "https://wiki.thunderstore.io/mods/creating-a-package", note: "manifest.json, icon.png and README.md" }
  - { label: "Blender", url: "https://www.blender.org/download/", note: "for making maps" }
---

You mod skate. with [ReSkate](/history/reskate/), a free, open-source platform that runs one fixed Steam build of the game offline and merges mods into it. The live game, with EA's servers and anti-cheat, can't be modded. ReSkate works on Windows, and on Linux and Steam Deck through Proton. It doesn't work on consoles ([why](/faq/reskate-ps5-xbox/)).

## Install ReSkate

1. Add [skate.](https://store.steampowered.com/app/3354750/) to your Steam library. It's free.
2. Download `ReSkate-<version>.zip` from [ReSkate's GitHub releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest). That's the only official download ([all links](/faq/reskate-download-links/)).
3. Extract `ReSkateLauncher.exe` and `ReSkate.dll` beside `Skate.exe`, or into an empty folder where the launcher installs the game (about 14 GB).
4. Run `ReSkateLauncher.exe` and press **PLAY**.

The full walkthrough, with controls, multiplayer and fixes, is [download, install and play](/guides/play-skate-with-reskate/).

## Install mods

Open the launcher's **MODS** page. It browses the [ReSkate Thunderstore](https://thunderstore.io/c/reskate/), and one click installs a mod and anything it depends on. You can also drag a mod's `.zip` onto the launcher window. In game, press **Insert** and open the **MODS** tab to switch mods on and off.

On October 10, 2026, the ReSkate Thunderstore had 1,457 mods. Browse them here by type:

- [Custom maps](/reskate/maps/): the Skate 3 city, skate 2's New San Vanelona, Skater XL spots and original parks
- [Board graphics](/reskate/boards/): decks, grip and wheels
- [Cosmetics](/reskate/cosmetics/): shoes and clothing
- [Music](/reskate/music/): soundtracks, including Skate 3's, as stations in the game's music screen
- [Modpacks](/reskate/modpacks/): bundles you install in one go

Only install mods you trust. Map and cosmetic mods change game data, and script mods can run code.

## What a mod is

Every mod is a folder in `Mods\` beside `Skate.exe`. `Mods\mods.json` keeps the load order and which mods are on ([README](https://github.com/Dingo-Shenanigans/ReSkate#where-things-are)). When you press PLAY, the launcher merges every enabled mod into the game's data. If a mod was made for a different game build, or can't be merged cleanly, it's left out with a message and the rest still load.

What's in the folder depends on the kind of mod:

- **Maps** carry Frostbite data (`layout.toc`, CAS files and a level TOC) and a `reskate-levels.json` that registers the level and its start points, so it shows up in the ReSkate menu's level list ([source](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Engine/Vfs/mod_list.h)).
- **Cosmetics and boards** carry the same kind of Frostbite data for the items they add. A board package on Thunderstore, for example, holds `layout.toc`, an `items.toc`, a `cas_01.cas` and its icon and manifest.
- **Music** mods add songs and can give them a playlist and cover art with a `reskate-music.json` (below).

Mods built with **ReSkate Studio** include a `.reskate-studio-patch` file that records which `Skate.exe` they were built for.

## Make a map

Maps are modelled in Blender and compiled with [ReSkate Studio](/faq/reskate-studio/), the ReSkate team's map tool. It has a Blender add-on for spawn points, grind curves and collision, and a compiler, `reskate_cli`. Studio is distributed in the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX), not on GitHub.

Community tools help with the parts that are easy to get wrong:

- [Skaterino](https://github.com/Rinoversal/Skaterino) checks scale, drops and rail heights against skate.'s real skater limits before you build.
- [Porterino](https://github.com/Rinoversal/Porterino) finds holes, ramp lips and bad bowl transitions, and rebuilds and installs the map in one click.
- [ReSkate Map Creator](https://github.com/jonigiuro/ReSkate-Map-Creator) places kit pieces and grind splines without learning Blender, then hands a `.blend` to Studio.

Map makers trade help in the ReSkate Discord's mod channels.

## Add a playlist to a music mod

A mod that adds songs can give them their own playlist in the game's music screen. Put a `reskate-music.json` in the mod's folder ([README](https://github.com/Dingo-Shenanigans/ReSkate#mods)):

```json
{
  "schema": 1,
  "playlists": [{"name": "My Playlist", "artwork": "artwork/playlist.png", "songs": ["Artist - Title"]}],
  "song_artwork": {"Artist - Title": "artwork/track.png"}
}
```

Each song is written as its artist and title, exactly as the mod registers them, joined by ` - `. Artwork is optional: PNGs up to 2048×2048 and 4 MiB, with paths relative to the mod folder. Since 2.0, songs from mods get their own **Mods** shelf above Featured.

## Package it for Thunderstore

A Thunderstore package is a `.zip` with three files at its root, next to your mod's files ([Thunderstore wiki](https://wiki.thunderstore.io/mods/creating-a-package)):

| File | What it needs |
|---|---|
| `manifest.json` | `name` (letters, numbers and underscores, no spaces), `version_number` (like `1.0.0`), `website_url` (empty string if none), `description` (up to 250 characters) and `dependencies` |
| `icon.png` | Exactly 256×256 pixels |
| `README.md` | Shown on your mod's page, here and on Thunderstore |

A real manifest from a ReSkate board mod:

```json
{
    "name": "Hook_Ups_Zero_Suit_Samus",
    "version_number": "1.0.0",
    "website_url": "",
    "description": "Zero Suit Samus board, from Hook-Ups",
    "dependencies": []
}
```

Dependencies are written as `Team-Package-1.0.0`, and the launcher installs them with your mod. Upload the zip from the [ReSkate Thunderstore](https://thunderstore.io/c/reskate/) while signed in, and pick categories (Maps, Cosmetics, Skateboards, Audio and so on). Thunderstore also has an "AI Generated" tag for mods made with AI. Once it's up, your mod appears in every player's launcher and gets a page on [skatemods](/reskate/) at the next site update.

Write a README that says what the mod adds, where it shows up in game, and who made the original if it's a port. Players search by name, so name the map or brand in the title.

## What the rules allow

- **Fine:** maps you made or have permission to port, original clothing and board graphics, music mods, camera and gameplay tweaks.
- **Not fine:** copies of EA's paid store items. Since 1.1.2 ReSkate refuses to load mods that add store items under new names. Leaked or unreleased content, and mods sold using EA's assets, are also out. Full Circle drew the same lines on October 9, 2026 ([details](/faq/reskate-cosmetics-policy/)).
- **On servers:** mods that change trick scoring or skater physics are flagged by dedicated servers and taken out of throwdowns. Big-head style body mods only show on the owner's screen at full size ([server rules](/guides/host-a-reskate-server/#fair-play)).

Credit the original creator when you port a map from another game, and ask them first. The Skate 3, Skater XL and BMX Streets communities behind the [first ReSkate maps](/history/reskate/#how-mods-work) worked that way.
