---
title: Install community maps with the Level Loader
description: Import any number of Skate 3 DLC map packs into the recomp and boot straight into the one you want.
game: skate-3
level: beginner
order: 2
updated: 2026-10-01
---

The game can only manage a few DLC packs at once, and every community map fights over the same slots. The **Skate 3 Level Loader** solves this by owning map selection. You keep unlimited packs imported, and it stages exactly one per launch.

## Install

1. Download your platform's archive from the [Level Loader releases](https://github.com/andrewnakas/skate3-level-loader/releases). It includes a patched engine.
2. Unpack the engine archive into an `engine/` folder **beside** the launcher. On macOS, put it beside the `.app`, not inside it.
3. On first run, point it at your Skate 3 ISO and Title Update 3, or let it reuse an existing skate3recomp install.
4. Run `./skate3loader doctor` once to check everything.

## Add maps

Drag a `.big` (or a folder of them) onto the window. Or use the CLI:

```bash
./skate3loader scan ~/Downloads/packs     # import every usable pack in a folder
./skate3loader import path/to/pack.big    # import one pack
./skate3loader                            # open the library and click a map
```

Two pack formats work:

| Format | Notes |
|---|---|
| STFS container (`LIVE`/`CON`/`PIRS`) | Preferred. Installs itself. |
| `.big` + `.header` | The header must be next to the `.big`. |

### Packs without a `.header`

Plenty of community packs ship only `name_00000000.big`. Generate the 328-byte header:

```bash
python3 scripts/makeheader.py "path/to/pack_00000000.big"
./skate3loader scan ~/Downloads/packs
```

## When a map won't load

```bash
./skate3loader manual <pack-id> --windowed
```

This stages the pack and gets out of the way: no automation, so you navigate the game's own menus. That's how the "14 broken maps" turned out not to be broken. See the [maps catalog](/maps/) for which maps are known to boot and which stall.

## PS3-only maps

Most Skate 3 custom maps were made for PS3. [Convert them first](/guides/convert-ps3-maps/), then import the `.big` here.
