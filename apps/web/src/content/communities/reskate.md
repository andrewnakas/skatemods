---
title: ReSkate
short: The modding platform for EA's skate. (2025), released October 2, 2026. It runs one pinned Steam build offline with a community runtime, so players get custom maps, mods, a park editor, Steam lobbies and dedicated servers without touching the live game.
games: [skate-2025]
years: 2026–present
scene: active
order: 7
updated: 2026-10-03
people:
  - name: zeex64
    role: Leads ReSkate. Published the source, cut the 1.0 release and its hotfixes, runs the launcher config and news feed, and ported the full Skate 3 map to skate.
    url: https://zeex64.com
    source: https://github.com/Dingo-Shenanigans/ReSkate/releases
  - name: ReGlitched
    role: ReSkate contributor. Landed a crash fix, a launch argument and a new hoodie in the first day after release.
    url: https://github.com/ReGlitched
    source: https://github.com/Dingo-Shenanigans/ReSkate/commits/main
  - name: AyeZeeBB
    role: Works on ReSkate's repositories alongside zeex64.
    source: https://github.com/Dingo-Shenanigans/ReSkateCache
  - name: Yaky
    role: Skater XL and BMX Streets map maker. Shred Cavern, The Lost Loop and Desert Springs were among the first custom maps on ReSkate's Thunderstore.
    source: https://thunderstore.io/c/reskate/p/memori/Desert_Springs/
  - name: SunJay
    role: Published Warehouse Park, a low street camera and the TotalWipeout mod for ReSkate in its first day.
    url: https://thunderstore.io/c/reskate/p/SunJay/Warehouse_Park_By_SunJay/
    source: https://thunderstore.io/c/reskate/p/SunJay/Warehouse_Park_By_SunJay/
  - name: brassy
    role: Ported New San Vanelona, skate 2's city, into skate. as a ReSkate map.
    url: https://thunderstore.io/c/reskate/p/brassy/Skate2Map/
    source: https://thunderstore.io/c/reskate/p/brassy/Skate2Map/
  - name: TeamMeebs
    role: Ported Losal Streets from Skater XL to ReSkate.
    url: https://thunderstore.io/c/reskate/p/TeamMeebs/Losal_Streets/
    source: https://thunderstore.io/c/reskate/p/TeamMeebs/Losal_Streets/
  - name: Nakas
    role: Made the ReSkate Trainer, a physics-tuning and practice menu for ReSkate, and the Gravy Train and DM Jumpline downhill maps.
    url: https://github.com/andrewnakas
    source: https://github.com/andrewnakas/reskate-trainer
  - name: memori
    role: Ported Yaky's Desert Springs from BMX Streets to ReSkate.
    url: https://thunderstore.io/c/reskate/p/memori/Desert_Springs/
    source: https://thunderstore.io/c/reskate/p/memori/Desert_Springs/
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
  - date: 2026-10-02
    title: ReSkate 1.0
    body: The source goes public under the GPL-3.0 and version 1.0.0 ships with the launcher, the runtime and a dedicated server. It brings offline play, 32-player Steam lobbies, a server browser, proximity voice, throwdowns, a park editor and a Mods folder. It supports Steam build 25414733.
    who: zeex64
    source: https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.0
  - date: 2026-10-02
    title: The ReSkate Thunderstore opens
    body: A Thunderstore community for ReSkate goes live, and the launcher can browse and install from it. Thirteen mods go up in the first day, among them the full Skate 3 map, skate 2's New San Vanelona, Losal Streets from Skater XL and three Yaky maps.
    source: https://thunderstore.io/c/reskate/
  - date: 2026-10-03
    title: The first trainer
    body: The ReSkate Trainer adds a TRAINER page to the ReSkate menu with super high ollie, fast flips and spins, never bail, a live editor for the game's physics tuning, presets, practice markers, slow motion and a jump read-out HUD. It's a GPL fork of ReSkate built for the same game build.
    who: Nakas
    source: https://github.com/andrewnakas/reskate-trainer/releases
  - date: 2026-10-02
    title: Hotfixes 1.0.1 and 1.0.2
    body: Within hours the launcher warns when Steam isn't signed in (otherwise PLAY starts offline as "Unknown Player"), and a loading crash on older GPUs like the RX 580 is fixed by sizing map streaming memory to each card's VRAM.
    who: zeex64
    source: https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.2
