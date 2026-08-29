#!/usr/bin/env bash
set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/turbo-filter-gate.sh"
PASS=0
FAIL=0

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

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
