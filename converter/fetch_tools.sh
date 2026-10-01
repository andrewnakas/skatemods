#!/usr/bin/env bash
# Clone the converter sources at the commits pinned in pins.env.
# usage: fetch_tools.sh [tools dir]   (default: ./work/tools)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$here/pins.env"
tools="${1:-$PWD/work/tools}"
mkdir -p "$tools"

pin() {  # pin <repo> <sha> <dir>
  [[ -d $3/.git ]] && [[ $(git -C "$3" rev-parse HEAD) == "$2" ]] && return
  rm -rf "$3"; git init -q "$3"
  git -C "$3" fetch -q --depth 1 "https://github.com/$1" "$2"
  git -C "$3" checkout -q FETCH_HEAD
}

pin "$RUST_ENGINE_REPO" "$RUST_ENGINE_SHA" "$tools/rust-engine"
pin "$PS3X360_REPO" "$PS3X360_SHA" "$tools/ps3x360"
pin "$DUMBADS_REPO" "$DUMBADS_SHA" "$tools/ps3x360/external/DumbadsSkate3ModdingTools"
echo "tools ready in $tools"
