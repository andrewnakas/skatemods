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

## Website

The site lives in [`apps/web`](apps/web): an Astro static site with game pages, guides, the Skate 3 modding history, a tools directory and the community map catalog.

## Status

Phase 0 done: PS3 → recomp → `.skate` and X360 → `.skate` run on a free `ubuntu-latest` runner with no game data (about 10 s and under 0.5 GB of RAM per map; `.github/workflows/convert-spike.yml`). The static site (Phase 1) is built. Accounts and uploads come next.
