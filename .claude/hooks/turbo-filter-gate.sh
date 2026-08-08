#!/usr/bin/env bash
set -euo pipefail

# Blocks Claude Code turbo test/typecheck runs that use a TRAILING `...` filter.
#
# In turbo, `--filter=pkg...` selects the package AND ALL OF ITS DEPENDENCIES
# (upstream), not its dependents. Agent gate commands were written that way on
# the belief it meant "dependents", so every gate re-ran the suites of ~28
# untouched upstream packages: measured 28 real test suites for
# `--filter=@conciv/app...` versus 1 for `--filter=@conciv/app`.
#
# Dropping the suffix loses nothing: build/test/typecheck all declare
# `dependsOn: ["^build"]`, so dependencies are still BUILT, just not re-tested.
#
# The LEADING form `--filter=...pkg` is the dependents selector and is allowed.
# `build` with a trailing `...` is allowed (30 vs 28 tasks, not worth blocking).
# Unfiltered runs (the root `pnpm test` scripts) and `--dry` runs are allowed.
# Anything unparseable fails OPEN: a gate that blocks on ambiguity is worse than
# no gate.

if ! command -v jq >/dev/null 2>&1; then
  echo "turbo-filter-gate: jq not on PATH, skipping check." >&2
  exit 0
fi

INPUT="$(cat)"
CMD="$(jq -r '.tool_input.command // empty' <<<"$INPUT")"

[ -n "$CMD" ] || exit 0

printf '%s\n' "$CMD" | grep -Eq '(^|[[:space:];|&()])turbo[[:space:]]+run([[:space:]]|$)' || exit 0

if printf '%s\n' "$CMD" | grep -Eq '(^|[[:space:]])--dry(-run)?([=[:space:]]|$)'; then
  exit 0
fi

TASKS="$(printf '%s\n' "$CMD" | sed -E 's/.*turbo[[:space:]]+run[[:space:]]+//; s/[[:space:]]+-.*//')"
printf '%s\n' "$TASKS" | grep -Eqw 'test|typecheck' || exit 0

SELECTORS="$(printf '%s\n' "$CMD" | grep -oE -- '--filter[=[:space:]]+[^[:space:]]+' | sed -E "s/--filter[=[:space:]]+//; s/^['\"]//; s/['\"]$//" || true)"
[ -n "$SELECTORS" ] || exit 0

OFFENDERS=""
while IFS= read -r sel; do
  [ -n "$sel" ] || continue
  case "$sel" in
    ...*) continue ;;
  esac
  case "$sel" in
    *...) OFFENDERS="${OFFENDERS}${sel}"$'\n' ;;
  esac
done <<<"$SELECTORS"

[ -n "$OFFENDERS" ] || exit 0

FIXED="$(printf '%s\n' "$CMD" | sed -E 's/(--filter[=[:space:]]+["'"'"']?[^[:space:]"'"'"']+)\.\.\.(["'"'"']?)/\1\2/g')"

{
  echo "turbo-filter-gate: BLOCKED — trailing '...' on a test/typecheck filter."
  echo
  printf 'Rejected selector(s): %s' "$OFFENDERS"
  echo "In turbo, 'pkg...' means the package AND ITS DEPENDENCIES (upstream) — NOT its"
  echo "dependents. On this repo that is 28 real test suites instead of 1."
  echo
  echo "Dependencies are still built without it: build/test/typecheck all declare"
  echo "dependsOn: [\"^build\"]. You lose nothing by dropping the dots."
  echo
  echo "Run this instead:"
  echo "  $FIXED"
  echo
  echo "If you truly want DEPENDENTS (did I break my consumers?), that is the leading"
  echo "form --filter=...<pkg> — and it belongs to the landing gate, not a package gate."
} >&2

exit 2
