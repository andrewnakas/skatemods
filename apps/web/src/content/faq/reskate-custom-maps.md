---
question: How do you install custom maps in ReSkate?
answer: Open ReSkateLauncher.exe, go to MODS, search for the map and click install, or drag its .zip onto the launcher. Press PLAY, then open the ReSkate menu with Insert and pick the map from the level list. To join a server on a custom map, you need the same map mod and ReSkate version as the server.
category: other-games
games: [skate-2025]
related: [guides/play-skate-with-reskate, guides/host-a-reskate-server, faq/reskate-not-working]
order: 35.2
updated: 2026-10-09
---

## Install a map

1. Set up ReSkate first with the [install guide](/guides/play-skate-with-reskate/).
2. In the launcher, open **MODS**. It browses the [ReSkate Thunderstore](https://thunderstore.io/c/reskate/). Search for the map and click install. You can also drag a mod `.zip` or folder onto the launcher window.
3. Press **PLAY**. The launcher merges your mods before the game starts and names any it couldn't load.
4. In game, press **Insert** to open the ReSkate menu. Custom maps are in its level list.

To install by hand, put the mod folder in `Mods\` beside `Skate.exe`. `Mods\mods.json` sets the load order.

## Which maps to get

[ReSkate custom maps](/reskate/maps/) lists every map on Thunderstore, most downloaded first. Popular ones include:

- [Skate 3 Improved](/reskate/333/Skate_3_Improved/): Port Carverton in skate.'s engine, with the DLC maps.
- [Skate 2 Map](/reskate/brassy/Skate2Map/): New San Vanelona.
- [Losal Streets](/reskate/TeamMeebs/Losal_Streets/) and [South Florida](/reskate/AltDoug/South_Florida/), ported from Skater XL.

## When a map won't load

- **Crash on a big map:** update to ReSkate 1.1.0 or later, which raised the physics body limit for large maps.
- **A map broke after 1.1.0:** uninstall it and install it again from **MY MODS** ([#46](https://github.com/Dingo-Shenanigans/ReSkate/issues/46)).
- **Endless loading on Linux or Steam Deck:** custom maps have hung under Proton since 1.0.8 ([#31](https://github.com/Dingo-Shenanigans/ReSkate/issues/31)).

More fixes are in [ReSkate isn't working](/faq/reskate-not-working/). To make a map rather than install one, ReSkate's park editor saves parks as mods you can share.
