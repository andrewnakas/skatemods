---
title: Get started with THUG Pro, reTHAWed and PARTYMOD
description: Bring the classic Tony Hawk's PC games up to date and back online.
game: tony-hawk-classic
level: beginner
order: 10
updated: 2026-10-06
downloads:
  - { label: "THUG Pro", url: "https://thugpro.com/", note: "needs your own THUG2 for PC" }
  - { label: "reTHAWed Updater", url: "https://www.rethawed.com/", note: "Windows or Linux, needs your own THAW for PC and .NET Framework 4.8" }
  - { label: "PARTYMOD patches", url: "https://partymod.newnet.city/", note: "for THPS2, THPS3, THPS4, THUG, THUG2, American Wasteland and Mat Hoffman's Pro BMX" }
  - { label: "OpenSpy", url: "https://openspy.net/", note: "the GameSpy replacement the patches use for online play" }
---

The Neversoft-era PC games still run well, if you patch them.

## THUG Pro: every classic level in one game

[THUG Pro](https://thpsx.com/thugpro-info/) is a total conversion of *Tony Hawk's Underground 2*. It collects levels from nearly every Neversoft Tony Hawk game and adds online play, a visual overhaul, Create-A-Theme, and support for custom levels and soundtracks.

1. Install THUG2 for PC from your own copy.
2. Download THUG Pro from [thugpro.com](https://thugpro.com/) and follow its installer.
3. Get custom levels from the [THUG Pro community](https://thugpro.com/community/) and the [THPSX forums](https://thpsx.com/). A Blender plugin imports and exports levels if you want to make your own.

## reTHAWed: THAW with everything in it

[reTHAWed](https://www.rethawed.com/) is a total conversion of *Tony Hawk's American Wasteland*. Like THUG Pro it collects levels from across the series, but it plays with THAW's moves and keeps the story mode. Since [version 5.0](/blog/rethawed-5/) it includes THUG2's story mode too.

1. Install THAW for PC from your own copy. Put it anywhere except `Program Files`, and move it if it's there already. The game doesn't need to run, the updater just needs its files.
2. Install [.NET Framework 4.8](https://dotnet.microsoft.com/en-us/download/dotnet-framework/net48) if you don't have it.
3. Download the reTHAWed Updater for [Windows](https://gitgud.io/-/project/36016/uploads/4f5e396d866617079472c747432cf022/RT-Windows-v4.1.zip) or [Linux](https://gitgud.io/-/project/36016/uploads/0f0c861ccaa3254c8246e56ea9f8b84e/RT-Linux-v4.1.zip), point it at your THAW folder and let it download about 7 GB. Run it again to get each new release.
4. Get custom skaters, decks and levels from the [thpsGoat mod depository](https://thpsgoat.com/mods), and ask for help in the [10K Rising Discord](https://discord.gg/rethawed).

Some antivirus programs flag the updater because it's unsigned and downloads files. The team says these are false positives, and the [source](https://gitgud.io/ZedekThePD/nx-mod-updater) is public if you'd rather build it yourself. The [reTHAWed history](/history/rethawed/) covers who makes it.

## PARTYMOD: fix the original ports

[PARTYMOD](https://partymod.newnet.city/) by PARTYMANX patches **THPS2, THPS3, THPS4, THUG, THUG2, American Wasteland** and *Mat Hoffman's Pro BMX*:

- Modern controller support (SDL2, and SDL3 since THPS3 2.0)
- Widescreen resolutions
- Bug fixes for modern Windows
- Online play through **[OpenSpy](https://openspy.net/)**, the community replacement for GameSpy, in the THPS3, THPS4, THUG and THUG2 patches

Each patch is open source ([THPS3](https://github.com/PARTYMANX/partymod-thps3), [THPS4](https://github.com/PARTYMANX/partymod-thps4), [THUG2](https://github.com/PARTYMANX/partymod-thug2)). It leaves your game files alone: run `partypatcher.exe` to write a patched copy of the executable, then follow the readme. Remove the old widescreen mod (`dinput8.dll`) first if you have it installed.

<div class="callout">

THUG and THUG2 players: the earlier **ClownJob'd** patches by %.Gone ([THUG1](https://thpsx.com/forums/index.php?topic=1291.0), [THUG2](https://thpsx.com/forums/index.php?topic=1529.0)) also add OpenSpy and fixes, and PARTYMOD credits them as its inspiration. The full story is in the [PARTYMOD and OpenSpy history](/history/partymod/).

</div>
