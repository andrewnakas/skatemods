# skatemods.com

Open-source hub for modding every skate game, centered on Skate 3: guides, community map hosting, and automatic map conversion between platforms.

## Map conversion

Upload a map from one platform and get the others:

| From | → recomp (Xbox 360 `.big` DLC) | → `.skate` (Rust engine) |
|---|---|---|
| PS3 DIST / `.big.edat` | ✅ [skate3-ps3-to-x360](https://github.com/andrewnakas/skate3-ps3-to-x360) | ✅ via the recomp pack |
| Xbox 360 DIST / `.big` | (already) | ✅ [skate-3-rust-engine](https://github.com/andrewnakas/skate-3-rust-engine) asset pipeline |
| `.skate` | not yet | (already) |

No game data is needed or shipped; you supply maps.

```bash
converter/fetch_tools.sh              # clone the pinned converters into work/tools
pip install -r converter/requirements.txt
converter/convert.sh <map archive|.big|folder> out/
```

Requires Python 3.11+, .NET 9 SDK and `bsdtar`.

## Status

Phase 0: conversion pipeline proven on GitHub Actions (`.github/workflows/convert-spike.yml`). Site, accounts and uploads are next.
