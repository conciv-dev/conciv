#!/usr/bin/env bash
set -euo pipefail

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/build/ConcivDemo.app"

SDK_PATH="$(xcrun --sdk iphonesimulator --show-sdk-path)"
ARCH="$(uname -m)"
TARGET="${ARCH}-apple-ios17.0-simulator"

rm -rf "$APP"
mkdir -p "$APP"

# Single-module swiftc compile of the demo app plus the REAL ConcivWidget SDK tree.
# Never vendor a copy of the SDK here: a frozen snapshot silently masks SDK fixes
# (stale-build phantom). -D DEBUG is required: the SDK's attach API is #if DEBUG.
SDK_SOURCES_DIR="$ROOT/../ConcivWidget/Sources/ConcivWidget"
SOURCES=$(find "$ROOT/Sources/App" "$SDK_SOURCES_DIR" -name '*.swift' | sort)

# shellcheck disable=SC2086
xcrun --sdk iphonesimulator swiftc \
  -sdk "$SDK_PATH" -target "$TARGET" -module-name ConcivDemo \
  -Onone -g -D DEBUG \
  -framework UIKit -framework WebKit \
  -o "$APP/ConcivDemo" \
  $SOURCES

plutil -convert binary1 -o "$APP/Info.plist" "$ROOT/Info.plist"
printf 'APPL????' > "$APP/PkgInfo"
codesign --force --sign - --timestamp=none "$APP"

echo "Built $APP"
