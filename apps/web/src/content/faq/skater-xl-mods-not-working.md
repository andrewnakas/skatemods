---
question: Why aren't my Skater XL mods working?
answer: Usually a game update switched Unity Mod Manager off or left a script mod out of date. Open Unity Mod Manager and click Install again, then update the mod to a version built for your game version. For maps that don't show up, check Windows Controlled Folder Access.
category: other-games
games: [skater-xl]
related: [guides/skater-xl-mods, guides/sim-custom-maps, faq/skater-xl-vs-session]
order: 32.7
updated: 2026-10-10
---

Work through these in order.

## 1. Reinstall Unity Mod Manager after every game update

A Skater XL update replaces game files and can leave script mods switched off. Open Unity Mod Manager, select Skater XL and click **Install** again before you launch ([Steam thread](https://steamcommunity.com/app/962730/discussions/0/3057367211666914742/)). Use the [latest UMM](https://www.nexusmods.com/site/mods/21).

## 2. Get the version of the mod built for your game

Script mods hook the game's code, so a mod built for an older game version may load and do nothing, or break something. After the 1.0 release in 2020, players found their UMM menu opened but most mods did nothing until they installed versions released after 1.0 ([Steam thread](https://steamcommunity.com/app/962730/discussions/0/2798376797402815806)). XXLMod is the common case: install the release that matches your game version, or the camera breaks ([XXLMod](https://github.com/DawgVinciSXL/XXLMod)).

## 3. Try one mod at a time

Remove every script mod, then add them back one by one to find the one that breaks.

## 4. Maps don't appear

- **Subscribed through mod.io?** Let the download finish in the Mod Browser, then restart the game.
- **Installed by hand?** Maps go in `Documents\SkaterXL\Maps`. Download them with your browser's normal save, not "Save as", so they don't end up as text files.
- **Still nothing?** Windows **Controlled Folder Access** can stop the game reading `Documents`. Add `SkaterXL.exe` under Windows Security → Ransomware protection → Allow an app ([Steam thread](https://steamcommunity.com/app/962730/discussions/0/1874001136342107244)).
- **Map looks wrong after a patch?** Updates that changed lighting have broken maps before. Check the map's mod.io page for a re-release.

## 5. Mod menus won't open

Each mod picks its own hotkey, and they differ. Check the mod's page. On Steam Deck, bind the key to a back button.

Full setup steps: [Skater XL mods](/guides/skater-xl-mods/).
