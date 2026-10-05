---
title: "ReSkate's first three days: eleven releases, 216 mods and a Linux server"
description: Between October 2 and 5, ReSkate went from 1.0.0 to 1.1.1. It gained a native Linux server, a built-in trainer, radio stations, room for huge maps and a global ban list. Its Thunderstore passed 200 mods and 326,000 downloads, and its Discord grew past 19,000.
date: 2026-10-05
author: skatemods
featured: true
games: [skate-2025]
related: [history/reskate, guides/play-skate-with-reskate, guides/host-a-reskate-server, blog/reskate-launch]
---

When [ReSkate 1.0 came out](/blog/reskate-launch/) on October 2, its Discord had about 2,900 people and its Thunderstore had thirteen mods. Three days later the Discord has **19,182 members** ([invite API](https://discord.com/api/v9/invites/Tkd5D2Y6EX?with_counts=true), October 5), the [Thunderstore](https://thunderstore.io/c/reskate/) lists **216 mods** with more than **326,000 downloads**, and the [GitHub repository](https://github.com/Dingo-Shenanigans/ReSkate) has 339 stars and 48 forks. In between came eleven releases. Here's what changed, release by release.

## The fixes people asked for

Most of the first releases answer specific reports, and the commit messages say who reported what.

- **[1.0.4](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.4)** made PLAY merge mods *before* the game starts. Before, a mod the merge couldn't use was dropped silently, and the game started without it after a three-minute loading screen. Now the launcher names it. Settings changed in game stick (the camera used to jump back to high on leaving the menu), the mod manager moved into a bigger window, and Steam is detected under **Proton**, the first step toward Linux players getting online.
- **1.0.5 and 1.0.6** fixed a player who couldn't launch because an invisible Unicode character (a left-to-right mark) was in a folder name, and a blank launcher window on a PC with a GT 1030 that drew on the Intel chip beside it.
- **[1.0.7](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.7)** fixed replay exports that played two to three times too fast and a crash with several cosmetic mods installed. Modded cosmetics now show as **Collector**, the game's own sixth rarity, "without claiming to be Legendary".
- **[1.1.0](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.1.0)** turned "Cannot open file for SHA-256" into an error that names the file and suggests an antivirus exclusion, which was the cause nearly every time.

## A native Linux server

Within a day of launch, juan ([jnslol](https://github.com/jnslol)) had ported the dedicated server's core to Linux. [Pull request #6](https://github.com/Dingo-Shenanigans/ReSkate/pull/6) added a native x86_64 build, a script that fetches Valve's Steam libraries, a systemd unit and CI builds. It shipped in **[1.0.8](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.8)** as `ReSkateServer-Linux-<version>.tar.gz`. It runs with no Wine and no game install, and the archive includes the Steam libraries. xThrasherrr followed with fixes for it, including one that keeps the server alive when its output pipe closes. Community wrappers came almost as fast: [ReSkate Manager](https://github.com/xThrasherrr/reskate-manager), a web panel for running servers, and a [Docker image](https://github.com/dudedankdave/docker-reskate-server). Our [server guide](/guides/host-a-reskate-server/#on-linux) covers the Linux build.

## The trainer goes upstream

**[1.0.9](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.9)** merged the [ReSkate Trainer](/blog/reskate-trainer/), which had started as a fork the day after launch. Every player now has a TRAINER page in the Insert menu, with presets as dials, live physics tuning, practice markers and a jump read-out. Upstream review made it quiet by default, so a player who never opens it pays nothing for it. It also closed a gap in multiplayer: only the physics tuning asset used to travel from host to guest, so a host could push, sprint or jump further than the guests held to the game's own values. Now the host's whole setup reaches its guests.

The same release brought the game's licensed **radio stations** into the music screen, with names and cover art read from the content cache, and let mods add playlists with a `reskate-music.json`. DeckardDetribine wrote both. It also added lobby **parties** (invite, kick, promote, `/p` chat), multi-select and sizes in **MY MODS**, clearer reasons when hosting or joining is refused, and a round of hardening against spoofed and disruptive multiplayer traffic.

## Bigger maps

Custom maps got very big very fast. Someone exported 41,000 parts of GTA IV, and the game crashed on load. Each collision part gets its own physics body, and the stock world allocates 8,200. WackyHcky's patch in **1.1.0** raises the limit to 65,000 and scales the related pools with it. It checks the game's bytes before hooking, like the rest of ReSkate. The same author has since put the whole of GTA III and Vice City on Thunderstore.

## Tags and global bans

**[1.1.1](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.1.1)** moved the developer list off a hard-coded table and onto a backend at `api.reskate.dev`. It also added **Creator** and **Homie** tags, colours for each equipped item (animated, gradient or solid), and a **global ban list**. Lobby hosts and dedicated servers now turn away players the ReSkate team has banned from multiplayer. Server owners can opt out with `"global_bans": false`, and a server's own bans apply either way. The project's FAQ still says EA can't ban you for using ReSkate. This is the ReSkate team's own moderation.

## What people are making

The [mod list](/reskate/) has moved well past the first day's Skate 3 and Skater XL ports. Five mods passed 10,000 downloads: zeex64's Full Skate 3 Map (18,700), B-Row's South Florida from Skater XL, ported by AltDoug, brassy's New San Vanelona, Prayboy's Skate 3 soundtrack as a radio station, and relsmodding's Black Ops 2 Grind. Below them are real parks like forestmouse's SLS Hangar and DC Plaza Saint Petersburg, THUG2's Los Angeles, Bully's Bullworth, Counter-Strike's Dust2, Nuke and Overpass, and a Minecraft tutorial world. The cosmetics run from whole Carhartt and Nike SB collections to one pack of 328 colourways across 28 skate brands.

Ten of the 216 are tagged "AI Generated" on Thunderstore. Several authors say their conversions and cosmetics were built with **ReSkate Studio**. ReSkate's own README has an AI disclosure too.

## What's still broken

Moving this fast has costs, and the [issue tracker](https://github.com/Dingo-Shenanigans/ReSkate/issues) shows them. Windows Defender started flagging the download as `Behavior:Win32/DefenseEvasion.A!ml`, a machine-learning guess set off by a DLL loading into a game. Some board-graphics and map mods crash on 1.1.0 until they're reinstalled. On Linux under Proton, custom maps and servers running them hang on the loading screen since 1.0.8. Our [guide](/guides/play-skate-with-reskate/#known-issues-111) lists the workarounds.

## Where to start

- New to it? [Play skate. with ReSkate](/guides/play-skate-with-reskate/) is up to date for 1.1.1, including Linux.
- Hosting? [Host a ReSkate server](/guides/host-a-reskate-server/) covers Windows, Linux and global bans.
- The full story, with everyone who built it, is on the [ReSkate history page](/history/reskate/).

All figures are as of October 5, 2026.
