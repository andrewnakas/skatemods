---
question: Can I play Skate 3 on Steam Deck?
answer: Yes. The Skate 3 Recomp runs on the Deck as a native Linux build or as the Windows build through Proton, and RPCS3 runs the PS3 version. Both need your own copy of the game. Clean Room Skate Online also runs in a browser in Desktop Mode.
category: skate-3
games: [skate-3]
related: [guides/skate-3-recomp, guides/play-skate-3-anywhere, faq/rpcs3-basics]
order: 40
updated: 2026-10-10
---

## The Recomp

[skate3recomp](https://github.com/mchughalex/skate3recomp) has a native Linux build. Its README notes that "on some hardware configurations, you may have a better experience running the Windows version through a translation layer like Proton", so try both.

1. In Desktop Mode, download [Skate3Recomp-Linux.zip](https://github.com/mchughalex/skate3recomp/releases/latest/download/Skate3Recomp-Linux.zip) (or the Windows zip for Proton) and extract it.
2. Run `skate3`, click **Select ISO** and pick your own Xbox 360 disc image.
3. Add it to Steam as a non-Steam game to launch it from Game Mode. For the Windows build, set a Proton version under Compatibility.

On Linux the SDL controller backend is always used, so the Deck's controls work. One open issue: a [graphics freeze in skater customization](https://github.com/mchughalex/skate3recomp/issues/79) on the Deck. [Full Recomp guide](/guides/skate-3-recomp/).

## RPCS3

RPCS3 has a Linux AppImage that runs on the Deck. Use it if you own the PS3 version or want to play online through the [community Blaze server](/faq/skate-3-online/). Setup is in [Skate 3 on RPCS3](/guides/skate-3-on-rpcs3/).

## skate. (2025) on the Deck

EA's newer game is a different story. For skate. with ReSkate on the Deck, see [ReSkate on Steam Deck](/faq/reskate-steam-deck/).
