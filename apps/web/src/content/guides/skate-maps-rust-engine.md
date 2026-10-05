---
title: .skate maps in the Rust engine
description: Load, convert and understand the .skate format used by the Skate 3 Rust and Bevy engine and the browser build.
game: skate-3
level: advanced
order: 5
updated: 2026-10-01
downloads:
  - { label: "Skate 3 Rust engine", url: "https://github.com/SK8-ENGINE/skate-3-rust-engine", note: "source; build it or use PLAY.bat from a checkout" }
  - { label: "Browser build", url: "/play/", note: "no install" }
  - { label: "skatemods converter", url: "https://github.com/andrewnakas/skatemods/tree/main/converter", note: "turns Skate 3 maps into .skate files" }
---

The [Skate 3 Rust engine](https://github.com/SK8-ENGINE/skate-3-rust-engine) reimplements skating in Rust and Bevy. Maps are single portable `.skate` files instead of DLC packs.

## Load one

Clone or download the [engine repository](https://github.com/SK8-ENGINE/skate-3-rust-engine), then drag a `.skate` file onto `PLAY.bat`, or use the command line:

```powershell
.\scripts\Launch.ps1 -Map 'C:\path with spaces\park.skate'
```

In game, **Escape** opens the map menu so you can switch without restarting. In the [browser build](/play/), add `?map=Name` to the URL.

## What's inside

`.skate` files are versioned (SKATE01–15). The reader supports raw, zlib and Zstandard blocks. A file can carry:

- **Visual geometry**: positions, normals, UV0/UV1, material groups, packed tangent frames
- **Materials**: albedo, normal, ORM, emissive, alpha, and lightmaps decoded to half-float
- **Collision**: a separate authored mesh, or an embedded retail `RWCM` cluster archive with native edge codes
- **Gameplay**: spawn, grind-rail polylines, surface types, lights, sky metadata

Some records are parsed but have no runtime yet: doors stop a map from launching, and NPC routes and area lights only produce warnings. See the engine's [README](https://github.com/SK8-ENGINE/skate-3-rust-engine#readme).

## Convert Skate 3 maps to .skate

Any Xbox 360 `DIST_*` world converts with the engine's own asset pipeline. A PS3 map goes through the [PS3 transcoder](/guides/convert-ps3-maps/) first. The [skatemods converter](https://github.com/andrewnakas/skatemods/tree/main/converter) does both steps:

```bash
converter/convert.sh ~/Downloads/JumpCity.7z out/
# out/skate/JumpCity.skate
```

Community packs sometimes include an empty grind-spline table that the stock decoder rejects. The skatemods converter treats it as "no rails" instead of failing.
