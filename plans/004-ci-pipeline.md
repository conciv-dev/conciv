# Plan 004: Add a CI pipeline (typecheck / lint / test / build / format gate)

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions" occurs, stop and
> report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2446924..HEAD -- package.json .github`
> If `package.json` scripts changed or a `.github/workflows` already exists, compare against the
> "Current state" before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `2446924`, 2026-06-16

## Why this matters

There is no CI (`.github/workflows/` does not exist). Every quality gate — typecheck, lint, tests,
build, formatting — runs only on developer machines, and changes land on `main` directly. A single CI
workflow that runs the existing scripts on every push/PR catches regressions before they reach `main`
at near-zero ongoing cost (the scripts already exist and pass locally).

## Current state

- No `.github/` directory exists.
- Root `package.json` already defines every command CI needs:

```json
// package.json (scripts)
  "scripts": {
    "dev": "turbo run dev --filter=tanstack-start-example",
    "dev:site": "turbo run dev --filter=site",
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "format": "oxfmt --write .",
    "format:check": "oxfmt --check ."
  },
  "engines": { "node": ">=22" },
  "packageManager": "pnpm@10.33.2"
```

- Toolchain facts: pnpm `10.33.2` (from `packageManager`), Node `>=22`, turbo orchestrates per-package
  `tsc --noEmit` / `oxlint` / `vitest run` / build. `turbo run test` `dependsOn` `build`, so tests build
  first. The widget package's tests run a real browser via Playwright (Chromium) against its built
  bundle — CI must have a browser available (the `playwright` dependency ships Chromium; install it).
- `pnpm-lock.yaml` exists at the root (so `--frozen-lockfile` is valid).

## Commands you will need

| Purpose                | Command                                                                                                       | Expected on success |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------- |
| Install (CI mode)      | `pnpm install --frozen-lockfile`                                                                              | exit 0              |
| Typecheck              | `pnpm typecheck`                                                                                              | exit 0              |
| Lint                   | `pnpm lint`                                                                                                   | exit 0              |
| Test + build           | `pnpm test` (build runs as a dep) and `pnpm build`                                                            | exit 0              |
| Format check           | `pnpm format:check`                                                                                           | exit 0              |
| Validate workflow YAML | `node -e "require('node:fs').readFileSync('.github/workflows/ci.yml','utf8')"` then a YAML parse (see Step 2) | exit 0              |

## Scope

**In scope**:

- `.github/workflows/ci.yml` (create)

**Out of scope** (do NOT touch):

- `package.json` scripts — they are correct; reuse them, don't rewrite.
- `turbo.json` — caching config is handled in plan 001; don't change it here.
- Do NOT add deployment/release steps — Netlify already handles the docs deploy (`netlify.toml`).
- Do NOT add remote turbo cache tokens or secrets.

## Git workflow

- Branch: `advisor/004-ci-pipeline`
- One commit. Conventional commits (e.g. `ci: add typecheck/lint/test/build/format workflow`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the workflow

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4

      - name: Use Node 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright Chromium (widget browser tests)
        run: pnpm --filter @opendui/aidx-widget exec playwright install --with-deps chromium

      - name: Format check
        run: pnpm format:check

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Build
        run: pnpm build

      - name: Test
        run: pnpm test
```

Notes for the executor:

- `pnpm/action-setup@v4` reads the pnpm version from `package.json` `packageManager` automatically — do
  not hardcode a different version.
- The Playwright step targets the widget package; if `playwright` is not a dependency there, find which
  package depends on `playwright` (`grep -rl '"playwright"' packages/*/package.json`) and run the
  install in that one. If no package depends on Playwright, STOP and report (the widget tests location
  moved).
- Keep `pnpm test` last (it builds + runs the heaviest suites).

### Step 2: Validate the YAML locally

The repo has no YAML linter; validate by parsing. If a YAML parser isn't available, this minimal check
catches structural errors:

**Verify**: `node --input-type=module -e "import('node:fs').then(fs=>{const s=fs.readFileSync('.github/workflows/ci.yml','utf8'); if(!/^jobs:/m.test(s)||!/runs-on: ubuntu-latest/.test(s)) throw new Error('workflow malformed'); console.log('ok')})"` → prints `ok`

### Step 3: Confirm the gated commands pass locally (the CI will run these)

Run each, confirming exit 0. This proves CI will be green on the current tree:

**Verify**: `pnpm install --frozen-lockfile` → exit 0
**Verify**: `pnpm format:check` → exit 0
**Verify**: `pnpm lint` → exit 0
**Verify**: `pnpm typecheck` → exit 0
**Verify**: `pnpm test` → exit 0 (this also builds)

If any of these fail on the **unmodified** tree (i.e. the failure is not caused by your workflow file),
that's a pre-existing problem — STOP and report it rather than "fixing" unrelated code in this plan.

## Test plan

No unit tests (CI config). Verification is Step 3 — the exact commands CI will run, confirmed green
locally.

## Done criteria

ALL must hold:

- [ ] `.github/workflows/ci.yml` exists and Step 2's validation prints `ok`
- [ ] All Step 3 commands exit 0 on the current tree
- [ ] Only `.github/workflows/ci.yml` is added (`git status --porcelain` shows just that file)
- [ ] `plans/README.md` row for 004 updated

## STOP conditions

Stop and report (do not improvise) if:

- A `.github/workflows/` directory already exists (the repo gained CI since this plan was written).
- Any Step 3 command fails on the unmodified tree (pre-existing breakage — report it; don't fix
  unrelated code here).
- No package depends on `playwright` (the widget test setup moved — report what you find).

## Maintenance notes

- If the test matrix grows (multiple Node versions, OSes), convert `verify` to a matrix job.
- Consider adding turbo remote caching later (needs a secret) to speed CI — explicitly deferred.
- Reviewer: confirm the Playwright browser install matches where the widget tests actually live, and
  that `pnpm test` is the final step.
