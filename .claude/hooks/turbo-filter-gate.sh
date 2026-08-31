#!/usr/bin/env bash
set -euo pipefail

# Blocks Claude Code turbo/vitest gate commands that waste the cache or skip
# scoping, so agent gates stay fast and the cache stays trustworthy.
#
# Rule 1 (trailing '...'): In turbo, `--filter=pkg...` selects the package AND
# ALL OF ITS DEPENDENCIES (upstream), not its dependents. Agent gate commands
# were written that way on the belief it meant "dependents", so every gate
# re-ran the suites of ~28 untouched upstream packages: measured 28 real test
# suites for `--filter=@conciv/app...` versus 1 for `--filter=@conciv/app`.
# Dropping the suffix loses nothing: build/test/typecheck all declare
# `dependsOn: ["^build"]`, so dependencies are still BUILT, just not
# re-tested. The LEADING form `--filter=...pkg` is the dependents selector and
# is allowed. `--filter=...pkg...` combines both forms and still expands
# dependencies, so it is rejected too: only a filter with no trailing `...` is
# allowed. `build` with a trailing `...` is allowed (30 vs 28 tasks, not worth
# blocking).
#
# Rule 2 (no filter at all): an unfiltered `turbo run test`/`turbo run
# typecheck` runs every package's suite instead of the one(s) touched. Allowed
# scoping forms: `--filter=<pkg>`, the affected form
# `--filter='...[origin/main]'` (or any other ref), and the leading-dots
# dependents form. `--dry` runs are exempt (nothing executes). The root
# scripts `pnpm test`/`pnpm typecheck`/`pnpm run test`/`pnpm run typecheck`
# expand to unfiltered `turbo run test`/`turbo run typecheck` and are blocked
# the same way; `pnpm test:affected`/`pnpm typecheck:affected` expand to the
# already-filtered affected form and are allowed.
#
# Rule 3 (--force): the turbo cache hash already covers source and deps, so
# `--force` (equivalent to `--cache=local:w,remote:w`) never fixes a real
# problem, it just burns the cache and the build time it buys. `--force=false`
# is a no-op and allowed.
#
# Rule 4 (bare vitest): running `vitest`/`vitest run` with no file/glob
# argument and no `-t`/`--testNamePattern` runs the whole package's suite from
# an ad hoc shell command, bypassing the turbo gates above entirely (and their
# cache). `vitest run <file>` and `vitest run --project <name> <file>` stay
# allowed.
#
# A compound command (`&&`, `;`, `||`, `|`) is split and each relevant
# invocation is checked independently, with its own task list/args.
# Anything unparseable fails OPEN: a gate that blocks on ambiguity is worse
# than no gate.
#
# Quoted text (a string literal, a heredoc line, a logged message) is never a
# real invocation; detection runs against the command with quoted spans
# stripped out, so a command that only CONTAINS the words "turbo run ..." or
# "vitest run" inside quotes does not trip the gate. Argument EXTRACTION (the
# actual selector value, the actual file argument) runs against the
# unstripped text so a quoted file path is not lost. A quoted COMMAND
# SUBSTITUTION still executes, though, so before the quote strip the boundary
# pair `"$(` / `)"` is unwrapped: the quote characters that sit directly
# against a substitution are dropped so the substitution body survives as
# plain text and is still detected.

if ! command -v jq >/dev/null 2>&1; then
  echo "turbo-filter-gate: jq not on PATH, skipping check." >&2
  exit 0
fi

strip_quoted() {
  sed -E 's/"\$\(/ \$\(/g; s/\)"/\) /g' | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g"
}

map_pnpm_script() {
  sed -E \
    -e "s#(^|[[:space:];|&()])pnpm[[:space:]]+(run[[:space:]]+)?test:affected#\\1turbo run test --filter='...[origin/main]'#" \
    -e "s#(^|[[:space:];|&()])pnpm[[:space:]]+(run[[:space:]]+)?typecheck:affected#\\1turbo run typecheck --filter='...[origin/main]'#" \
    -e "s#(^|[[:space:];|&()])pnpm[[:space:]]+(run[[:space:]]+)?test([[:space:]]|\$)#\\1turbo run test\\3#" \
    -e "s#(^|[[:space:];|&()])pnpm[[:space:]]+(run[[:space:]]+)?typecheck([[:space:]]|\$)#\\1turbo run typecheck\\3#"
}

is_bare_vitest_args() {
  local args_str="$1"
  local -a tokens
  read -ra tokens <<<"$args_str"
  local has_pattern_flag=0
  local has_file=0
  local skip_next=0
  local idx
  for ((idx = 0; idx < ${#tokens[@]}; idx++)); do
    local tok="${tokens[$idx]}"
    if [ "$skip_next" = "1" ]; then
      skip_next=0
      continue
    fi
    case "$tok" in
      run) continue ;;
      -t | --testNamePattern) has_pattern_flag=1
        skip_next=1
        continue ;;
      -t=* | --testNamePattern=*) has_pattern_flag=1
        continue ;;
      --project) skip_next=1
        continue ;;
      --project=*) continue ;;
      -*) continue ;;
      *) has_file=1 ;;
    esac
  done
  [ "$has_pattern_flag" = "0" ] && [ "$has_file" = "0" ]
}

INPUT="$(cat)"
CMD="$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null || true)"

[ -n "$CMD" ] || exit 0

