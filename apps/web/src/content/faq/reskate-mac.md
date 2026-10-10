---
question: Does ReSkate work on Mac?
answer: Not officially. skate. has no macOS version and ReSkate is a Windows program. On Apple silicon Macs, players have tried CrossOver. EA's anti-cheat stopped one player with "Hardware configuration is not supported", and another reported getting it running on macOS 26.4. Treat it as an experiment.
category: other-games
games: [skate-2025]
related: [faq/reskate-steam-deck, faq/reskate-ps5-xbox, guides/play-skate-with-reskate]
order: 37.4
updated: 2026-10-10
---

## Why there's no Mac version

EA and Full Circle confirmed that skate. won't support macOS, Linux or Steam Deck, because its anti-cheat doesn't run there ([GamingOnLinux](https://www.gamingonlinux.com/2025/09/full-circle-ea-confirm-again-that-skate-will-not-support-linux-steam-deck-or-macos/)). ReSkate runs an older build offline and starts the game itself, which is why it works on Linux through Proton. Nobody has made a Mac build of ReSkate.

## What players report

The only public report is [issue #9](https://github.com/Dingo-Shenanigans/ReSkate/issues/9) on ReSkate's tracker:

- On an M4 Max with macOS 15.6 and CrossOver 26.3, ReSkate 1.0.3 loaded into the game, then EA's anti-cheat crashed with "Hardware configuration is not supported".
- Another player said they got ReSkate running on macOS 26.4 on an M5 with version 1.0.8, with an AI assistant's help. They didn't post steps.

The issue is still open. If you try it, the [Linux instructions](/guides/play-skate-with-reskate/#linux-and-steam-deck) are the closest guide, because CrossOver is built on Wine like Proton. The Steam launch option there replaces EA's anti-cheat launcher with ReSkate's.

## Other options

- **Windows on a PC**, or **Boot Camp** on an Intel Mac.
- **A Steam Deck**, where ReSkate runs through Proton ([details](/faq/reskate-steam-deck/)).
- **Cloud PCs** that run Windows. You'd install Steam and ReSkate on the cloud machine yourself.
