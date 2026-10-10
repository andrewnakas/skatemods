---
question: "Is ReSkate safe, or a virus? Why the Trojan alert?"
answer: Nothing shows the official ReSkate download from GitHub is a virus. It's open source, and the Trojan warning is a machine-learning guess, widely reported as a false positive. Windows Defender started flagging it as Behavior:Win32/DefenseEvasion.A!ml around version 1.0.8. The "!ml" means a machine-learning guess, set off because ReSkate loads a DLL into the game. Download only from GitHub Releases and add the ReSkate folder to your antivirus exclusions.
category: other-games
games: [skate-2025]
related: [faq/reskate-download-links, guides/play-skate-with-reskate, faq/reskate-not-working, faq/is-reskate-ai]
order: 34
updated: 2026-10-10
---

## Why Windows Defender calls it a Trojan (a false positive)

ReSkate's launcher loads `ReSkate.dll` into skate. and hooks the game's code. That's how every game mod loader works, and it's also what some malware does. From around **1.0.8**, Windows Defender and some browsers began flagging the download. The usual detection is `Behavior:Win32/DefenseEvasion.A!ml` ([#47](https://github.com/Dingo-Shenanigans/ReSkate/issues/47), [#27](https://github.com/Dingo-Shenanigans/ReSkate/issues/27), [#30](https://github.com/Dingo-Shenanigans/ReSkate/issues/30), [#73](https://github.com/Dingo-Shenanigans/ReSkate/issues/73)). The `!ml` suffix marks a machine-learning detection, a guess based on behaviour rather than a known malware signature. On the issue tracker, one player checked it on VirusTotal and found it "legit", and another explained the detection as a false positive set off by DLL injection.

## How to check your copy isn't a virus

- **Only download from [GitHub Releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest).** Re-uploads on other sites, YouTube descriptions and Discord DMs are how real malware gets passed around as a popular mod.
- **The source is public** under the GPL-3.0 at [Dingo-Shenanigans/ReSkate](https://github.com/Dingo-Shenanigans/ReSkate). Anyone can read what it does, and the README has an AI disclosure and a privacy section.
- **It sends crash reports** (a minidump and that session's log, never your Steam password or login name). Untick **Send crash reports** in the launcher's Settings → Advanced to turn this off.
- **It keeps the game off EA's servers.** Since 2.0, ReSkate blocks the game's own error reports, telemetry and remote configuration calls to EA ([#98](https://github.com/Dingo-Shenanigans/ReSkate/pull/98)).
- **It never asks for your EA account.** It signs in to Steam only to download the supported game build, using Steam's own QR code or Steam Guard.

## Let it run

If you trust the copy you downloaded from GitHub, restore it from quarantine and add the ReSkate folder (the one with `Skate.exe`) to your antivirus exclusions. Otherwise the launcher can't read its own files and stops with "Cannot open file for SHA-256". Since 1.1.0 that error names the file and the folder.

## Mods are a separate question

ReSkate itself is open source, but [mods](/reskate/) come from many authors on Thunderstore. Map and cosmetic mods change game data, and **script mods can run code**. ReSkate's README says to install only mods you trust. skatemods lists mods but doesn't review them.

## Can EA ban you?

ReSkate runs an old build of skate. offline and never connects to EA's servers, and its FAQ says you can't be banned for using it. The ReSkate team runs its own global ban list for its multiplayer, though. See [Can skate. be modded?](/faq/skate-2025/) for the background.
