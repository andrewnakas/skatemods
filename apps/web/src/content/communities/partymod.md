---
title: PARTYMOD, ClownJob'd and OpenSpy
short: How the original Tony Hawk's PC ports got modern controllers, widescreen, fixes for modern Windows and online play again, years after GameSpy shut down.
games: [tony-hawk-classic]
years: 2013–present
scene: active
order: 3
updated: 2026-10-06
people:
  - name: PARTYMANX
    role: Writes every PARTYMOD patch, for THPS2, THPS3, THPS4, THUG, THUG2, American Wasteland and Mat Hoffman's Pro BMX, including a Vulkan renderer for THPS2.
    url: https://github.com/PARTYMANX
    source: https://github.com/PARTYMANX/partymod-thps3/releases/tag/v2.0.0
  - name: "%.Gone"
    role: Wrote ClownJob'd for THUG1 and THUG2, self-contained patches with fixes, features and OpenSpy support. They inspired the PARTYMOD THUG patches.
    source: https://thpsx.com/forums/index.php?topic=1529.0
  - name: trxbail
    role: Pointed PARTYMANX to several of the fixes in the THUG1 and THUG2 patches.
    source: https://github.com/PARTYMANX/partymod-thug2
  - name: Ace, adelyn, sawwl and slime generator
    role: Tested the first PARTYMOD release, for THPS3.
    source: https://github.com/PARTYMANX/partymod-thps3/releases/tag/1.0
  - name: CHC
    role: The original creator of OpenSpy and its backend developer. By far the largest committer to openspy-core, the open-source GameSpy replacement the patches connect to.
    url: https://github.com/openspy/openspy-core
    source: http://web.archive.org/web/20130614052915id_/http://openspy.net/
  - name: Krad and Freddy
    role: Co-owners of OpenSpy when THPSX took it over in 2013, funding it as a non-commercial service.
    source: http://web.archive.org/web/20130614052915id_/http://openspy.net/
  - name: Frost and Kirillgta
    role: OpenSpy administrators, handling web services and PR, and Russian support.
    source: http://web.archive.org/web/20130614052915id_/http://openspy.net/
  - name: Spanky
    role: Ran an earlier version of the OpenSpy service at Lrnit.org before shutting it down.
    source: http://web.archive.org/web/20130614052915id_/http://openspy.net/
milestones:
  - date: 2013-06
    title: OpenSpy relaunches under THPSX
    body: After an earlier operator shut it down, OpenSpy comes back as a non-commercial, donation-funded service owned by Krad and Freddy of THPSX, with CHC on the backend.
    who: CHC, Krad, Freddy
    source: http://web.archive.org/web/20130614052915id_/http://openspy.net/
  - date: 2014-05-31
    title: GameSpy goes dark
    body: All remaining GameSpy services shut down for non-EA games, taking online play for the Tony Hawk's PC ports with them.
    source: https://www.pcgamingwiki.com/wiki/GameSpy
  - date: 2018-03-02
    title: openspy-core
    body: OpenSpy starts a full open-source rewrite of its server. It has since grown to cover games from Saints Row 2 to Red Alert 3.
    who: chc
    source: https://github.com/openspy/openspy-core
  - date: 2020-07-09
    title: ClownJob'd for THUG1
    body: A self-contained patch with bug fixes, features the community asked for and OpenSpy support. It leaves the game's loose files untouched.
    who: "%.Gone"
    source: https://thpsx.com/forums/index.php?topic=1291.0
  - date: 2021-11-20
    title: ClownJob'd for THUG2
    body: The same treatment for THUG2, which also gets support for modern Windows, more resolutions and borderless windowed mode.
    who: "%.Gone"
    source: https://thpsx.com/forums/index.php?topic=1529.0
  - date: 2022-10-28
    title: PARTYMOD THPS3 1.0
    body: The first PARTYMOD release, on THPS3's 21st birthday. PARTYMANX says it was the first game patch they had ever written.
    who: PARTYMANX
    source: https://github.com/PARTYMANX/partymod-thps3/releases/tag/1.0
  - date: 2023-03-20
    title: PARTYMOD THPS4 1.0
    body: THPS4 gets modern controller support, fixes and OpenSpy as its default online service.
    who: PARTYMANX
    source: https://github.com/PARTYMANX/partymod-thps4/releases
  - date: 2023-07-10
    title: PARTYMOD THAW 0.10
    body: The first full THAW release. Pattern-matched patches make it work with many more versions of the game's executable.
    who: PARTYMANX
    source: https://github.com/PARTYMANX/partymod-thaw/releases
  - date: 2024-05-04
    title: PARTYMOD THPS2 and a Vulkan renderer
    body: THPS2 runs on a new engine, and the patch ships PARTYMANX's first complete renderer, written for Vulkan.
    who: PARTYMANX
    source: https://partymod.newnet.city/writeups/1.html
  - date: 2024-08-28
    title: Mat Hoffman's Pro BMX
    body: PARTYMOD branches out to Neversoft's BMX spin-off.
    who: PARTYMANX
    source: https://github.com/PARTYMANX/partymod-mhpb/releases
  - date: 2024-12-19
    title: THUG1 and THUG2, same day
    body: Both Underground games get PARTYMOD 1.0 together, with credit to ClownJob'd for much of the inspiration.
    who: PARTYMANX
    source: https://github.com/PARTYMANX/partymod-thug1/releases
  - date: 2026-09-05
    title: THPS3 2.0 previews
    body: The first of four public previews of the rewritten THPS3 patch. The shared Rust code moves into a new partymod-common repository the day before.
    who: PARTYMANX
    source: https://github.com/PARTYMANX/partymod-thps3/releases/tag/v2.0.0-preview01
  - date: 2026-10-01
    title: PARTYMOD THPS3 2.0
    body: Rewritten in Rust and moved to SDL3 ahead of THPS3's 25th anniversary, after a year spent chasing every THPS3 fix PARTYMANX wanted. It restores pedestrian shadows, shiny surfaces, texture animations and vibration, and the park editor works on a controller.
    who: PARTYMANX
    source: https://github.com/PARTYMANX/partymod-thps3/releases/tag/v2.0.0
  - date: 2026-10-05
    title: PARTYMOD THPS2 1.1.5
    body: Fixes window z-fighting near the Gonz rail and how the Vulkan renderer picks a present mode, and updates SDL.
    who: PARTYMANX
    source: https://github.com/PARTYMANX/partymod-thps2/releases/tag/v1.1.5
