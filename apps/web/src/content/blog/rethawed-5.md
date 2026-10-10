---
title: "reTHAWed 5.0 adds THUG2's story mode to THAW"
description: The THAW total conversion from 10K Rising shipped version 5.0 on October 4, with a hotfix the next day. You can now play THUG2's whole story inside THAW, dress your story skater in anything from Create-a-Skater, and show custom graphics online. PARTYMOD THPS3 2.0 and a native THUG port for the PS Vita came out the same week.
date: 2026-10-06
author: skatemods
games: [tony-hawk-classic]
related: [history/rethawed, guides/thug-pro-and-partymod, faq/thug-pro-vs-partymod, history/partymod]
---

[reTHAWed](/history/rethawed/) is a total conversion of *Tony Hawk's American Wasteland* for PC, made by the 10K Rising team since 2017. Version **5.0.0.0** came out on October 4, 2026, with a [launch trailer](https://www.youtube.com/watch?v=YYs3k8Gy1W8), and **5.0.0.1** followed on October 5. Both changelogs are commit messages in the [public release repository](https://gitgud.io/10k-rising/rethawed-release-repository/-/commit/77a4c25929f958c9bfec0f413a2f00ada6877333), and Zedek wrote both releases. On October 6 the [10K Rising Discord](https://discord.gg/rethawed) had 18,571 members ([invite API](https://discord.com/api/v9/invites/rethawed?with_counts=true)).

## Two story modes

The headline is a **playable THUG2 story mode**. A rebuilt story menu lets you pick THAW's Los Angeles story or THUG2's World Destruction Tour. reTHAWed already kept THAW's campaign intact, which [THUG Pro](/history/thug-pro/) doesn't do, so it now carries two of Neversoft's story modes in one install.

Story mode also gets its own **Create-a-Skater menu**, so your story skater can wear any item in the mod. There are a lot of items. The 5.0 changelog adds every THUG and THUG2 hairstyle and beard, the THPS4 hairstyles, Proving Ground, Ride and Shred clothing, and more than a hundred female versions of items and hairstyles that were male only in the original games.

## Online

- **Create-a-Graphic works online.** Every create-a-graphic option from THUG2 is in, and other players now see your graphic in net games.
- Bouncy objects, particles and sound effects now work online in every THAW level.
- Chat stays on screen when the level changes, observers can be kicked and banned, and the theme menu no longer crashes when a net game starts.

## Levels and skaters

- **Burnside** is new, with a fishing minigame in several maps, PSP-version options for Atlanta and the roof teleport back in Manhattan.
- The full **Tony Hawk: Shred** cast arrives in every style, along with Downhill Jam's Fang, Skyler and Victor, a THPS3 PlayStation beta Tony Hawk, and more THAW and THUG2 pedestrians.
- Most story-mode characters now use their Xbox 360 textures, and many THUG2 characters use their PS2 textures.

## Controls and fixes

New options include a configurable board throw, vert wallplants on one button, tap-to-tag graffiti, toggles for ground graffiti and air wallplants, and single buttslaps for the THPS2 and THPS3 physics. The game now defaults to your monitor's resolution in borderless windowed mode. It also uses a newer Bink DLL to stop music stutters, and it fixes an Aspyr bug that rendered Create-a-Graphic textures at half resolution.

The [5.0.0.1 hotfix](https://gitgud.io/10k-rising/rethawed-release-repository/-/commit/d3b5964823c3203908a8f3057d71e89bb26bc3b1) fixes crashes from missing item assets, the Hollywood dinosaur cutscene and bad Create-a-Graphic data. It also lets you continue an old THAW story save from the new story menu. If you already have reTHAWed, the updater pulls both releases.

## Getting it

You need your own copy of THAW for PC, installed somewhere other than `Program Files`. Download the reTHAWed Updater for Windows or Linux from [rethawed.com](https://www.rethawed.com/), point it at the game and let it fetch about 7 GB. It needs .NET Framework 4.8. Custom skaters, decks and levels are on the [thpsGoat mod depository](https://thpsgoat.com/mods). Full steps are in [Get started with THUG Pro, reTHAWed and PARTYMOD](/guides/thug-pro-and-partymod/#rethawed-thaw-with-everything-in-it).

## Elsewhere in Tony Hawk's modding

- **PARTYMOD THPS3 2.0** came out on [October 1](https://github.com/PARTYMANX/partymod-thps3/releases/tag/v2.0.0), ahead of THPS3's 25th anniversary. PARTYMANX rewrote the whole patch in Rust over about a year and moved it to SDL3. It brings back pedestrian shadows, shiny surfaces, texture animations such as the airport arrivals boards, and controller vibration. The park editor now works on a controller, and F11 hides the HUD for screenshots. You have to re-patch if you're updating from 1.x. PARTYMANX's [writeup](https://partymod.newnet.city/writeups/4.html) explains the rewrite. Four previews ran through September.
- **PARTYMOD THPS2 1.1.5** ([October 5](https://github.com/PARTYMANX/partymod-thps2/releases/tag/v1.1.5)) fixes window z-fighting near the Gonz rail and the Vulkan renderer's choice of present mode.
- **THUG on the PS Vita.** iwannagooutside released a [native port of Tony Hawk's Underground](https://github.com/iwannagooutside/thug-vita-port) for the Vita on October 5 ([trailer](https://www.youtube.com/watch?v=XKwEK5B5K2w)), with v1.0.1 the same day. It needs a Vita on custom firmware and data from your own USA Xbox disc. The README says it was "built with agentic AI and a custom harness" that drives a real Vita. It's a day old, so expect bugs. Our [Vita guide](/guides/thug-on-ps-vita/) covers the install.
- **cascade 0.4.0** by 1borgy ([September 2](https://github.com/1borgy/cascade/releases/tag/0.4.0)), a tool that edits saves in bulk, now supports every game from THPS3 to THAW.
- No new releases for [THUG Pro](https://thugpro.com/changelog/) (still 0.7 beta from October 2023), [THPSPro](/history/thps-pro/) (1+2 version 10.2 from July 22) or the ClownJob'd patches.
