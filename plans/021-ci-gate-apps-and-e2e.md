# Plan 021: CI typechecks/tests the product apps, and the e2e stage is either real or removed

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- .github/workflows/ci.yml turbo.json package.json apps/conciv/package.json apps/site/package.json`
> If any of these changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S (config) — but MED risk it surfaces pre-existing app failures that must be fixed
- **Risk**: MED
- **Depends on**: none (but do this before/with plan 027, which touches `apps/conciv` — a green CI gate protects that work)
- **Category**: dx / tests
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

Two verification gaps let broken code merge green:

1. **CI never typechecks, lints, or tests the two `apps/*`.** The build job filters to `./packages/*` and `./packages/extensions/*` only. `apps/conciv` — the actual shipped Solid widget UI, the product — has real `typecheck`/`lint`/`test` scripts that CI never runs. The only apps-wide CI step is a comment-format lint. A type error or failing test in the product UI merges clean.
2. **`turbo run test:e2e` is a silent no-op.** The root `test` script and `turbo.json` both declare a `test:e2e` task, but no package or app implements a `test:e2e` script, so `turbo run test:e2e` matches zero tasks and exits green — advertising an end-to-end stage that runs nothing.

This plan closes gap 1 by adding `apps/conciv` (and `apps/site` typecheck/lint) to CI, and resolves gap 2 by removing the dangling `test:e2e` task (the honest fix — there is no e2e suite to wire; the real integration coverage is the `*.it.test.ts` files that already run under `test`). Turning on the app gate may surface latent failures; that is the point, and STOP conditions cover it.

## Current state

- `.github/workflows/ci.yml:51` — the only build/test gate (the whole `- run:` line):

```yaml
- run: pnpm exec turbo run typecheck lint test --filter='./packages/*' --filter='./packages/extensions/*' --concurrency=3
# Enforce the no-comments rule everywhere (incl. apps/), without pulling the private apps into the build/test gate.
- run: pnpm exec oxlint -A all -D conciv/no-comments
```

`apps/conciv` and `apps/site` are in neither `--filter`. (The comment on the next line explicitly notes apps are kept out of "the build/test gate".)

- `apps/conciv/package.json` scripts (name is `conciv`):

```json
"typecheck": "tsc -p tsconfig.json --noEmit",
"lint": "oxlint",
"test": "vitest run",
```

- `apps/site/package.json` scripts (name is `site`): has `typecheck` (`fumadocs-mdx && tsc --noEmit`) and `lint` (`oxlint`), but **no `test` script**.

- Root `package.json:18`: `"test": "turbo run test --concurrency=3 && turbo run test:e2e"`.
- `turbo.json:39-44` declares the `test:e2e` task:

```json
"test:e2e": {
  "dependsOn": ["^build", "build"],
  "cache": false,
  "env": ["CI", "CONCIV_E2E"]
}
```

- Confirmed: `grep -rl '"test:e2e"' packages apps --include=package.json` returns nothing — no implementer.

### Repo conventions to follow

- CI uses turbo `--filter` globs (`'./packages/*'`) and `--concurrency=3` (a documented cap to avoid vite-optimizer contention closing browser pages — keep it).
- `apps/*` are `private` and intentionally not built/published; the goal is to _verify_ them, not add them to the release/build gate.

## Commands you will need

| Purpose                              | Command                                         | Expected on success |
| ------------------------------------ | ----------------------------------------------- | ------------------- |
| Typecheck conciv                     | `pnpm exec turbo run typecheck --filter=conciv` | exit 0              |
| Test conciv                          | `pnpm exec turbo run test --filter=conciv`      | all pass            |
| Lint conciv                          | `pnpm exec turbo run lint --filter=conciv`      | exit 0              |
| Typecheck site                       | `pnpm exec turbo run typecheck --filter=site`   | exit 0              |
| Full local mirror of the new CI line | (see Step 3)                                    | exit 0              |

Note: turbo `--filter` matches the package `name`, so `apps/conciv` is `--filter=conciv` and `apps/site` is `--filter=site`.

## Scope

**In scope**:

- `.github/workflows/ci.yml` (the run line at :51)
- `turbo.json` (remove the `test:e2e` task)
- `package.json` (root `test` script tail)
- Whatever pre-existing type/lint/test failures Step 1 surfaces in `apps/conciv` — fix them if small and clearly in the app; otherwise STOP (see conditions).

**Out of scope**:

- Adding a `test` script to `apps/site` (it has no tests and none are planned; only add `site` to typecheck/lint, not test).
- Building a real e2e suite — that is a separate, larger decision (a direction item), not this plan. This plan _removes_ the false signal.
- The `oxlint -A all -D conciv/no-comments` line — leave it; it complements the new gate.
- Any `apps/examples/*` — demo-grade, stay out of CI by design.

## Git workflow

- Branch: `advisor/021-ci-gate-apps-and-e2e`
- Commit style: `ci: typecheck/test apps/conciv and drop the dangling test:e2e task`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Find out what the app gate would catch (before changing CI)

Run the app's own gates locally:

```
pnpm exec turbo run typecheck lint test --filter=conciv
pnpm exec turbo run typecheck lint --filter=site
```

- If all pass: proceed to Step 2 — the CI change is safe and immediate.
- If they fail: the failures are the pre-existing unprotected breakage this plan exists to expose. If they are small and unambiguously in-app (a type error, a stale test), fix them in `apps/conciv`/`apps/site` source. If they are large, cross-cutting, or in a dependency, **STOP and report the failure list** — landing a red CI gate is worse than the status quo; the maintainer decides whether to fix-then-gate or gate-with-known-failures-tracked.

**Verify**: both commands exit 0 (after any small in-app fixes), OR you have reported the failure list.

### Step 2: Add the apps to the CI filters

In `.github/workflows/ci.yml`, change the gate. Two clean options — pick the one that matches what passed in Step 1:

- If `site` fully passes typecheck+lint+test: add `--filter=conciv --filter=site` to the existing line.
- If `site` has no tests (it doesn't) and you want to avoid a "no test task" edge: keep `test` scoped as-is but add a dedicated typecheck/lint pass for apps. Recommended concrete form:

```yaml
- run: pnpm exec turbo run typecheck lint test --filter='./packages/*' --filter='./packages/extensions/*' --filter='conciv' --concurrency=3
- run: pnpm exec turbo run typecheck lint --filter='site' --concurrency=3
```

This runs `conciv`'s full typecheck+lint+test in the main gate and `site`'s typecheck+lint (it has no `test`) in a second step. Update the explanatory comment above the line so it no longer claims apps are excluded from the gate.

**Verify**: `grep -n "filter='conciv'\|filter=conciv" .github/workflows/ci.yml` shows conciv in the gate.

### Step 3: Remove the dangling `test:e2e` task

- In root `package.json:18`, change `"test": "turbo run test --concurrency=3 && turbo run test:e2e"` to `"test": "turbo run test --concurrency=3"`.
- In `turbo.json`, delete the `"test:e2e": { ... }` task block (lines 39-44) and its trailing comma placement so the JSON stays valid.

**Verify**:

- `grep -rn "test:e2e" turbo.json package.json` → returns nothing.
- `node -e "JSON.parse(require('fs').readFileSync('turbo.json','utf8'))"` → exit 0 (valid JSON).
- `pnpm test` → runs `turbo run test` and exits 0 (no phantom e2e stage).

### Step 4: Validate the CI line locally

Run the exact command the workflow will run:

```
pnpm exec turbo run typecheck lint test --filter='./packages/*' --filter='./packages/extensions/*' --filter='conciv' --concurrency=3
pnpm exec turbo run typecheck lint --filter='site' --concurrency=3
```

**Verify**: both exit 0.

## Test plan

- No new unit tests — this is a CI/config change. The "test" is that the app's existing suites now run in the gate.
- Verification is the local mirror in Step 4 exiting 0, plus (once pushed, if the operator does so) the CI run being green.

## Done criteria

ALL must hold:

- [ ] `apps/conciv` typecheck+lint+test run in `.github/workflows/ci.yml` (verified by grep for the filter)
- [ ] `apps/site` typecheck+lint run in CI
- [ ] `grep -rn "test:e2e" turbo.json package.json` returns nothing
- [ ] `turbo.json` is valid JSON
- [ ] `pnpm exec turbo run typecheck lint test --filter=conciv` exits 0 locally
- [ ] No files outside the in-scope list are modified (`git status`), except any small in-app fixes from Step 1 (which are expected and in `apps/conciv`/`apps/site`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Step 1 surfaces failures that are large, cross-cutting, or not obviously fixable in-app — report the list; do not force a green gate by weakening the app's scripts or by not adding it to CI.
- Adding `apps/site` to typecheck breaks because of the `fumadocs-mdx` codegen prerequisite (its typecheck runs `fumadocs-mdx && tsc`) not being available in the turbo task graph — report; the `site` addition can be deferred while `conciv` (the more important app) still lands.
- The `ci.yml` or manifests don't match the "Current state" excerpts (drift).

## Maintenance notes

- Once `apps/conciv` is gated, plan 027 (routing its mutations through the query layer) and any future app work is protected — sequence app-touching plans after this one.
- If a real end-to-end suite is later built (a direction item — driving the widget against a real spawned core in a browser, likely via `@conciv/extension-testkit`), re-introduce a `test:e2e` task _with an implementer_ and add it as its own CI step (it's `cache:false` and slower, so keep it separate from the main gate).
- A reviewer should confirm the new gate actually runs the app suites (check the CI log shows `conciv:test`), not just that the filter string is present.
