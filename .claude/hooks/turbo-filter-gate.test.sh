#!/usr/bin/env bash
set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/turbo-filter-gate.sh"
PASS=0
FAIL=0
unset TURBO_CACHE_DIR

run_case() {
  local name="$1"
  local command="$2"
  local expected_exit="$3"

  local payload
  payload="$(jq -n --arg cmd "$command" '{tool_input: {command: $cmd}}')"
  local output
  output="$(printf '%s' "$payload" | bash "$HOOK" 2>&1)"
  local actual_exit=$?

  if [ "$actual_exit" = "$expected_exit" ]; then
    PASS=$((PASS + 1))
    echo "PASS: $name (exit $actual_exit)"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $name (expected exit $expected_exit, got $actual_exit)"
    echo "  command: $command"
    echo "  output: $output"
  fi
}

# --- trailing '...' filter (pre-existing behavior) ---
run_case "trailing dots on test filter blocked" \
  "pnpm exec turbo run test --filter=@conciv/app..." 2

run_case "trailing dots on typecheck filter blocked" \
  "pnpm exec turbo run typecheck --filter=@conciv/app..." 2

run_case "leading dots dependents form allowed" \
  "pnpm exec turbo run test --filter=...@conciv/app" 0

run_case "leading and trailing dots still blocked" \
  "pnpm exec turbo run test --filter=...@conciv/app..." 2

run_case "bare filter without dots allowed" \
  "pnpm exec turbo run test --filter=@conciv/app" 0

run_case "build with trailing dots allowed" \
  "pnpm exec turbo run build --filter=@conciv/app..." 0

run_case "dry run with trailing dots allowed" \
  "pnpm exec turbo run test --filter=@conciv/app... --dry=json" 0

run_case "quoted trailing dots false positive allowed" \
  "echo 'run: turbo run test --filter=@conciv/app...'" 0

# --- rule 2: no filter at all ---
run_case "unfiltered turbo run test blocked" \
  "pnpm exec turbo run test" 2

run_case "unfiltered turbo run typecheck blocked" \
  "pnpm exec turbo run typecheck" 2

run_case "unfiltered turbo run build allowed (not test/typecheck)" \
  "pnpm exec turbo run build" 0

run_case "affected filter form allowed" \
  "pnpm exec turbo run test --filter='...[origin/main]'" 0

run_case "pnpm test root script blocked" \
  "pnpm test" 2

run_case "pnpm run test root script blocked" \
  "pnpm run test" 2

run_case "pnpm typecheck root script blocked" \
  "pnpm typecheck" 2

run_case "pnpm run typecheck root script blocked" \
  "pnpm run typecheck" 2

run_case "pnpm test:affected allowed" \
  "pnpm test:affected" 0

run_case "pnpm typecheck:affected allowed" \
  "pnpm typecheck:affected" 0

run_case "quoted unfiltered turbo test false positive allowed" \
  "echo 'do not run: turbo run test'" 0

# --- rule 3: --force ---
run_case "turbo run build with --force blocked" \
  "pnpm exec turbo run build --filter=@conciv/app --force" 2

run_case "turbo run test with --force=true blocked" \
  "pnpm exec turbo run test --filter=@conciv/app --force=true" 2

run_case "turbo run build with --force=false allowed" \
  "pnpm exec turbo run build --filter=@conciv/app --force=false" 0

run_case "turbo run build without --force allowed" \
  "pnpm exec turbo run build --filter=@conciv/app" 0

run_case "quoted --force false positive allowed" \
  "echo 'never pass turbo run build --force'" 0

run_case "compound command with one forced turbo run blocked" \
  "pnpm install && pnpm exec turbo run build --filter=@conciv/app --force" 2

# --- rule 4: bare vitest ---
run_case "bare vitest run blocked" \
  "vitest run" 2

run_case "bare vitest (no run subcommand) blocked" \
  "vitest" 2

run_case "vitest run with file argument allowed" \
  "vitest run test/foo.test.ts" 0

run_case "vitest run with project and file allowed" \
  "vitest run --project storybook test/foo.test.ts" 0

