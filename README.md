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

## Community map hosting

[`apps/api`](apps/api) is a Cloudflare Worker on `skatemods.com/api/*` (D1 + R2):

- **Sign in with GitHub.** Public profile only.
- **Rights first.** Uploaders declare authorship or permission (with details), credit the author, pick a license and confirm the upload policy. Maps stay private until a moderator approves them.
- **Automatic checks** (`converter/policy.py`) on the runner. Rejects executables, retail districts, and packs that are mostly retail files (`converter/make_stock_hashes.py` builds the hash list from your own disc).
- **Conversion.** `.github/workflows/convert.yml` claims jobs with its GitHub OIDC token, so no shared secrets. `converter/run_jobs.py` converts and uploads the outputs.
- **Reports and takedowns** from every map page; moderation at `/admin/`.

Local full stack: `cd apps/web && npm run build && cd ../api && npx wrangler d1 migrations apply skatemods --local && npx wrangler dev -c wrangler.local.toml`. Then `npm test` in `apps/api` runs the end-to-end suite (dev login and dev runner token exist only in that local config).

## Status

Phase 0 done: PS3 → recomp → `.skate` and X360 → `.skate` run on a free `ubuntu-latest` runner with no game data (about 10 s and under 0.5 GB of RAM per map). Phase 1: the static site is live. Phase 2: accounts, uploads, moderation and cloud conversion are live.
