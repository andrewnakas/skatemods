---
title: Play Tony Hawk's Underground on a PS Vita
description: Install the native THUG port on a hacked Vita, using data from your own Xbox disc. Covers what you need, the install, the controls and the known bugs.
game: tony-hawk-classic
level: intermediate
order: 12
updated: 2026-10-06
downloads:
  - { label: "thug_vita.vpk (latest release)", url: "https://github.com/iwannagooutside/thug-vita-port/releases/latest/download/thug_vita.vpk", note: "the game itself, about 3 MB" }
  - { label: "THUG Vita source and readme", url: "https://github.com/iwannagooutside/thug-vita-port" }
  - { label: "Vita hacks guide", url: "https://vita.hacks.guide", note: "HENkaku / Enso custom firmware" }
  - { label: "VitaShell", url: "https://github.com/TheOfficialFloW/VitaShell/releases/latest", note: "installs the .vpk and copies files" }
  - { label: "ShaRKF00D", url: "https://github.com/Rinnegatamante/ShaRKF00D/releases", note: "puts libshacccg.suprx in place" }
  - { label: "extract-xiso", url: "https://github.com/XboxDev/extract-xiso/releases/latest", note: "unpacks your Xbox disc image" }
---

[THUG Vita](https://github.com/iwannagooutside/thug-vita-port) runs *Tony Hawk's Underground* (2003) natively on the PS Vita's ARM processor. It isn't an emulator. iwannagooutside released it on **October 5, 2026** ([trailer](https://www.youtube.com/watch?v=XKwEK5B5K2w)), and v1.0.1 fixed phantom button presses the same day. Story mode, free skate, Create-a-Skater and every level work, and the readme says most levels run at or near 60 fps.

<div class="callout">

**Where the code comes from.** The port builds on [kisak-thug](https://github.com/SwagSoftware/kisak-thug) by SwagSoftware, a Windows port of THUG's original source code. That source has been [circulating publicly](https://github.com/SwagSoftware/kisak-thug#lore) for about ten years, but Activision never released or licensed it. Neither project includes any game data, so you supply your own disc. The readme also says the port was "built with agentic AI and a custom harness" that builds the game, runs it on a real Vita and reads the logs, and it credits Anthropic's Claude models with most of the porting work. It's brand new, so expect bugs.

</div>

## What you need

- A PS Vita on custom firmware (HENkaku or Enso). If yours isn't set up, follow [vita.hacks.guide](https://vita.hacks.guide). The PS TV isn't supported, because the spin buttons are on the touchscreen.
- [VitaShell](https://github.com/TheOfficialFloW/VitaShell/releases/latest) for installing and copying.
- `libshacccg.suprx` in `ur0:data/`. The game compiles its shaders on the console and won't start without it. Run [ShaRKF00D](https://github.com/Rinnegatamante/ShaRKF00D/releases) once and it puts the file there.
- A disc image of the **USA Xbox** version of THUG, dumped from a disc you own. The PS2, GameCube and PAL versions won't work, because the port reads the Xbox data files directly.
- About 1.6 GB free on the memory card.

## Install

1. **Extract the game data.** Run [extract-xiso](https://github.com/XboxDev/extract-xiso/releases/latest) on your ISO:

   ```
   extract-xiso -x "Tony Hawk's Underground (USA).iso"
   ```

   You need the `data` folder inside the result. Delete the `movies` folder inside it to save 1.6 GB, since the port can't play the videos yet.
2. **Copy it to the Vita.** In VitaShell, copy that folder so the files end up in `ux0:data/thug/Data/`. Use USB, because FTP can take an hour or more. Case doesn't matter, but don't nest it as `Data/data/`.
3. **Install the game.** Copy [`thug_vita.vpk`](https://github.com/iwannagooutside/thug-vita-port/releases/latest/download/thug_vita.vpk) to the Vita, open it in VitaShell and install it.
4. **Play.** Tap the bubble, then *Start*. The first load of a big level takes about ten seconds.

To update, install the new `.vpk` over the old one. Saves live in `ux0:data/thug/save/` and aren't touched by reinstalling.

## Controls

The Vita has no L2 or R2, so the port moves them to the shoulder buttons and puts the old L1 and R1 on the touchscreen.

| PS Vita | PS2 button | Does |
|---|---|---|
| L | L2 | Nollie (tap while rolling) |
| R | R2 | Switch stance, reverts, spine transfers |
| Bottom-left corner of the screen | L1 | Spin left |
| Bottom-right corner of the screen | R1 | Spin right. Off the board, hold it to grab ledges and ladders |
| Both bottom corners | L1 + R1 | Get off or back on the board |

The face buttons, sticks and START work as on the PS2. The rear touchpad does nothing, so you can rest your fingers on it.

## Known problems

These are from the [issue tracker](https://github.com/iwannagooutside/thug-vita-port/issues) as of October 6:

- **No videos.** The intro and cutscene videos are Bink files the port can't decode yet, so they're skipped ([#3](https://github.com/iwannagooutside/thug-vita-port/issues/3)).
- **No online play.** THUG's online service shut down years ago.
- **Create-a-Park** can't make a park bigger than the default size, and pre-made parks don't load ([#5](https://github.com/iwannagooutside/thug-vita-port/issues/5)).
- A player reports they can't do manuals ([#6](https://github.com/iwannagooutside/thug-vita-port/issues/6)), and the skater's shadow is missing on some surfaces ([#8](https://github.com/iwannagooutside/thug-vita-port/issues/8)).

## If it doesn't start

- **Closes at once or stays on a black screen:** check that `ur0:data/libshacccg.suprx` exists.
- **Can't find the game files:** the path must be exactly `ux0:data/thug/Data/`, with files from the USA Xbox disc.
- **Crashes:** the game writes a log to `ux0:data/thug/thug.log`. Attach it to a [new issue](https://github.com/iwannagooutside/thug-vita-port/issues) with the level and what you were doing.

On PC, the patched original is the easier route. See [Get started with THUG Pro, reTHAWed and PARTYMOD](/guides/thug-pro-and-partymod/) for PARTYMOD's THUG patch.
