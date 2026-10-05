---
title: Session modding
short: Custom maps showed up in Session a week after early access opened, well before any official tools. One open-source mod manager and the Illusory unlocker have carried the scene ever since.
games: [session]
years: 2019–present
scene: active
order: 5
updated: 2026-10-02
people:
  - name: rodriada000
    role: Wrote Session Map Switcher, which became Session Mod Manager. It's open source, with 79 releases over five years, an asset store and Linux support.
    url: https://github.com/rodriada000/SessionMapSwitcher
    source: https://github.com/rodriada000/SessionMapSwitcher/releases
  - name: dga711
    role: Made the Session EzPz Mod, the patch that let Map Switcher 2.0 load custom maps without unpacking the game.
    source: https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v2.0.0
  - name: Gabisonfire
    role: Helped build the mod manager's free Asset Store and its app updater.
    source: https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v2.3.0
  - name: Illusory
    role: Makes the Unreal Mod Unlocker, which Session Mod Manager has used to patch the game since 2020, and runs a Discord of over 40,000 Unreal modders.
    url: https://illusory.dev/
    source: https://illusory.dev/
  - name: GHFear
    role: The largest contributor to the public Unreal Mod Unlocker. Also built early Session maps, including Skate 3's Black Box Distribution park and THPS2's School II.
    url: https://github.com/GHFear
    source: https://github.com/IllusorySoftware/UnrealModUnlocker-Public
  - name: Roober, Khelldon and MaTSix
    role: Made early community maps, including Community Park, LowLife Parking Garage and the SLS 2013 Super Crown course.
    source: https://www.pcgamer.com/session-mods-custom-maps/
  - name: Redgouf
    role: Made the in-depth tutorial video credited in the mod manager's README.
    source: https://github.com/rodriada000/SessionMapSwitcher
milestones:
  - date: 2019-08-21
    title: Mod tools, "eventually"
    body: Before early access, crea-ture said modding had been a goal "ever since day one", and that official tools would come but not in the first updates.
    source: https://steamcommunity.com/app/861650/discussions/0/2763442118821365907/
  - date: 2019-09-17
    title: Early access on Steam
    body: Session opens to players on PC.
    source: https://en.wikipedia.org/wiki/Session:_Skate_Sim
  - date: 2019-09-25
    title: Session Map Switcher 1.0
    body: Eight days later, a desktop app can switch custom maps while the game is running, with no restart needed.
    who: rodriada000
    source: https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v1.0.0
  - date: 2019-10-11
    title: No more unpacking
    body: Map Switcher 2.0 uses dga711's EzPz patch instead of an unpacked game. The same day, PC Gamer reports THPS2 and Skate 3 levels running in Session.
    who: rodriada000, dga711
    source: https://www.pcgamer.com/session-mods-custom-maps/
  - date: 2020-02-19
    title: The developer talks to modders
    body: crea-ture's patch notes warn that mods made before the update will crash, and tell modders to unpatch the EZPZ patch first. The notes acknowledge the scene without offering official support.
    source: https://steamcommunity.com/games/861650/announcements/detail/2578811485588754826
  - date: 2019-11-07
    title: Session Mod Manager
    body: After a community vote, the tool gets a new name.
    who: rodriada000
    source: https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v2.2.0
  - date: 2019-11-14
    title: The Asset Store
    body: Browse and download maps, shirts, decks and wheels from community catalogs, all free, from inside the manager.
    who: rodriada000, Gabisonfire
    source: https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v2.3.0
  - date: 2020-04-26
    title: Switch to the Illusory unlocker
    body: The patch button now uses the Illusory Mod Unlocker, the approach most maps have relied on since.
    source: https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v2.6.0
  - date: 2022-09-22
    title: Full release
    body: Session leaves early access as Session, Skate Sim, on PC and consoles, published by Nacon.
    source: https://en.wikipedia.org/wiki/Session:_Skate_Sim
  - date: 2024-08-16
    title: Mod Manager 3.0
    body: A rewritten cross-platform interface adds official Linux support and lets you enable or disable mods.
    who: rodriada000
    source: https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v3.0.0
links:
  - label: Session Mod Manager
    url: https://github.com/rodriada000/SessionMapSwitcher
  - label: Illusory
    url: https://illusory.dev/
  - label: Custom maps guide
    url: https://skatemods.com/guides/sim-custom-maps/
---

## Players got there first

Before Session opened to early access, crea-ture Studios [told players](https://steamcommunity.com/app/861650/discussions/0/2763442118821365907/) that modding had been a goal "ever since day one", but that official tools would come "eventually". Players started without them. Session is an Unreal Engine 4 game, so map makers could build levels in the regular UE4 editor. What they needed was a way to make the game load those levels.

Eight days into [early access](https://en.wikipedia.org/wiki/Session:_Skate_Sim), rodriada000 released [Session Map Switcher](https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v1.0.0), which switched maps while the game was running. By October, [PC Gamer](https://www.pcgamer.com/session-mods-custom-maps/) was writing about THPS2 and Skate 3 levels rebuilt in Session, "where the modding community is just getting started". Several of those levels, Skate 3's Black Box Distribution park and THPS2's School II, were by GHFear, who also became the largest contributor to Illusory's [Unreal Mod Unlocker](https://github.com/IllusorySoftware/UnrealModUnlocker-Public). GHFear also appears in the Skate 3 and THPSPro histories.

## A tool that kept up with the game

Getting maps to load meant patching the game, and the method changed several times. First it required an unpacked game. Then [dga711's EzPz patch](https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v2.0.0) replaced that, and from April 2020 the [Illusory Mod Unlocker](https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v2.6.0) took over. Meanwhile the switcher grew into **Session Mod Manager**. It gained a free [Asset Store](https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v2.3.0) for maps and gear, built with Gabisonfire, and a catalog tool so modders could run their own stores. Game updates broke mods often enough that the manager [warns](https://github.com/rodriada000/SessionMapSwitcher/releases) about assets older than the April 2020 engine update.

## Today

Session left early access as *Session: Skate Sim* in September 2022. As of 2023, players still described the Illusory Discord as [pretty much the only place](https://steamcommunity.com/app/861650/discussions/0/3806154780689885021/) to get mods. [Session Mod Manager 3.0](https://github.com/rodriada000/SessionMapSwitcher/releases/tag/v3.0.0) runs on Linux, and its last release, 3.0.5, added Epic Games support. To start playing maps, see [Custom maps in Skater XL and Session](/guides/sim-custom-maps/).
