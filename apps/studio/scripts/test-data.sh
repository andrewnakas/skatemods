#!/usr/bin/env bash
# Restores the Map Studio test data (work/testmaps, work/spike-out) from the private GitHub repo
# andrewnakas/skatemods-testdata (release "test-data"). Needs `gh auth login` with access to it.
# Some files are converted from retail Skate 3 maps, so that repo must stay private.
#   apps/studio/scripts/test-data.sh             # both archives
#   apps/studio/scripts/test-data.sh testmaps    # only work/testmaps
#   apps/studio/scripts/test-data.sh spike-out   # only work/spike-out
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$here/../../../work"
mkdir -p "$work"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
patterns=(-p SHA256SUMS)
if [[ -n "${1:-}" ]]; then patterns+=(-p "$1.tar*"); else patterns+=(-p 'testmaps.tar.gz' -p 'spike-out.tar'); fi
gh release download test-data -R andrewnakas/skatemods-testdata -D "$tmp" "${patterns[@]}"
(cd "$tmp" && shasum -a 256 -c --ignore-missing SHA256SUMS)
for archive in "$tmp"/*.tar*; do tar xf "$archive" -C "$work"; echo "restored $(basename "$archive")"; done