links:
  - label: PARTYMOD site and writeups
    url: https://partymod.newnet.city/
  - label: PARTYMANX on GitHub
    url: https://github.com/PARTYMANX
  - label: ClownJob'd (THUG2)
    url: https://thpsx.com/forums/index.php?topic=1529.0
  - label: OpenSpy
    url: https://openspy.net/
---

## When the servers went away

The Tony Hawk's PC ports ran their online play through GameSpy. When it [shut down for non-EA games on May 31, 2014](https://www.pcgamingwiki.com/wiki/GameSpy), they went offline overnight, but the Tony Hawk's community had a replacement ready. [OpenSpy](https://openspy.net/), created by CHC, [already hosted](https://tonyhawkgames.fandom.com/wiki/OpenSpy) the games' message of the day, and by [2013](http://web.archive.org/web/20130614052915id_/http://openspy.net/) THPSX's Krad and Freddy had taken it over as a non-commercial service funded by donations. Running it cost about $240 a year at the time ([2014 snapshot](http://web.archive.org/web/20141222174235id_/http://www.openspy.net/)). PCGamingWiki now describes OpenSpy as "an open-source clone of GameSpy servers". Its current server, [openspy-core](https://github.com/openspy/openspy-core), is a full rewrite that went public in 2018 and has grown to cover games far beyond Tony Hawk's. Fan patches can point the old games at OpenSpy instead of GameSpy.

## ClownJob'd

%.Gone, one of the THUG Pro developers, released **ClownJob'd** for [THUG1 in 2020](https://thpsx.com/forums/index.php?topic=1291.0) and for [THUG2 in 2021](https://thpsx.com/forums/index.php?topic=1529.0). The goal was "to add some bug fixes and features asked about in the community, all while being self-contained and not making changes to any loose files". That meant OpenSpy support plus, according to [PCGamingWiki](https://www.pcgamingwiki.com/wiki/Tony_Hawk's_Underground_2), modern Windows support, more resolutions and borderless windowed mode.

## PARTYMOD

PARTYMANX released [PARTYMOD for THPS3](https://github.com/PARTYMANX/partymod-thps3/releases/tag/1.0) on the game's 21st birthday in October 2022. Over the next two years it spread to every Neversoft PC port: THPS4, American Wasteland, THPS2, Mat Hoffman's Pro BMX, and both Underground games on the same day in December 2024. The [project site](https://partymod.newnet.city/) calls it "a series of patches, mostly for the Tony Hawk's Pro Skater series, that fixes bugs as well as introduces modernizations such as modern controller support via SDL2". The [THUG patches](https://github.com/PARTYMANX/partymod-thug2) credit ClownJob'd for much of their inspiration.

The patches are deliberately conservative. They're "designed to keep the game as original as possible, and leave its files unmodified" ([README](https://github.com/PARTYMANX/partymod-thps3)). A small `partypatcher.exe` writes a patched copy of the executable and leaves the original alone. Along the way PARTYMANX wrote a [Vulkan renderer for THPS2](https://partymod.newnet.city/writeups/1.html). On October 1, 2026, they released [THPS3 2.0](https://github.com/PARTYMANX/partymod-thps3/releases/tag/v2.0.0), rewritten in Rust on SDL3 ([writeup](https://partymod.newnet.city/writeups/4.html)). Updating from 1.x means running the new patcher again. PARTYMANX also rewrote the input and output code for [reTHAWed](/history/rethawed/), the American Wasteland total conversion, which credits them for it.

To install either patch, see [Get started with THUG Pro, reTHAWed and PARTYMOD](/guides/thug-pro-and-partymod/).
