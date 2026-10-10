---
title: "Skater XL mods: mod.io, XLGearModifier and maps"
description: How to mod Skater XL in 2026. Get maps and gear from the in-game mod.io browser on PC and console, install script mods like XLGearModifier and XXLMod with Unity Mod Manager, and set it up on Steam Deck.
game: skater-xl
level: beginner
order: 15
updated: 2026-10-10
downloads:
  - { label: "Skater XL on mod.io", url: "https://mod.io/g/skaterxl", note: "maps, gear and scripts; also in the game's Mod Browser" }
  - { label: "Unity Mod Manager", url: "https://www.nexusmods.com/site/mods/21", note: "Windows; loads script mods. Always use the latest version" }
  - { label: "XLGearModifier", url: "https://mod.io/g/skaterxl/m/xlgearmodifier", note: "custom clothing and character models" }
  - { label: "XXLMod", url: "https://github.com/DawgVinciSXL/XXLMod", note: "stats and movement tuning" }
  - { label: "Skater XL mapping wiki", url: "https://github.com/SkaterXLModding/skater-xl-mapping-wiki/wiki/Map-Scripting", note: "for map makers" }
---

[Skater XL](/games/skater-xl/) is the skate game with the most official mod support. Easy Day Studios shipped community maps with the 1.0 release in July 2020, and update 1.1 added an in-game **Mod Browser** built on [mod.io](https://mod.io/g/skaterxl) for PC, PlayStation and Xbox ([Steam announcement](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/3917534300074086855)). Script mods, which change how the game plays, are still PC only and need a loader.

## Two kinds of mods

| | Maps and gear | Script mods |
|---|---|---|
| Examples | parks, real-world spots, decks, clothing | XLGearModifier, XXLMod, stats menus |
| Where | in-game Mod Browser, or mod.io | mod.io, GitHub, Nexus |
| Platforms | PC and console | PC only |
| Loader | none | [Unity Mod Manager](https://www.nexusmods.com/site/mods/21) |

## Maps and gear from the Mod Browser

1. Open **Mod Browser** from the game's main menu (or subscribe on [mod.io](https://mod.io/g/skaterxl) with the same account).
2. Subscribe to a map, deck or outfit. It downloads in the background.
3. Pick the map from the map list. Gear shows up in the customization menus.

On PC you can also install a map by hand: unzip it into `Documents\SkaterXL\Maps`. If the game doesn't see maps there, Windows **Controlled Folder Access** may be blocking it. Add `SkaterXL.exe` as an allowed app under Windows Security → Ransomware protection ([Steam thread](https://steamcommunity.com/app/962730/discussions/0/1874001136342107244)).

## Script mods with Unity Mod Manager

Script mods have loaded through newman55's **Unity Mod Manager** (UMM) since early access, and UMM still ships a Skater XL entry in its game list ([issue #112](https://github.com/newman55/unity-mod-manager/issues/112)).

1. Download the latest [Unity Mod Manager](https://www.nexusmods.com/site/mods/21) and unzip it.
2. Run it, pick **Skater XL** from the game list, point it at your Skater XL folder, and click **Install**.
3. Open the **Mods** tab and drag each mod's `.zip` onto it.
4. Start the game. Mods add their menus in game. The hotkey depends on the mod.

Popular script mods:

- **[XLGearModifier (XLGM2)](https://mod.io/g/skaterxl/m/xlgearmodifier):** dynamic clothing, custom character models and unlimited gear customization. Many gear packs on mod.io need it.
- **[XXLMod](https://github.com/DawgVinciSXL/XXLMod):** stats and movement tuning. Install the version that matches your game version, or the camera breaks.
- **XL Menu Mod and Map Patch:** needed for maps that use custom scripts ([mapping wiki](https://github.com/SkaterXLModding/skater-xl-mapping-wiki/wiki/Map-Scripting)).

Before official multiplayer, silentbaws' [XLMultiplayer](https://github.com/silentbaws/XLMultiplayer) script mod let people skate together. It was retired in May 2021 when Easy Day released free official multiplayer ([history](/history/skater-xl/)).

## Steam Deck

Skater XL is **Steam Deck Verified** ([Steam](https://store.steampowered.com/app/962730/)) and rated Gold on [ProtonDB](https://www.protondb.com/app/962730). Maps and gear from the in-game Mod Browser work on the Deck with no extra setup. Unity Mod Manager is a Windows program, so script mods take more work: you run UMM through Proton against the game's install folder, then bind a back button to the mod's menu key.

## When mods stop working

Game updates often switch script mods off. Open Unity Mod Manager and click **Install** again before launching. More fixes are in [Skater XL mods not working](/faq/skater-xl-mods-not-working/).

## Make your own

Maps are built in Unity. Start with the [Skater XL mapping wiki](https://github.com/SkaterXLModding/skater-xl-mapping-wiki/wiki/Map-Scripting), then upload to mod.io so console players can get your map too. [Custom maps in Skater XL and Session](/guides/sim-custom-maps/) covers both sims side by side.
