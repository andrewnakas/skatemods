#!/usr/bin/env bash
# Convert one uploaded map to every target the pipeline supports.
#
#   PS3 DIST  -> recomp .big (sk3 build-dlc) -> .skate
#   X360 DIST -> .skate
#
# usage: convert.sh <input file or folder> <out dir>
# env:   TOOLS_DIR  where the pinned converter checkouts live (default: ./work/tools)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
input="$1"; out="$(mkdir -p "$2" && cd "$2" && pwd)"
tools="${TOOLS_DIR:-$PWD/work/tools}"
engine="$tools/rust-engine"
sk3="$tools/ps3x360/sk3"
results="$out/manifest.jsonl"
: > "$results"

record() { printf '%s\n' "$1" >> "$results"; }
size() { stat -c %s "$1" 2>/dev/null || stat -f %z "$1"; }

slug() { tr '[:upper:]' '[:lower:]' <<<"$1" | tr -cd 'a-z0-9'; }

python3 "$here/unpack.py" "$engine" "$input" "$out/unpacked" | while read -r line; do
  kind=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["platform"])' "$line")
  dist=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["dist"])' "$line")
  name=$(basename "$dist"); label=${name#DIST_}
  echo "::group::$label ($kind)"
  if [[ $kind == ps3 ]]; then
    big="$out/recomp/$(slug "$label")_00000000.big"
    mkdir -p "$out/recomp"
    start=$SECONDS
    if "$sk3" build-dlc "$dist" "$big" --name="$label" --rebuild-vertices < /dev/null > "$out/$label.recomp.log" 2>&1; then
      record "{\"map\":\"$label\",\"source\":\"ps3\",\"target\":\"recomp\",\"ok\":true,\"file\":\"recomp/$(basename "$big")\",\"bytes\":$(size "$big"),\"seconds\":$((SECONDS-start))}"
      # The rust engine's big reader rejects sk3's compressed chunks, so the
      # .skate path takes an uncompressed X360 DIST straight from the transcoder.
      "$sk3" convert-dist "$dist" "$out/from-recomp/$name" --no-compress --rebuild-vertices < /dev/null >> "$out/$label.recomp.log" 2>&1
      dist="$out/from-recomp/$name"
    else
      record "{\"map\":\"$label\",\"source\":\"ps3\",\"target\":\"recomp\",\"ok\":false,\"log\":\"$label.recomp.log\"}"
      tail -40 "$out/$label.recomp.log"
      echo "::endgroup::"; continue
    fi
  fi
  start=$SECONDS
  mkdir -p "$out/skate"
  if python3 "$here/to_skate.py" "$engine" "$dist" "$out/skate" < /dev/null > "$out/$label.skate.log" 2>&1; then
    record "{\"map\":\"$label\",\"source\":\"$kind\",\"target\":\"skate\",\"ok\":true,\"file\":\"skate/$label.skate\",\"bytes\":$(size "$out/skate/$label.skate"),\"seconds\":$((SECONDS-start))}"
  else
    record "{\"map\":\"$label\",\"source\":\"$kind\",\"target\":\"skate\",\"ok\":false,\"log\":\"$label.skate.log\"}"
    tail -40 "$out/$label.skate.log"
  fi
  rm -rf "$out/skate/work"
  echo "::endgroup::"
done
# Keep only deliverables and logs.
rm -rf "$out/unpacked" "$out/from-recomp"
cat "$results"