STRIPPED_CMD="$(printf '%s\n' "$CMD" | strip_quoted)"
EARLY_RE='(^|[[:space:];|&()])(turbo[[:space:]]+run([[:space:]]|$)|pnpm[[:space:]]+(run[[:space:]]+)?(test|typecheck)(:affected)?([[:space:]]|$)|(pnpm[[:space:]]+(exec|dlx)[[:space:]]+|npx[[:space:]]+)?vitest([[:space:]]|$))'
printf '%s\n' "$STRIPPED_CMD" | grep -Eq "$EARLY_RE" || exit 0

TRAILING_DOTS_OFFENDERS=""
NO_FILTER_OFFENDERS=""
FORCE_OFFENDERS=""
BARE_VITEST_OFFENDERS=""

INVOCATIONS="$(printf '%s\n' "$CMD" | sed -E 's/&&|\|\||[;|&]/\n/g')"

while IFS= read -r RAW_INVOCATION; do
  INVOCATION="$(printf '%s\n' "$RAW_INVOCATION" | map_pnpm_script)"
  STRIPPED_INVOCATION="$(printf '%s\n' "$INVOCATION" | strip_quoted)"

  VITEST_RE='(^|[[:space:];|&()])(pnpm[[:space:]]+(exec|dlx)[[:space:]]+|npx[[:space:]]+)?vitest([[:space:]]|$)'
  if printf '%s\n' "$STRIPPED_INVOCATION" | grep -Eq "$VITEST_RE"; then
    VITEST_ARGS="$(printf '%s\n' "$INVOCATION" | sed -E 's/.*vitest//')"
    if is_bare_vitest_args "$VITEST_ARGS"; then
      BARE_VITEST_OFFENDERS="${BARE_VITEST_OFFENDERS}${INVOCATION}"$'\n'
    fi
  fi

  printf '%s\n' "$STRIPPED_INVOCATION" | grep -Eq '(^|[[:space:];|&()])turbo[[:space:]]+run([[:space:]]|$)' || continue

  FORCE_FLAG="$(printf '%s\n' "$STRIPPED_INVOCATION" | grep -oE -- '--force(=[^[:space:]]*)?' | head -1 || true)"
  if [ -n "$FORCE_FLAG" ] && [ "$FORCE_FLAG" != "--force=false" ]; then
    FORCE_OFFENDERS="${FORCE_OFFENDERS}${INVOCATION}"$'\n'
  fi

  if printf '%s\n' "$INVOCATION" | grep -Eq '(^|[[:space:]])--dry(-run)?([=[:space:]]|$)'; then
    continue
  fi

  TASKS="$(printf '%s\n' "$STRIPPED_INVOCATION" | sed -E 's/.*turbo[[:space:]]+run[[:space:]]+//; s/[[:space:]]+-.*//')"
  printf '%s\n' "$TASKS" | grep -Eqw 'test|typecheck' || continue

  SELECTORS="$(printf '%s\n' "$INVOCATION" | grep -oE -- '--filter[=[:space:]]+[^[:space:]]+' | sed -E "s/--filter[=[:space:]]+//; s/^['\"]//; s/[)'\"]+\$//" || true)"
  if [ -z "$SELECTORS" ]; then
    NO_FILTER_OFFENDERS="${NO_FILTER_OFFENDERS}${INVOCATION}"$'\n'
    continue
  fi

  while IFS= read -r selector; do
    [ -n "$selector" ] || continue
    case "$selector" in
      *...) TRAILING_DOTS_OFFENDERS="${TRAILING_DOTS_OFFENDERS}${selector}"$'\n' ;;
    esac
  done <<<"$SELECTORS"
done <<<"$INVOCATIONS"

if [ -z "$TRAILING_DOTS_OFFENDERS" ] && [ -z "$NO_FILTER_OFFENDERS" ] && [ -z "$FORCE_OFFENDERS" ] && [ -z "$BARE_VITEST_OFFENDERS" ]; then
  exit 0
fi

if [ -n "$TRAILING_DOTS_OFFENDERS" ]; then
  FIXED="$CMD"
  while IFS= read -r selector; do
    [ -n "$selector" ] || continue
    FIXED="${FIXED/$selector/${selector%...}}"
  done <<<"$TRAILING_DOTS_OFFENDERS"

  {
    echo "turbo-filter-gate: BLOCKED: trailing '...' on a test/typecheck filter."
    echo
    printf 'Rejected selector(s): %s' "$TRAILING_DOTS_OFFENDERS"
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
fi

if [ -n "$NO_FILTER_OFFENDERS" ]; then
  {
    echo "turbo-filter-gate: BLOCKED: unfiltered turbo test/typecheck is banned: use"
    echo "--filter=<pkg> for the package you touched, or --filter='...[origin/main]' for"
    echo "the affected set."
    echo
    printf 'Rejected invocation(s):\n%s' "$NO_FILTER_OFFENDERS"
  } >&2
fi

if [ -n "$FORCE_OFFENDERS" ]; then
  {
    echo "turbo-filter-gate: BLOCKED: turbo --force is banned: the cache hash already"
    echo "covers source and deps. If you suspect a stale dist, delete that package's"
    echo "dist (rm -rf packages/<pkg>/dist) and rerun without --force."
    echo
    printf 'Rejected invocation(s):\n%s' "$FORCE_OFFENDERS"
  } >&2
fi

if [ -n "$BARE_VITEST_OFFENDERS" ]; then
  {
    echo "turbo-filter-gate: BLOCKED: bare vitest run is banned: pass the test file(s)"
    echo "you touched."
    echo
    printf 'Rejected invocation(s):\n%s' "$BARE_VITEST_OFFENDERS"
  } >&2
fi

exit 2
