---
question: ReSkate isn't working. How do I fix it?
answer: Most problems are one of six things. Your antivirus is blocking the files, Steam wasn't running, a mod is outdated, the game build changed, your launcher drew on the wrong GPU, or a big map needs a newer version. Update to the latest release first, then work down the list below.
category: other-games
games: [skate-2025]
related: [guides/play-skate-with-reskate, faq/is-reskate-safe, faq/reskate-steam-deck]
order: 36
updated: 2026-10-05
---

Start by updating. ReSkate shipped eleven releases in its first three days, and most of them fixed a specific report. The launcher updates itself when it starts. If it can't, download the latest from [GitHub Releases](https://github.com/Dingo-Shenanigans/ReSkate/releases/latest).

| What you see | Cause | Fix |
|---|---|---|
| "Trojan" or "virus detected", or files vanish after download | Antivirus false positive (`Behavior:Win32/DefenseEvasion.A!ml`) | Download from GitHub only, restore from quarantine, add the ReSkate folder to exclusions. See [Is ReSkate safe?](/faq/is-reskate-safe/) |
| "Cannot open file for SHA-256" | Antivirus holding `ReSkate.dll` | Same exclusion. Since 1.1.0 the error names the file. |
| You play as "Unknown Player" with no multiplayer | Steam wasn't open and signed in when you pressed PLAY | Start Steam first, then the launcher |
| The launcher window is blank | It drew on the onboard GPU (seen with a GT 1030) | Update to 1.0.6 or later |
| Crash while loading on an older GPU (RX 580) | Map streaming memory too big for the card | Update to 1.0.2 or later |
| A big custom map crashes on load | The game's physics body limit | Update to 1.1.0 or later |
| Board graphics or maps crash after updating to 1.1.0 | A mod from before 1.1.0 ([#46](https://github.com/Dingo-Shenanigans/ReSkate/issues/46)) | Uninstall and reinstall the mod in MY MODS. Turn mods off one at a time to find it. |
| A mod is missing in game | It couldn't be merged or was made for another game build | PLAY names it. Update it or turn it off. |
| Can't join a server, or it loads forever | Missing the server's map mod, or a different ReSkate version | Install the same map and update ReSkate |
| "Can't host" or "can't join" with no reason | Older version | 1.0.9 and later say why |
| Settings in the game's menu don't stick | Fixed in 1.0.4 | Update |
| On Linux or Steam Deck, custom maps hang loading | Open Proton issue since 1.0.8 ([#31](https://github.com/Dingo-Shenanigans/ReSkate/issues/31)) | See [ReSkate on Steam Deck and Linux](/faq/reskate-steam-deck/) |

## Still stuck

- Your log is `logs\ReSkate.log` beside `Skate.exe`. It usually names the mod or file at fault.
- Search the [issue tracker](https://github.com/Dingo-Shenanigans/ReSkate/issues?q=is%3Aissue) for your error before opening a new issue, and attach the log when you do.
- Ask in the bug-reports forum on the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX).

The full setup, controls and mod instructions are in [Play skate. with ReSkate](/guides/play-skate-with-reskate/).