links:
  - label: ReSkate on GitHub (download and source)
    url: https://github.com/Dingo-Shenanigans/ReSkate
  - label: Browse skate. mods on skatemods
    url: https://skatemods.com/reskate/
  - label: ReSkate mods on Thunderstore
    url: https://thunderstore.io/c/reskate/
  - label: Dedicated server manual
    url: https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Server/README.txt
  - label: ReSkate Discord
    url: https://discord.gg/Tkd5D2Y6EX
  - label: 'Guide: play skate. with ReSkate'
    url: https://skatemods.com/guides/play-skate-with-reskate/
  - label: 'Launch writeup on the skatemods blog'
    url: https://skatemods.com/blog/reskate-launch/
---

## A way around the live service

[skate.](/games/skate-2025/) is the hardest skate game to mod. It's online-only, free-to-play, protected by [EA Javelin anti-cheat](https://www.ea.com/news/ea-javelin-anticheat-2026-update), and updated constantly, and EA's [user agreement](https://www.ea.com/legal/user-agreement) treats mods as unauthorized third-party programs. ReSkate doesn't try to mod that live game. Its launcher checks your Steam install against one specific build of skate. (Steam build `25414733`), downloads exactly that build with DepotDownloader if it has to, and loads a community runtime, `ReSkate.dll`, on top. Every mod targets the same fixed version of the game, and nobody connects to EA's servers.

The game's own settings and saves live in a separate folder from the normal game's, and your skater, outfits, unlocks and progress are kept on your PC ([README](https://github.com/Dingo-Shenanigans/ReSkate#readme)).

## 1.0: October 2, 2026

ReSkate went public on **October 2, 2026**. The [source](https://github.com/Dingo-Shenanigans/ReSkate) was published under the **GPL-3.0** that morning, and **v1.0.0** followed in the afternoon with three programs:

- **`ReSkateLauncher.exe`** checks for ReSkate updates, verifies or downloads the supported game build, and has a mod manager with a Thunderstore browser.
- **`ReSkate.dll`** is the runtime the launcher loads into the game.
- **`ReSkateServer.exe`** is a headless dedicated server that needs neither the game nor Steam installed.

The launch announcement on the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX) called it "a modding platform for skate.: play offline, skate custom maps, host lobbies with your friends and build your own spots, parks and skins." By that night the server had nearly 2,900 members, and by the next morning more than 3,400. The announcement also answered the most-asked question: can you get banned? The project's FAQ says you can't. A Linux fix was promised for the following day.

## What's in it

From the [README](https://github.com/Dingo-Shenanigans/ReSkate#readme):

- **Offline play.** No EA servers. The game runs even with Steam closed.
- **Multiplayer.** Steam lobbies for up to 32 players (public, or joined with a code, optionally with a password), dedicated servers in an in-game browser, proximity voice and text chat with emotes, parties, throwdowns (Jam, Spot Battle and S.K.A.T.E.) and co-op challenges.
- **The ReSkate menu (Insert).** Map and fast travel; world controls for time of day, population, district levels and rotating parks; skater options like first person, noclip and boosts.
- **The Park Editor.** Place, move and save objects with a freecam, snapping and undo. Parks save as mods.
- **Mods.** Drop a mod into `Mods/` and it's merged into the game at launch. Mods can add custom maps, loading screens, cosmetics and scripts, and most changes apply without a restart.
- **A console (~)** with a `help` command.

## How mods work

A ReSkate mod is a folder under `Mods\` beside `Skate.exe`, with load order and on/off state in `Mods\mods.json`. A map mod carries Frostbite data (`layout.toc`, CAS files and a level TOC) and a `reskate-levels.json` that registers the level and its start points. Mods built with **ReSkate Studio**, the project's map tool, are stamped with the hash of the `Skate.exe` they were built for. When ReSkate moves to a new game build, mods made for the old one are left out with a message instead of corrupting the merge ([source](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Engine/Vfs/mod_list.h)).

Mods are distributed through a [Thunderstore community](https://thunderstore.io/c/reskate/), which the launcher browses directly. In the first day it collected thirteen:

| Mod | By | What it is |
|---|---|---|
| [Full Skate 3 Map](https://thunderstore.io/c/reskate/p/zeex64/Full_Skate_3_Map/) | zeex64 | Port Carverton, the whole Skate 3 city, in skate. |
| [Skate 2 Map](https://thunderstore.io/c/reskate/p/brassy/Skate2Map/) | brassy | New San Vanelona from skate 2 |
| [Losal Streets](https://thunderstore.io/c/reskate/p/TeamMeebs/Losal_Streets/) | TeamMeebs | A street map from Skater XL |
| [Desert Springs](https://thunderstore.io/c/reskate/p/memori/Desert_Springs/) | memori | Yaky's map, ported from BMX Streets |
| [Shred Cavern](https://thunderstore.io/c/reskate/p/zeex64/Shred_Cavern_By_Yaky/), [The Lost Loop](https://thunderstore.io/c/reskate/p/zeex64/The_Lost_Loop_By_Yaky/) | Yaky (uploaded by zeex64) | Original maps |
| [Warehouse Park](https://thunderstore.io/c/reskate/p/SunJay/Warehouse_Park_By_SunJay/) | SunJay | An indoor park |
| [DM Jumpline](https://thunderstore.io/c/reskate/p/Nakas/DM_Jumpline/) | Nakas | A downhill jump line, early work in progress |
| [Low Cam](https://thunderstore.io/c/reskate/p/SunJayTeam/SunJays_Low_Cam/), [TotalWipeout](https://thunderstore.io/c/reskate/p/SunJay/SunJays_TotalWipeout_V1/) | SunJay | A lower camera for street skating; a wipeout mod |
| [gm_mcdonalds](https://thunderstore.io/c/reskate/p/crowkrow/gm_mcdonalds/), [Bo2 Grind](https://thunderstore.io/c/reskate/p/relsmodding/Bo2_Grind/) | crowkrow, relsmodding | Maps from Garry's Mod and Black Ops 2 |
| [Supreme Box Tee](https://thunderstore.io/c/reskate/p/akia47/SupremeBoxTee/) | akia47 | A custom cosmetic |

The list says a lot about who showed up. Skate 3, skate 2, Skater XL and BMX Streets maps all landed in skate. on day one, made by people from the [Skate 3](/history/skate-3/) and [Skater XL](/history/skater-xl/) scenes.

## Trainers and tools

The day after launch, Nakas released the [ReSkate Trainer](https://github.com/andrewnakas/reskate-trainer), a fork of ReSkate with a **TRAINER** page in the Insert menu. It has one-click presets (super high ollie, fast flips, fast spins, never bail, and stackable ones like Mega Pop and Sticky Grinds), a searchable editor for every value in the game's physics tuning, five practice marker slots per map with return-after-bail, slow motion, and a read-out after every jump. A pass over the game's code found which tuning values skate. actually reads (about six in ten), and the editor hides the rest by default. It replaces ReSkate's own DLL and launcher, so it's installed by hand, and it follows ReSkate's session rules online. Read more in [our post](/blog/reskate-trainer/).

## Dedicated servers

`ReSkateServer.exe` signs in to Steam anonymously and connects players through Steam's relay network, so no ports need opening. It handles up to 249 players, custom maps, player votes (map, kick, time of day), parties, admins and bans, and keeps itself on the latest release. It also polices fair play: a speed check catches speedhacks, a score check flags mods that change trick scoring or physics and takes those players out of throwdowns, and `enforce_tuning` keeps everyone on the game's own physics. The [server manual](https://github.com/Dingo-Shenanigans/ReSkate/blob/main/Server/README.txt) covers every setting, and [our guide](/guides/host-a-reskate-server/) walks through setting one up.

## The first day

The first fixes came within hours. **1.0.1** made the launcher warn when Steam isn't open or signed in, because PLAY then starts offline as "Unknown Player" with no multiplayer. **1.0.2** fixed a crash while loading on older graphics cards such as the RX 580 by sizing map streaming memory to each card's VRAM, and trimmed per-frame work so busy servers run smoother ([v1.0.2](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.2)). **[1.0.3](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.3)** followed after midnight with a crash fix and a new launch argument from ReGlitched. The dedicated server updates itself, so servers picked the fixes up on their own.

## Where it came from

The groundwork happened around the **Dumbads & SunJays Skate3 Modding Discord** ([invite](https://discord.com/invite/AgDEQFR2Jj)), the server where Skate 3's world format became writable. Footage of [custom maps and time-of-day changes](https://www.youtube.com/watch?v=ubEv_Pkk4OU) circulated there and on YouTube in September 2026. ReSkate now has [its own Discord](https://discord.gg/Tkd5D2Y6EX), with channels for bug reports, mod help and Thunderstore releases.

## The lines it draws

ReSkate calls itself a fan project, "not affiliated with or endorsed by Electronic Arts or Full Circle", and you need your own copy of skate. on Steam. Its news feed says it's "NOT a replacement for the live game, a way to get paid cosmetics, or a place for leaks" ([source](https://github.com/Dingo-Shenanigans/ReSkateCache)). The GPL covers ReSkate's own code, not the game or anything from it, and it still runs EA's client, so EA's terms still apply. The README also asks you to install only mods you trust, because custom scripts can run code.

If you're involved and something here is wrong or missing, [fix it on GitHub](https://github.com/andrewnakas/skatemods/edit/main/apps/web/src/content/communities/reskate.md).
