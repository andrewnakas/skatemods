---
question: Does ReSkate work on Steam Deck and Linux?
answer: Mostly. The launcher is a Windows program, but it runs through Proton, and since 2.0 it works with a controller and the Steam Deck trackpad. Players run skate. at around 60 FPS on Steam Deck, online and offline. Use ReSkate 2.0.1 or later, because 2.0.0 didn't start under Proton. The dedicated server has a native Linux build.
category: other-games
games: [skate-2025]
related: [guides/play-skate-with-reskate, guides/host-a-reskate-server, faq/reskate-not-working]
order: 35
updated: 2026-10-10
---

## Why ReSkate runs where skate. doesn't

EA's skate. doesn't run on Steam Deck or Linux, because its Javelin anti-cheat isn't supported there. [ReSkate](/history/reskate/) runs an older build of the game offline, without the EA launcher or the anti-cheat. That build runs under Proton like any other Windows game. PC Guide reported players getting it "perfectly fine on multiple maps" at 60 FPS on medium to low settings on Steam Deck, online and offline ([PC Guide](https://www.pcguide.com/news/modders-get-skate-working-on-steam-deck-before-ea-does-online-or-offline-with-new-reskate-platform/), October 5, 2026).

## Set it up

1. On Steam Deck, switch to **Desktop Mode**.
2. Install [skate.](https://store.steampowered.com/app/3354750/) through Steam.
3. Download the latest `ReSkate-<version>.zip` from [GitHub Releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest) and extract `ReSkateLauncher.exe` and `ReSkate.dll` beside `Skate.exe` (Steam → skate. → Manage → Browse local files).
4. In Steam → skate. → Properties → Launch Options, enter:

   ```
   bash -c 'exec "${@/EAAntiCheat.GameServiceLauncher.exe/ReSkateLauncher.exe}"' -- %command%
   ```

5. Press **Play** on skate. in your Steam library. Steam normally starts EA's anti-cheat launcher, which refuses to run under Proton; this option swaps in ReSkate's launcher and keeps skate.'s own Proton prefix ([README](https://github.com/Dingo-Shenanigans/ReSkate#linux-proton)).

Since 2.0 the launcher works with a controller, with the Steam Deck trackpad as a mouse ([#63](https://github.com/Dingo-Shenanigans/ReSkate/pull/63)), so you can switch back to Game Mode once it's set up. 2.0.0 failed under Proton with "ReSkate could not attach to Skate"; 2.0.1 fixed it the same day ([4d77b85](https://github.com/Dingo-Shenanigans/ReSkate/commit/4d77b859bc)).

Adding `ReSkateLauncher.exe` to Steam as a non-Steam game with a forced Proton also works, but it doesn't use skate.'s prefix.

A third-party script, [ReSkate Linux Setup](https://github.com/vitorioaugusto/ReSkate-Linux-Setup), builds a Wine prefix with VKD3D-Proton and DXVK instead. It was tested on Arch/CachyOS with NVIDIA. Read it before running it.

## What's still broken (October 2026)

- **A black screen when you join a server on another map** after loading a custom map ([#31](https://github.com/Dingo-Shenanigans/ReSkate/issues/31)). Load the server's map first. A player reports that two custom maps load in the same session on 2.0.2, which failed on earlier versions ([#109](https://github.com/Dingo-Shenanigans/ReSkate/issues/109)).
- **Hosting a lobby** used to show "Multiplayer is off" under Proton. That issue is closed ([#19](https://github.com/Dingo-Shenanigans/ReSkate/issues/19)), and the README reports hosting a lobby and joining a public server working with Proton Experimental. Joining servers was fixed in 1.0.9 ([#28](https://github.com/Dingo-Shenanigans/ReSkate/issues/28)).

Check those issues for the current state before you spend an evening on it.

## Hosting on Linux

The dedicated server has a native x86_64 Linux build, with no Wine and no game install. It ships as `ReSkateServer-Linux-<version>.tar.gz` in every release since 1.0.8. See [Host a ReSkate server](/guides/host-a-reskate-server/#on-linux).
