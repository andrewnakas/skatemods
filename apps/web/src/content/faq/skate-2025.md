---
question: Can skate. (2025) be modded?
answer: Not the live game, which is online-only, protected by EA's Javelin anti-cheat and covered by a user agreement that bans mods. But since October 2, 2026 there's ReSkate, a community platform that runs one pinned Steam build offline with its own runtime. It adds custom maps, mods from Thunderstore, a park editor, Steam lobbies and dedicated servers.
category: other-games
games: [skate-2025]
related: [guides/play-skate-with-reskate, faq/is-skate-skate-4, faq/is-reskate-safe, faq/reskate-not-working, faq/reskate-steam-deck, history/reskate]
order: 30
updated: 2026-10-05
---

## What skate. is

EA describes skate. as "a free-to-play online, massive-multiplayer skateboarding sandbox set in the city of San Vansterdam" ([FAQ](https://www.ea.com/games/skate/skate/faq)). It entered early access on **September 16, 2025** on PC, PlayStation and Xbox, with cross-platform play and cross-progression ([EA](https://news.ea.com/press-releases/press-releases-details/2025/EA-and-Full-Circle-Reveal-September-16-Early-Access-Release-Date-for-skate-/default.aspx)).

## Why it's locked down

- **Anti-cheat.** EA lists skate. among the games protected by [EA Javelin Anticheat](https://www.ea.com/news/ea-javelin-anticheat-2026-update). EA Help describes Javelin as "a PC anti-cheat and anti-tamper solution" that "will shut down the game and our services if you use cheat tools, debuggers, or other conflicting software" ([help.ea.com](https://help.ea.com/en/articles/platforms/pc-ea-anticheat/)). According to the [user agreement](https://www.ea.com/legal/user-agreement), these technologies "may activate using kernel, admin or user privileges".
- **The rules.** The same agreement treats any "mod", "hack", "trainer" or "cheat" that changes the game in ways EA hasn't authorized as an Unauthorized Third-Party Program.

## ReSkate: a pinned build instead of the live game

[ReSkate](/history/reskate/) came out on **October 2, 2026** ([v1.0.0](https://github.com/Dingo-Shenanigans/ReSkate/releases/tag/v1.0.0)). Rather than touching the live service, its launcher checks your Steam copy against one specific build of the game (Steam build `25414733`), downloads exactly that build if it has to, and loads a community runtime on top. You play offline, with no EA servers involved, and your progress is saved on your PC.

On top of the game it adds:

- **Mods.** A `Mods` folder for custom maps, cosmetics, loading screens and scripts, and a [Thunderstore community](https://thunderstore.io/c/reskate/) the launcher browses directly. The full Skate 3 city, skate 2's New San Vanelona and Skater XL's Losal Streets were all up on the first day, and three days later there were over 200 mods.
- **Multiplayer.** 32-player Steam lobbies, dedicated servers in an in-game browser, proximity voice, throwdowns and co-op challenges.
- **Tools.** A park editor, a built-in trainer for physics tuning and practice, time-of-day and world controls, fast travel, noclip and a console.

It's open source (GPL-3.0) and runs on Windows. It also runs on Linux through Proton, with rough edges. The dedicated server has a native Linux build. You need your own copy of skate. on Steam. Its FAQ says EA can't ban you for using it, but the ReSkate team keeps its own ban list for its multiplayer. The project says it's "NOT a replacement for the live game, a way to get paid cosmetics, or a place for leaks" ([news feed](https://github.com/Dingo-Shenanigans/ReSkateCache)). Because it still runs EA's client, EA's terms still apply. To set it up, follow the [ReSkate install guide](/guides/play-skate-with-reskate/).

## Where that leaves fans

skate. now has an open scene of its own, alongside Skate 3, which runs natively, takes custom maps, and has a [community online server](/faq/skate-3-online/).