run_case "vitest run with testNamePattern allowed" \
  "vitest run -t 'does the thing'" 0

run_case "pnpm exec bare vitest run blocked" \
  "pnpm exec vitest run" 2

run_case "quoted bare vitest false positive allowed" \
  "echo 'do not run vitest run without a file'" 0

# --- rule 5: separate cache store ---
run_case "inline TURBO_CACHE_DIR on turbo blocked" \
  "TURBO_CACHE_DIR=../.turbo-cache pnpm exec turbo run test --filter=@conciv/db" 2

run_case "exported TURBO_CACHE_DIR before turbo blocked" \
  "export TURBO_CACHE_DIR=../.turbo-cache && turbo run build" 2

run_case "--cache-dir= flag blocked" \
  "turbo run build --cache-dir=/tmp/x" 2

run_case "--cache-dir flag with separate value blocked" \
  "turbo run build --cache-dir /tmp/x" 2

run_case "quoted TURBO_CACHE_DIR value on pnpm test:affected blocked" \
  "TURBO_CACHE_DIR=\"../x\" pnpm test:affected" 2

run_case "TURBO_CACHE_DIR on root pnpm build blocked" \
  "TURBO_CACHE_DIR=/tmp/c pnpm build" 2

run_case "TURBO_CACHE_DIR on root pnpm lint blocked" \
  "TURBO_CACHE_DIR=/tmp/c pnpm lint" 2

run_case "TURBO_CACHE_DIR on root pnpm e2e blocked" \
  "TURBO_CACHE_DIR=/tmp/c pnpm e2e" 2

run_case "TURBO_CACHE_DIR on root pnpm run dev blocked" \
  "TURBO_CACHE_DIR=/tmp/c pnpm run dev" 2

run_case "quoted env assignment argument blocked" \
  "env \"TURBO_CACHE_DIR=/tmp/c\" pnpm exec turbo run build" 2

run_case "quoted --cache-dir argument blocked" \
  "pnpm exec turbo run build \"--cache-dir=/tmp/c\"" 2

run_case "plain filtered turbo test allowed" \
  "turbo run test --filter=@conciv/db" 0

run_case "plain root pnpm build allowed" \
  "pnpm build" 0

run_case "quoted echo mention allowed" \
  "echo \"TURBO_CACHE_DIR=x turbo run build --cache-dir=y\"" 0

run_case "quoted commit message mention allowed" \
  "git commit -m \"drop TURBO_CACHE_DIR and --cache-dir\"" 0

run_case "quoted --cache-dir inside a message argument of turbo allowed" \
  "pnpm exec turbo run build --summarize --filter=@conciv/db --log-prefix \"no --cache-dir\"" 0

TURBO_CACHE_DIR=/tmp/other run_case "inherited TURBO_CACHE_DIR blocks turbo" \
  "turbo run test --filter=@conciv/db" 2

TURBO_CACHE_DIR=/tmp/other run_case "inherited TURBO_CACHE_DIR blocks root pnpm build" \
  "pnpm build" 2

TURBO_CACHE_DIR=/tmp/other run_case "inherited TURBO_CACHE_DIR ignores non-turbo command" \
  "ls -la" 0

TURBO_CACHE_DIR=/tmp/other run_case "unset before turbo clears inherited TURBO_CACHE_DIR" \
  "unset TURBO_CACHE_DIR && pnpm exec turbo run build" 0

TURBO_CACHE_DIR=/tmp/other run_case "env -u on the invocation clears inherited TURBO_CACHE_DIR" \
  "env -u TURBO_CACHE_DIR pnpm exec turbo run build" 0

TURBO_CACHE_DIR=/tmp/other run_case "env -u on another invocation does not clear it" \
  "env -u TURBO_CACHE_DIR true && pnpm exec turbo run build" 2

run_case "export after unset in the same command blocked" \
  "unset TURBO_CACHE_DIR && export TURBO_CACHE_DIR=/tmp/c && pnpm exec turbo run build" 2

run_case "empty command fails open" \
  "" 0

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
