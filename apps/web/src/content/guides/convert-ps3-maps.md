---
title: Convert PS3 maps to the recomp and .skate
description: Turn a PS3 Skate 3 custom map into an Xbox 360 DLC pack for the recomp and a .skate map for the Rust engine. Use the GUI, the CLI, or skatemods.
game: skate-3
level: intermediate
order: 3
updated: 2026-10-01
---

Almost every Skate 3 custom map was built for PS3. The recomp runs the Xbox 360 game, whose world format differs in five object types: vertex buffers, index buffers, vertex descriptors, mesh island data and textures (linear DXT on PS3, Xenos-tiled on 360). The [PS3 → X360 transcoder](https://github.com/andrewnakas/skate3-ps3-to-x360) rebuilds each one. It was verified against EA's own PS3 and Xbox builds of University, where 5,000+ meshes come out byte-identical.

## What a PS3 map looks like

- An archive (`.rar`, `.zip`, `.7z`) containing a `DIST_<Name>` folder of `.psf` stream files, **or**
- An EA big file, often named **`.big.edat`**. Despite the extension it isn't PS3 DRM, just EA's "EB" archive. It contains `data/content/world/stream/DIST_<Name>/`.

## Option 1: the Windows GUI

1. Download the [PS3 Map Importer](https://github.com/andrewnakas/skate3-ps3-map-importer) and run `START-MAP-IMPORTER-GUI.bat`. On first run it installs Git, .NET 9 and 7-Zip.
2. Drag in the map archive or folder. It finds the real `DIST_*` folder inside wrapper folders.
3. Press **CONVERT**, then drop the `.big` into your recomp's `dlc` folder or [the Level Loader](/guides/install-community-maps/).

## Option 2: the skatemods CLI (Linux, macOS, Windows)

This is the same pipeline the site runs. It needs Python 3.11+, the .NET 9 SDK and `bsdtar`.

```bash
git clone https://github.com/andrewnakas/skatemods && cd skatemods
converter/fetch_tools.sh                 # pinned converter sources
pip install -r converter/requirements.txt
converter/convert.sh ~/Downloads/MyMap.rar out/
```

You get:

```
out/recomp/mymap_00000000.big    # Xbox 360 DLC for the recomp / Level Loader
out/skate/MyMap.skate            # for the Rust engine
out/manifest.jsonl               # what converted, sizes, timings
```

No game files are needed for either step. A typical park converts in about 10 seconds.

## Option 3: upload it here

Once accounts open, upload any map on [skatemods.com](/convert/) and download every format.

## Credit the author

Converted maps still belong to their creators. Keep their name on it when you share.
