---
question: "ReSkate not launching after a skate. update?"
answer: skate. updated on Steam on October 13, 2026. If ReSkate was in Steam's skate. folder, the update replaced the game build it needs. Move ReSkateLauncher.exe, ReSkate.dll, Mods and ReSkateLauncher.settings.json to a new empty folder, run the launcher there and let it download its own copy of the game.
category: other-games
games: [skate-2025]
related: [guides/play-skate-with-reskate, faq/reskate-not-working, faq/reskate-steam-deck]
order: 35.5
updated: 2026-10-13
latestReskate: true
---

ReSkate runs one specific build of skate. (Steam build `25414733`). On October 13, 2026, EA's [Season 5 mid-season update](https://www.ea.com/games/skate/skate/news/skate-mid-season-5-update) reached Steam. Anyone who had extracted ReSkate into Steam's skate. folder found that Steam had updated the game underneath it, so ReSkate stopped launching.

The ReSkate team said beforehand, in its Discord, that it **won't update ReSkate to support the new build**. To play EA's update, use the normal game from Steam.

## The fix

ReSkate belongs in its own folder, with its own copy of the game that Steam can't touch. This is what the team posted in its Discord's news channel and the [README](https://github.com/Dingo-Shenanigans/ReSkate#getting-started) now says:

1. Make a new, empty folder, for example `C:\Games\ReSkate`.
2. Open Steam's skate. folder (Steam → skate. → Manage → Browse local files).
3. Move these into the new folder:
   - `ReSkateLauncher.exe`
   - `ReSkate.dll`
   - your `Mods` folder, if you have one
   - `ReSkateLauncher.settings.json`, if it's there
4. Run `ReSkateLauncher.exe` from the new folder.
5. Sign in to Steam when it asks, with the account that owns skate. (a QR code from the Steam app, or username, password and Steam Guard).
6. Let it download the game, about 14 GB, then press **PLAY**.

After that, Steam updates won't break ReSkate again.

## Questions

- **Do I uninstall skate. from Steam?** No. Leave it installed; ReSkate just doesn't use that copy.
- **Do I need 14 GB free?** Yes, on the drive where you put the new folder.
- **ReSkate was already in its own folder.** Then nothing changed for you.
- **Linux or Steam Deck?** Same fix. Move the files to their own folder, such as `~/Games/ReSkate`, and change skate.'s Steam launch option to the launcher's new path. Our [Steam Deck and Linux steps](/faq/reskate-steam-deck/) have the exact line. The README says the launcher now refuses to run from Steam's skate. folder ([commit](https://github.com/Dingo-Shenanigans/ReSkate/commit/375605b9fe)).

Still stuck? [ReSkate isn't working](/faq/reskate-not-working/) lists other errors and fixes.
