---
title: "ReSkate 2.0: first person, Hall of Meat, servers"
description: ReSkate went from 1.1.1 to 2.0.2 between October 5 and 9, 2026. It added a steadier first-person camera, Skate 3's Hall of Meat, random parks, controller and Steam Deck support in the launcher, server map pools, polls and login tokens, and it now blocks the game's calls to EA.
date: 2026-10-10
author: skatemods
featured: true
games: [skate-2025]
related: [guides/play-skate-with-reskate, guides/host-a-reskate-server, history/reskate, faq/reskate-download-links, blog/reskate-first-three-days]
---

ReSkate **2.0.0** came out on **October 9, 2026**, a week after 1.0. Two hotfixes followed the same day, so the current version is **[2.0.2](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v2.0.2)**. The launcher updates itself, and dedicated servers install new releases once they're empty. If you haven't opened ReSkate since the weekend, launching it is enough.

The releases have no notes, so this post is built from the [161 commits between 1.1.1 and 2.0.2](https://github.com/Dingo-Shenanigans/ReSkate/compare/v1.1.1...v2.0.2). The game build hasn't changed: ReSkate still runs Steam build `25414733` ([README](https://github.com/Dingo-Shenanigans/ReSkate#getting-started)).

## Update both sides

Four times this week a release changed the multiplayer protocol: version 43 in 1.1.5, 44 in 1.1.7, 45 in 2.0.0 and 46 in 2.0.2. The 1.1.5 commit says "builds before this cannot join sessions with builds after it" ([07fef38](https://github.com/Dingo-Shenanigans/ReSkate/commit/07fef3820d)). If you can't join a server, check that you and the server are on the same version.

## For players

- **A steadier first-person camera.** First person used to copy every nod and wobble of the skater's head. JusSkates's rewrite keeps the horizon level and smooths the view without lagging in spins. An optional setting hands the camera back to third person while you're off the board ([#33](https://github.com/Dingo-Shenanigans/ReSkate/pull/33)).
- **Hall of Meat.** Krischan-Klug brought back Skate 3's bail screen. When you bail, the bones you hurt light up through the body, yellow for bruised and red for broken, with a Meat card for hits, broken bones, airtime and fall height. It draws only skate.'s own assets from your install. It's off by default: switch it on under Custom Stuff → Player or with `hallofmeat 1` ([#137](https://github.com/Dingo-Shenanigans/ReSkate/pull/137)). No Bail stops the bails it scores.
- **Random parks.** ComputerKWasTaken added **Load Random Parks**, which picks a layout for each of San Vansterdam's three park lots, and an optional roll on every launch ([#43](https://github.com/Dingo-Shenanigans/ReSkate/pull/43)).
- **Effects on other skaters.** Costume and board trails, and the sparks and dust of a skater hitting the world, now show on other players too ([b229062](https://github.com/Dingo-Shenanigans/ReSkate/commit/b229062400)).
- **Chat bubbles** over each skater, from jnslol ([#85](https://github.com/Dingo-Shenanigans/ReSkate/pull/85)), and **whispers** with `/w <player>` from moelrobi ([#75](https://github.com/Dingo-Shenanigans/ReSkate/pull/75)).
- **More binds** for first person, the HUD, voice chat, time of day, No Bail, challenges and nametags. Swagi-REDACTED added a freecam bind and teleport-to-freecam, and Eplisium made the trainer teleport to your pause-map waypoint ([#65](https://github.com/Dingo-Shenanigans/ReSkate/pull/65)).
- **Music.** Mods can now bring playlist and song cover art, and songs from mods get their own **Mods** shelf above Featured in the music screen ([#48](https://github.com/Dingo-Shenanigans/ReSkate/pull/48), [#56](https://github.com/Dingo-Shenanigans/ReSkate/pull/56)). DeckardDetribine also added a toggle to play a playlist in order instead of shuffled ([#87](https://github.com/Dingo-Shenanigans/ReSkate/pull/87)).

## The launcher

northdroplet made the launcher work with a **controller**, with the **Steam Deck trackpad** as a mouse ([#63](https://github.com/Dingo-Shenanigans/ReSkate/pull/63)). Focus starts on PLAY and every panel can be reached from the pad. Mod pages in the launcher now show the author's README in a larger two-column layout, and the launcher only asks about updates for mods you have turned on.

2.0.0 wouldn't start under Proton. The launcher said "ReSkate could not attach to Skate", because Wine is missing one of the name-lookup functions ReSkate now hooks. **2.0.1** fixed it within half an hour ([4d77b85](https://github.com/Dingo-Shenanigans/ReSkate/commit/4d77b859bc)). The README now documents a Steam launch option for Linux that swaps EA's anti-cheat launcher for ReSkate's, so you start ReSkate from skate.'s own Steam entry ([#100](https://github.com/Dingo-Shenanigans/ReSkate/pull/100)).

## Off EA's servers

skate. contacts EA on every launch, offline mode included: error reports, telemetry and remote configuration. Since Vebjorhk's change, ReSkate blocks the game's lookups of ea.com addresses inside the process and turns EA's error reporting off. Only EA's image CDN stays reachable, for the fast-travel artwork ([#98](https://github.com/Dingo-Shenanigans/ReSkate/pull/98)). The README's privacy section lists what's blocked.

## Mods that copy store items are out

Since **1.1.2**, mods that add copies of EA's store items under new names don't load. The launcher, the mod manager and the game say which mod was left out and why ([de631ad](https://github.com/Dingo-Shenanigans/ReSkate/commit/de631ad9e6)). It follows the project's rule that ReSkate isn't a way to get paid cosmetics.

The same week, Full Circle commented on skate. mods. It said it welcomes community creativity but won't support mods that unlock paid cosmetics, expose unreleased content or profit from its assets without permission, and that it is working on official creation tools, with no timeline ([shredder.news](https://shredder.news/ea-skate-says-mods-steal-from-artists-and-developers), October 9). [Are skate. cosmetic mods allowed?](/faq/reskate-cosmetics-policy/) covers both sides.

Mod merging also got sturdier. xThrasherrr fixed a run of cases where one bad mod could take the others down with it, and as of 2.0.2 merging is faster. A player on Steam Deck reports that two custom maps now load in the same session under Proton, which failed before ([#109](https://github.com/Dingo-Shenanigans/ReSkate/issues/109)).

## For server hosts

Most of the week's commits are about dedicated servers. They now run at a fixed 20 updates a second, send each player's nearest neighbours at full rate and far-away players less often, and use new pose and sound formats less than half the size of the old ones ([38d86e1](https://github.com/Dingo-Shenanigans/ReSkate/commit/38d86e1b72)). Busy servers stopped freezing in 1.1.8. The rest:

- **Map pools and rotation.** From xThrasherrr: a list of maps players can vote between, which the server can rotate through on a timer ([#74](https://github.com/Dingo-Shenanigans/ReSkate/pull/74)).
- **Polls, custom votes and announcements.** moelrobi added `/poll`, votes that run a server command, and announcement cards shown at the top of every screen ([#143](https://github.com/Dingo-Shenanigans/ReSkate/pull/143)). Votes now appear as a card on the right of the screen with rebindable Yes and No keys.
- **Login tokens.** With a Steam game server token in `steam_token`, a server keeps the same Steam ID and join code across restarts. The in-game browser lists official servers first, then servers your Steam friends are on, and the ReSkate team can hide servers that have no token ([101e1af](https://github.com/Dingo-Shenanigans/ReSkate/commit/101e1af6e4)).
- **Linux servers update themselves** as the Windows ones do. wildesPepega added a **Pterodactyl egg** for hosting panels ([#103](https://github.com/Dingo-Shenanigans/ReSkate/pull/103)).
- **Direct connections.** Servers can take players straight over UDP instead of through Steam's relays, for lower ping.
- **Limits:** objects per player (default 100), how far a mod may resize a skater's bones for everyone else, an AFK kick, reserved slots, and custom chat colours for the server's own messages.

The config file is now split into sections (`server`, `access`, `maps`, `players`, `anti_cheat`, `network`, `votes`). An old file is converted the first time the server starts. Our [server guide](/guides/host-a-reskate-server/) is updated for 2.0.

## The numbers

On October 10:

- 763 stars and 133 forks on [GitHub](https://github.com/Dingo-Shenanigans/ReSkate), with 23 contributors.
- Release files downloaded about 749,000 times. That total counts every launcher, DLL and server file separately.
- 1,457 current packages on the [ReSkate Thunderstore](https://thunderstore.io/c/reskate/), with about 3 million downloads between them. 84 carry the "AI Generated" tag.
- About 53,500 members in the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX).

On October 5 those numbers were 339 stars, 216 mods and 19,000 Discord members ([our first-week post](/blog/reskate-first-three-days/)).

## Still open

- **The Insert menu doesn't open on Intel Arc graphics cards.** ReSkate runs, but its menu can't attach to the game's image. A contributor narrowed it to ReSkate's menu code on Arc GPUs. Rebinding the key doesn't help ([#102](https://github.com/Dingo-Shenanigans/ReSkate/issues/102), [#145](https://github.com/Dingo-Shenanigans/ReSkate/issues/145)). On other cards, a menu that won't open usually means the game was started from Steam instead of the ReSkate launcher.
- **Antivirus flags.** Windows Defender still flags the download as a Trojan. It's a machine-learning guess set off by DLL injection; see [Is ReSkate safe?](/faq/is-reskate-safe/).

New to ReSkate? Start with [download, install and play](/guides/play-skate-with-reskate/), then browse [skate. mods](/reskate/).
