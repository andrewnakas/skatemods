---
question: Does ReSkate work on Steam Deck and Linux?
answer: Mostly. The launcher is a Windows program, but it runs through Proton, and since 1.0.4 it detects Steam there. Players run skate. at around 60 FPS on Steam Deck, online and offline. Custom maps have hung on loading under Proton since 1.0.8, though. The dedicated server has a native Linux build.
category: other-games
games: [skate-2025]
related: [guides/play-skate-with-reskate, guides/host-a-reskate-server, faq/reskate-not-working]
order: 35
updated: 2026-10-05
---

## Why ReSkate runs where skate. doesn't

EA's skate. doesn't run on Steam Deck or Linux, because its Javelin anti-cheat isn't supported there. [ReSkate](/history/reskate/) runs an older build of the game offline, without the EA launcher or the anti-cheat. That build runs under Proton like any other Windows game. PC Guide reported players getting it "perfectly fine on multiple maps" at 60 FPS on medium to low settings on Steam Deck, online and offline ([PC Guide](https://www.pcguide.com/news/modders-get-skate-working-on-steam-deck-before-ea-does-online-or-offline-with-new-reskate-platform/), October 5, 2026).

## Set it up

1. On Steam Deck, switch to **Desktop Mode**.
2. Install [skate.](https://store.steampowered.com/app/3354750/) through Steam.
3. Download the latest `ReSkate-<version>.zip` from [GitHub Releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest) and extract `ReSkateLauncher.exe` and `ReSkate.dll` beside `Skate.exe` (Steam → skate. → Manage → Browse local files).
4. Add `ReSkateLauncher.exe` to Steam as a non-Steam game, and in its Properties → Compatibility force a recent Proton.
5. Launch it from Steam so the launcher can see that Steam is signed in. Otherwise you start offline as "Unknown Player".

A third-party script, [ReSkate Linux Setup](https://github.com/vitorioaugusto/ReSkate-Linux-Setup), builds a Wine prefix with VKD3D-Proton and DXVK instead. It was tested on Arch/CachyOS with NVIDIA. Read it before running it.

## What's still broken (October 2026)

- **Custom maps and modded servers hang on the loading screen** under Proton since 1.0.8 ([#31](https://github.com/Dingo-Shenanigans/ReSkate/issues/31)). Free skating in San Van works. Players report custom maps loading on 1.0.7.
- **Hosting a lobby** may show "Multiplayer is off" ([#19](https://github.com/Dingo-Shenanigans/ReSkate/issues/19)). Joining servers was fixed in 1.0.9 ([#28](https://github.com/Dingo-Shenanigans/ReSkate/issues/28)).

Check those issues for the current state before you spend an evening on it.

## Hosting on Linux

The dedicated server has a native x86_64 Linux build, with no Wine and no game install. It ships as `ReSkateServer-Linux-<version>.tar.gz` in every release since 1.0.8. See [Host a ReSkate server](/guides/host-a-reskate-server/#on-linux).
