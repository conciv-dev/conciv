#!/usr/bin/env bash
set -euo pipefail

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
SIM_NAME="${SIM_NAME:-iPhone 17 Pro}"
UDID="${UDID:-$(xcrun simctl list devices "$SIM_NAME" available | grep -Eo '[0-9A-Fa-f-]{36}' | head -1)}"
if [ -z "$UDID" ]; then
  echo "No available simulator named '$SIM_NAME'. Set UDID or SIM_NAME to override." >&2
  exit 1
fi
BUNDLE_ID="dev.conciv.ConcivDemo"

"$ROOT/build.sh"

xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
open -a Simulator
xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" "$ROOT/build/ConcivDemo.app"
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true

# No CONCIV_URL: exercise SDK auto-discovery (pairing file plus pinned-port probe).
# To force an explicit core origin instead, launch with
# SIMCTL_CHILD_CONCIV_URL="http://127.0.0.1:4599" xcrun simctl launch ...
xcrun simctl launch "$UDID" "$BUNDLE_ID"

echo "Launched $BUNDLE_ID on $UDID"
