#!/usr/bin/env bash
# Restores the Map Studio test data (work/testmaps, work/spike-out) from the private R2 bucket.
# Files are listed in test-data.txt as "<bytes> <path under work/>". Needs `wrangler login`.
#   apps/studio/scripts/test-data.sh            # everything
#   apps/studio/scripts/test-data.sh testmaps/  # only paths starting with this
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../../.."
cd "$repo/apps/api"
while read -r size path; do
  [[ "$path" == "${1:-}"* ]] || continue
  dest="$repo/work/$path"
  [[ -f "$dest" && $(stat -f %z "$dest" 2>/dev/null || stat -c %s "$dest") == "$size" ]] && continue
  mkdir -p "$(dirname "$dest")"
  npx wrangler r2 object get "skatemods-maps/archive/studio-test/$path" --remote --file "$dest" >/dev/null
  echo "restored $path"
done < "$here/test-data.txt"
