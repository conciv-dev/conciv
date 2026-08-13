#!/usr/bin/env bash
set -euo pipefail

# Blocks Claude Code Write/Edit/MultiEdit calls that would create or modify a
# per-component .css file under a ui-kit package's src/, per the repo rule:
# component styling goes through packages/uno-preset, .css is only for
# tokens.css and theme/ sheets. Mirrors scripts/check-ui-kit-css.ts's
# pattern/allowlist so the three enforcement layers (this hook, prek, CI)
# agree on exactly one definition of "banned path".
#
# Same stdin JSON contract as turbo-filter-gate.sh: a PreToolUse hook reads
# the tool call as JSON on stdin and blocks by exiting 2 with a stderr
# message. Anything unparseable fails open.

if ! command -v jq >/dev/null 2>&1; then
  echo "ui-kit-css-gate: jq not on PATH, skipping check." >&2
  exit 0
fi

INPUT="$(cat)"
FILE_PATH="$(jq -r '.tool_input.file_path // empty' <<<"$INPUT" 2>/dev/null || true)"

[ -n "$FILE_PATH" ] || exit 0

NORMALIZED="$FILE_PATH"
while printf '%s\n' "$NORMALIZED" | grep -Eq '(^|/)[^/]+/\.\.(/|$)|(^|/)\.(/|$)'; do
  NORMALIZED="$(printf '%s\n' "$NORMALIZED" | sed -E 's#(^|/)[^/]+/\.\.(/|$)#\1#; s#(^|/)\.(/|$)#\1#; s#//#/#g')"
done

printf '%s\n' "$NORMALIZED" | grep -Eq '(^|/)packages/ui-kit-[^/]+/src/.*\.css$' || exit 0

BASENAME="$(basename "$NORMALIZED")"
if [ "$BASENAME" = "tokens.css" ]; then
  exit 0
fi
if printf '%s\n' "$NORMALIZED" | grep -Eq '(^|/)theme/'; then
  exit 0
fi

{
  echo "ui-kit-css-gate: BLOCKED: $FILE_PATH is a banned per-component ui-kit .css file."
  echo
  echo "component styles belong in packages/uno-preset (keyframes -> src/animation.ts, animation"
  echo "shortcuts -> src/motion.ts, effects/rules/preflights -> the preset), .css is only for"
  echo "tokens/themes."
} >&2

exit 2
