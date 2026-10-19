---
question: "ReSkate black screen or custom maps not loading?"
answer: Usually you joined a server on another map while a custom map was loaded: load the server's map first. Crashes when switching custom maps are an open bug, so restart the game between them. Dense maps such as Los Santos City crashed the GPU until 2.1.0, and some custom maps fail on Steam Deck.
category: other-games
games: [skate-2025]
related: [faq/reskate-custom-maps, faq/reskate-not-working, faq/reskate-steam-deck, guides/play-skate-with-reskate]
order: 36.2
updated: 2026-10-19
latestReskate: true
---

These are the map problems players report most on [ReSkate's issue tracker](https://github.com/Dingo-Shenanigans/ReSkate/issues), with what's known to help, as of October 19, 2026. Installing maps in the first place is covered in [How do I install custom maps in ReSkate?](/faq/reskate-custom-maps/)

## Black screen with sound after joining a server

You're connected, you can hear the game, but nothing draws. It happens when you're on one custom map and join a server running a different map ([#95](https://github.com/Dingo-Shenanigans/ReSkate/issues/95), [#31](https://github.com/Dingo-Shenanigans/ReSkate/issues/31)). Close the game, load the server's map yourself, then join.

## "This map is not loading" when you join

If the server had a newer version of a map you already had, the game could start loading before the update finished. The 2.0.7 hotfix waits for the update, and stops offering to "update" you to an older version than yours. Since 2.0.3, a server offers to download a map you don't have; it only offers packages listed as Maps on Thunderstore. Update ReSkate and try again. More in [ReSkate 2.0.7](/blog/reskate-2-0-7/).

## Crash or endless loading when switching custom maps

Going from one custom map to another can crash the game, freeze the PC, or hang on the loading screen ([#198](https://github.com/Dingo-Shenanigans/ReSkate/issues/198)). Leaving 333's Skate 3 Improved crashed every time for one player on 2.0.7 ([#246](https://github.com/Dingo-Shenanigans/ReSkate/issues/246)). These are open bugs. What helps:

- Restart the game between custom maps, or go back to a stock map first.
- One reporter's log showed the game still looking for mods they had uninstalled or turned off. A clean install of ReSkate and your mods, in a [folder of its own](/faq/reskate-wont-launch-after-update/), is worth trying.
- Turn off mods you aren't using. Fewer merged mods means fewer things to go wrong at load.

## Big maps crash, or the GPU hangs

Dense maps such as Los Santos City and San Andreas overflowed the GPU's descriptor heap and crashed or hung it, and levels with a very large number of lights crashed too. Both are fixed in the 2.1.0 pre-release ([164fdff](https://github.com/Dingo-Shenanigans/ReSkate/commit/164fdffbd0)); see [ReSkate 2.1](/blog/reskate-2-1/). On 6 GB graphics cards, your skater's clothes can lose detail on very large maps such as South Florida, because the game keeps its stock mesh memory pool on those cards ([#110](https://github.com/Dingo-Shenanigans/ReSkate/issues/110)).

## Steam Deck and Linux

On a Steam Deck under Proton, stock maps play fine but some custom maps don't: South Florida freezes during the load until the game is killed, and Canuk Plaza loads with collision but almost none of its geometry drawn ([#184](https://github.com/Dingo-Shenanigans/ReSkate/issues/184)). A reply suggests trying GE-Proton or proton-cachyos instead of Valve's Proton; nobody has confirmed it fixes it yet. Our [Steam Deck FAQ](/faq/reskate-steam-deck/) has the setup.

## Still stuck

Your log is `logs\ReSkate.log` in your ReSkate folder; it usually names the map or mod at fault. Attach it to a [GitHub issue](https://github.com/Dingo-Shenanigans/ReSkate/issues) or the bug-reports forum on the [ReSkate Discord](https://discord.gg/Tkd5D2Y6EX). Other errors are in [ReSkate isn't working](/faq/reskate-not-working/).
