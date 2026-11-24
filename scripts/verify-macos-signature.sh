#!/usr/bin/env bash
# Fails unless the built .app is signed as a whole bundle and both architectures of the universal
# binary carry a CDHash. An unsigned bundle (only the linker signature on arm64, nothing on x86_64)
# makes macOS ask for the camera and Accessibility again on every start (docs/release.md).
#   scripts/verify-macos-signature.sh ["path/to/Magic Hand.app"]
set -euo pipefail

app="${1:-src-tauri/target/universal-apple-darwin/release/bundle/macos/Magic Hand.app}"

echo "== codesign --verify --deep --strict --verbose=2"
codesign --verify --deep --strict --verbose=2 "$app"

for arch in arm64 x86_64; do
  echo "== codesign -dvvv --arch $arch"
  info=$(codesign -dvvv --arch "$arch" "$app" 2>&1)
  echo "$info"
  cdhash=$(sed -n 's/^CDHash=//p' <<<"$info")
  if [[ -z "$cdhash" ]]; then
    echo "::error::no CDHash for $arch in $app"
    exit 1
  fi
done

echo "== designated requirement"
codesign -d -r- "$app" 2>&1
echo "signature ok"
