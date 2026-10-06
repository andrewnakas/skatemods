---
title: Mod Tony Hawk's Pro Skater 1+2 and 3+4 on PC
description: Install .pak mods in the Unreal remakes, find the good ones, and open the game files with FModel if you want to make your own.
game: thps-1-2
level: beginner
order: 13
updated: 2026-10-06
downloads:
  - { label: "Nexus Mods: THPS 1+2", url: "https://www.nexusmods.com/games/tonyhawksproskater1and2/mods", note: "117 mods" }
  - { label: "Nexus Mods: THPS 3+4", url: "https://www.nexusmods.com/games/tonyhawksproskater34/mods", note: "63 mods" }
  - { label: "FModel", url: "https://github.com/4sval/FModel/releases/latest", note: "browse and export the game's assets" }
  - { label: "repak", url: "https://github.com/trumank/repak/releases/latest", note: "pack your own .pak files" }
---

Both remakes run on Unreal Engine 4. [CUE4Parse](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Versions/EGame.cs), the library behind FModel, lists *THPS 1+2* (Vicarious Visions, 2020) as **UE 4.24** and *THPS 3+4* (Iron Galaxy, 2025) as **UE 4.27**. Mods for both are Unreal `.pak` files that load on top of the game's own. Mods are PC only. On console, the way to make something is Create-A-Park.

## Install a mod

1. Find the game folder. On Steam it's `steamapps\common\THPS12` for 1+2 and `steamapps\common\THPS34` for 3+4.
2. Go to `Base\Content\Paks` and create a folder called `~mods` if it isn't there.
3. Put the mod's `.pak` file in `~mods`. Subfolders are fine: [THPSPro](/history/thps-pro/) installs into `~mods\THPSPRO\`.
4. Start the game. To remove a mod, delete its `.pak`.

Mod files end in `_P`, often as `_99_P.pak`. That's Unreal's naming for a patch pak, which loads after the game's own files and overrides them. Don't rename the files. Character swaps replace a specific skater or Create-a-Skater item, so don't install two mods that replace the same one.

These steps come from the readmes of the most-downloaded mods, such as the [PlayStation Button Layout](https://www.nexusmods.com/tonyhawksproskater1and2/mods/51) for 1+2 and [Lara Croft](https://www.nexusmods.com/tonyhawksproskater34/mods/44) for 3+4. Neither game needs a mod loader, a signature bypass or UE4SS, and Vortex doesn't support them, so you install mods by hand.

### Other stores

THPS 1+2 came out on the Epic Games Store and Microsoft Store in 2020, and on [Steam](https://store.steampowered.com/app/2395210/) in October 2023. Mods made before the Steam release still work: THPSPro says it works on the Steam and Microsoft Store versions too. Readmes written for the Epic version use a `TonyHawksProSkater\Base\Content\Paks` folder. THPS 3+4 is on Steam, Battle.net and Game Pass, not Epic. [Pure Xbox](https://www.purexbox.com/news/2025/07/thps-3plus4-has-some-amazing-mods-if-youre-playing-on-pc) found that most mods work on the Game Pass version, but some don't.

## What's worth installing

Download counts are from Nexus Mods on October 6, 2026.

| Game | Mod | By | What it does |
|---|---|---|---|
| 1+2 | [THPSPro](https://www.nexusmods.com/tonyhawksproskater1and2/mods/121) | bAstimc | Levels from THPS3, THPS4, THUG, THUG2, Project 8 and THAW, level options, a free-roam camera and an optional LAN/VPN online mode. Version 10.2. |
| 3+4 | [THPSPro](https://www.nexusmods.com/tonyhawksproskater34/mods/1) | bAstimc | Custom restarts, free-roam camera, lost levels and goals, buttslaps and boostplants, classic skaters. |
| Both | Fast Launch ([1+2](https://www.nexusmods.com/tonyhawksproskater1and2/mods/15), [3+4](https://www.nexusmods.com/tonyhawksproskater34/mods/2)) | instanity | Skips the intro videos. The most-downloaded 3+4 mod, with 1,860 downloads. |
| 1+2 | [PlayStation Button Layout](https://www.nexusmods.com/tonyhawksproskater1and2/mods/51) | geefour | PlayStation button prompts. |
| 1+2 | [TAI Tweaks and Improvements](https://www.nexusmods.com/tonyhawksproskater1and2/mods/101) | xowny | Engine settings for performance and graphics. |
| 1+2 | [Dante](https://www.nexusmods.com/tonyhawksproskater1and2/mods/7) | Dodylectable | Devil May Cry 5's Dante as a Create-a-Skater head. The most-downloaded 1+2 mod, with 2,719 downloads. |
| 3+4 | [Lara Croft](https://www.nexusmods.com/tonyhawksproskater34/mods/44) | Dodylectable | Replaces Lizzie Armanto. |
| 3+4 | [Mask Pack](https://www.nexusmods.com/tonyhawksproskater34/mods/25) | Gnarlybro | 24 masks for Create-a-Skater. |

Most of the rest are crossover characters, like Master Chief, Duke Nukem, Kazuma Kiryu and CJ, plus save files with everything unlocked.

<div class="callout">

**Get mods from Nexus or the authors' own pages.** GitHub search turns up repositories with names like "THPS 1 2 mods free download" or "unlimited EXP". They're spam, and some are probably malware. Real remake mods are `.pak` files, never an `.exe` installer.

</div>

## Online

Activision's [terms of use](https://www.activision.com/legal/terms-of-use) forbid using "mods or any other unauthorized third-party software in connection with the Product". We found no anti-cheat listed for either game and no reports of bans for mods, but that's not a promise. THPS 3+4 has eight-player cross-platform online through an Activision account. THPSPro for 3+4 warns "USE AT OWN RISK! – especially online with Skater Mods". THPSPro for 1+2 has its own online pak, so remove `THPSPROonline_99_P.pak` to go back to official online. Remove cosmetic mods before you play online with strangers. More in [Can I use mods online in THPS 1+2 or 3+4?](/faq/thps-remake-mods-online/)

## Make your own

- **Look inside the game.** [FModel](https://github.com/4sval/FModel/releases/latest) browses and exports the assets in both games. Their paks use a custom encryption rather than a normal AES key. Spiritovod reverse-engineered it, and CUE4Parse [handles it automatically](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/GameTypes/THPS/Encryption/Aes/THPS12.cs) once you pick the game. FModel added 1+2 in [version 4.4.4.0](https://github.com/4sval/FModel/releases/tag/4.4.4.0).
- **Cook your changes.** Build replacement assets in the matching Unreal Engine version, 4.24 or 4.27, with the same names and paths as the originals.
- **Pack them.** Use UnrealPak from the engine or [repak](https://github.com/trumank/repak/releases/latest) to make an unencrypted pak, and name it with a `_P` suffix. The [THPS toolkit](https://www.nexusmods.com/tonyhawksproskater1and2/mods/128) on Nexus wraps UnrealPak for 1+2.
- **Ask around.** The [Tony Hawk Modding](https://discord.gg/FhNe7R6uh7) Discord is linked from CrazyPotato's 2022 tutorial, [How to work UE](https://www.youtube.com/watch?v=mtkOpsmCBNw). bAstimc's [THPSPro Discord](https://discord.thpspro.com) is the other place remake modders gather.

For the original Neversoft games on PC, see [Get started with THUG Pro, reTHAWed and PARTYMOD](/guides/thug-pro-and-partymod/).
