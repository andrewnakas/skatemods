#!/usr/bin/env bash
# Publishes Sk3Wasm (browser-wasm, trimmed) into apps/studio/public/dotnet/ (gitignored).
#   apps/studio/dotnet/build.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
export PATH="$DOTNET_ROOT:$PATH" DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
out="$here/../public/dotnet"
stage="$here/.publish"
rm -rf "$stage"
dotnet publish "$here/Sk3Wasm" -c Release -o "$stage" \
  -p:InformationalVersion="0.1.0+$(date -u +%Y%m%dT%H%M%SZ)" -v q -nologo
rm -rf "$out"; mkdir -p "$out"
cp -R "$stage/wwwroot/_framework" "$out/"
du -sh "$out/_framework"
