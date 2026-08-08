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
# `--filter=...pkg...` combines both forms and still expands dependencies, so
# it is rejected too: only a filter with no trailing `...` is allowed.
# `build` with a trailing `...` is allowed (30 vs 28 tasks, not worth blocking).
# Unfiltered runs (the root `pnpm test` scripts) and `--dry` runs are allowed.
# A compound command (`&&`, `;`, `||`, `|`) is split and each `turbo run`
# invocation in it is checked independently, with its own task list and its
# own filters.
# Anything unparseable fails OPEN: a gate that blocks on ambiguity is worse than
# no gate.
#
# Quoted text (a string literal, a heredoc line, a logged message) is never a
# real invocation; the turbo-run detection and the task-list extraction run
# against the command with quoted spans stripped out, so a command that only
# CONTAINS the words "turbo run ..." inside quotes does not trip the gate.

if ! command -v jq >/dev/null 2>&1; then
  echo "turbo-filter-gate: jq not on PATH, skipping check." >&2
  exit 0
fi

strip_quoted() {
  sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g"
}

INPUT="$(cat)"
CMD="$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null || true)"

[ -n "$CMD" ] || exit 0

STRIPPED_CMD="$(printf '%s\n' "$CMD" | strip_quoted)"
printf '%s\n' "$STRIPPED_CMD" | grep -Eq '(^|[[:space:];|&()])turbo[[:space:]]+run([[:space:]]|$)' || exit 0

OFFENDERS=""

INVOCATIONS="$(printf '%s\n' "$CMD" | sed -E 's/&&|\|\||[;|]/\n/g')"

while IFS= read -r INVOCATION; do
  STRIPPED_INVOCATION="$(printf '%s\n' "$INVOCATION" | strip_quoted)"
  printf '%s\n' "$STRIPPED_INVOCATION" | grep -Eq '(^|[[:space:];|&()])turbo[[:space:]]+run([[:space:]]|$)' || continue

  if printf '%s\n' "$INVOCATION" | grep -Eq '(^|[[:space:]])--dry(-run)?([=[:space:]]|$)'; then
    continue
  fi

  TASKS="$(printf '%s\n' "$STRIPPED_INVOCATION" | sed -E 's/.*turbo[[:space:]]+run[[:space:]]+//; s/[[:space:]]+-.*//')"
  printf '%s\n' "$TASKS" | grep -Eqw 'test|typecheck' || continue

  SELECTORS="$(printf '%s\n' "$INVOCATION" | grep -oE -- '--filter[=[:space:]]+[^[:space:]]+' | sed -E "s/--filter[=[:space:]]+//; s/^['\"]//; s/['\"]\$//" || true)"
  [ -n "$SELECTORS" ] || continue

  while IFS= read -r selector; do
    [ -n "$selector" ] || continue
    case "$selector" in
      *...) OFFENDERS="${OFFENDERS}${selector}"$'\n' ;;
    esac
  done <<<"$SELECTORS"
done <<<"$INVOCATIONS"

[ -n "$OFFENDERS" ] || exit 0

FIXED="$(printf '%s\n' "$CMD" | sed -E 's/(--filter[=[:space:]]+["'"'"']?[^[:space:]"'"'"']+)\.\.\.(["'"'"']?)/\1\2/g')"

{
  echo "turbo-filter-gate: BLOCKED: trailing '...' on a test/typecheck filter."
  echo
  printf 'Rejected selector(s): %s' "$OFFENDERS"
  echo "In turbo, 'pkg...' means the package AND ITS DEPENDENCIES (upstream), NOT its"
  echo "dependents. On this repo that is 28 real test suites instead of 1."
  echo
  echo "Dependencies are still built without it: build/test/typecheck all declare"
  echo "dependsOn: [\"^build\"]. You lose nothing by dropping the dots."
  echo
  echo "Run this instead:"
  echo "  $FIXED"
  echo
  echo "If you truly want DEPENDENTS (did I break my consumers?), that is the leading"
  echo "form --filter=...<pkg>, and it belongs to the landing gate, not a package gate."
} >&2

exit 2
