# Plan 028: Decompose the `makeApp` composition root into focused wiring functions

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/core/src/app.ts`
> If it changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

`makeApp` in `packages/core/src/app.ts` is the server composition root — a ~150-line async factory that resolves the harness, opens the db, builds the change/page buses, computes the risky-tool set, wires `ServerSessions` and `ServerHarness`, mounts every extension with collision detection, builds the tool list and chat deps, and composes all routes. It is the repo's top-churn file (38 commits in 6 months). Because it has no internal seams, every new server capability edits this one function, making it the serialization point for otherwise-independent work and the file most likely to produce merge conflicts. This plan extracts cohesive sub-steps into named, independently-readable functions with explicit inputs/outputs, so adding an extension surface or a harness hook touches a focused function instead of the monolith. It is a **pure refactor**: no behavior change, guarded by the existing core integration tests.

## Current state

- `packages/core/src/app.ts:118-271` — `makeApp`. The extractable clusters (all currently inline in the factory body):
  1. **Risky-tool set** (`:122-127`) — building the `Set` of `mcp__conciv__<tool>` names from extensions with `approval === 'ask'`.
  2. **ServerSessions** (`:133-142`) — the `serverSessions` object literal (resumeToken/recordToken/chatBusy/model/onChatTurn).
  3. **ServerHarness** (`:143-156`) — the `serverHarness` object literal (id/ttyCommand/transcriptExists/transcriptMessages).
  4. **Extension mounting** (`:157-196`) — the `seenTools`/`seenNames` collision sets, the `Promise.all` over `extensions` calling `extension.__server?.(...)`, `extensionContexts`, `extensionTools` collision check, `disposers`, `turnEnds`, and the `onRunEnd` hook.
  5. **Tool context + tool list** (`:197-209`) — `makeToolCtx`, `sessionModel`, `toolList`.
  6. **Route mounting for extensions** (`:261-268`) — the `mounted.forEach` that mounts each extension's hono app under `/api/ext/...` and router under `/rpc/ext/...`.

  Already-extracted helpers (leave as-is, they're the pattern to follow): `slug` (`:56`), `requireHarness` (`:63`), `narrowExtensionApp` (`:69`), `buildExtensionTools` (`:75`), `composeRoutes` (`:92`).

- The factory returns `{app, disposers, extensionContexts}` (`MadeApp`, `:112-116`). This return contract must stay identical.

Load-bearing ordering that must be preserved:

- Extensions are mounted (`__server` called) **before** `chatDeps` is built (extension tools feed `buildChatTools`).
- Name-collision throws happen during mount (`seenNames`) and after tool collection (`seenTools`) — keep both, with the same error messages.
- Extension route mounting (`app.route(/api/ext/...)`, `app.use(/rpc/ext/...)`) happens **after** `composeRoutes` builds the base `app`.
- `onRunEnd` closes over `turnEnds`; `chatDeps.onRunEnd` references it.

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`/non-null. oxfmt style (no semicolons, single quotes, printWidth 120).
- No barrel files — if you add a new module, import from its source path.
- The extracted functions should take explicit parameters (db, harness, opts, cwd, etc.) and return their product — no hidden shared mutable state beyond what's passed. Mirror the existing top-level helpers' style.

## Commands you will need

| Purpose   | Command                                                     | Expected on success                                   |
| --------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Typecheck | `pnpm exec turbo run typecheck --filter=@conciv/core`       | exit 0                                                |
| Test      | `pnpm exec turbo run test --filter=@conciv/core`            | all pass                                              |
| Lint      | `pnpm exec turbo run lint --filter=@conciv/core`            | exit 0                                                |
| Fallow    | `pnpm exec fallow audit --changed-since main --format json` | no INTRODUCED findings (esp. no new complexity/cycle) |

## Scope

**In scope**:

- `packages/core/src/app.ts` (extract functions; the factory becomes a thin orchestrator)
- Optionally a new module `packages/core/src/mount-extensions.ts` for the extension-mounting cluster (cluster 4 above), if keeping it in `app.ts` would leave the file large. Prefer a new module for cluster 4 specifically (it's the densest and most-churned part).

**Out of scope**:

- Any behavior change. Same routes, same mount order, same error messages, same return shape. This is refactor-only.
- `composeRoutes`, `buildExtensionTools`, `requireHarness`, `narrowExtensionApp`, `slug` — already good; leave them.
- The harness registry hardcoding (a separate finding — DEBT-07, not selected here).
- `run.ts`, `attach.ts`, `gate.ts` — untouched.

## Git workflow

- Branch: `advisor/028-decompose-makeapp`
- Commit style: `refactor(core): extract wiring functions from the makeApp composition root`
- Commit per extracted cluster so each step is independently revertible; do NOT push or open a PR unless instructed.

## Steps

### Step 1: Establish the behavior baseline

Run the core test suite and record it green **before** touching anything:

```
pnpm exec turbo run test --filter=@conciv/core
```

This suite (the `*.it.test.ts` integration tests) is your regression guard. Every step must keep it green.

**Verify**: all core tests pass. If they don't pass at baseline, STOP — do not refactor on a red suite.

### Step 2: Extract the pure/leaf clusters first (lowest risk)

Extract, one at a time, each with its own commit and a test run after:

- `buildRiskySet(extensions): Set<string>` (cluster 1).
- `makeServerSessions(deps): ServerSessions` (cluster 2) — takes `{db, harness, cwd, runStartListeners}`.
- `makeServerHarness(harness, cwd, claudeHome): ServerHarness` (cluster 3).

Replace the inline code in `makeApp` with calls to these. Keep the exact same object contents.

**Verify** after each: `pnpm exec turbo run test --filter=@conciv/core` → all pass.

### Step 3: Extract extension mounting (the dense cluster)

Move cluster 4 into `mountExtensions(...)` (in `app.ts` or a new `mount-extensions.ts`). It takes the extensions, the server contexts (`serverSessions`, `serverHarness`), `opts`, and returns `{mounted, extensionContexts, extensionTools, disposers, turnEnds, onRunEnd}` — the same values the factory uses downstream. Preserve:

- both collision checks (`seenNames` during mount, `seenTools` after) with identical error strings,
- the `Promise.all` mount,
- `onRunEnd` closing over `turnEnds`.

Then have `makeApp` call it and destructure the results.

**Verify**: `pnpm exec turbo run test --filter=@conciv/core` → all pass (collision tests especially — confirm a duplicate extension name still throws the same message).

### Step 4: Extract the extension route-mounting step

Move cluster 6 (`:261-268`) into `mountExtensionRoutes(app, mounted)` that mounts each extension's hono app and router. Call it after `composeRoutes`.

**Verify**: `pnpm exec turbo run test --filter=@conciv/core` → all pass.

### Step 5: Confirm the orchestrator is thin and nothing regressed

`makeApp` should now read as a sequence of named calls: open db → make buses → build risky set → make server sessions/harness → mount extensions → build tool ctx/list → build chatDeps → make compactor/send → compose routes → mount extension routes → return. Confirm the return shape `{app, disposers, extensionContexts}` is unchanged.

**Verify**:

- `pnpm exec turbo run typecheck lint test --filter=@conciv/core` → exit 0, all pass
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings (the extraction should _lower_ complexity, not raise it; a new cycle between `app.ts` and `mount-extensions.ts` would be a finding — keep the dependency one-way: `app.ts` imports `mount-extensions.ts`, never the reverse)

## Test plan

- No new tests required (pure refactor). The existing `packages/core/test/**/*.it.test.ts` suite is the guard — it must stay green at every step.
- Optionally add a focused unit test for `buildRiskySet` and the collision-throw in `mountExtensions` (they're now independently callable) — nice-to-have, not required.
- Verification: `pnpm exec turbo run test --filter=@conciv/core` → all pass, unchanged from the Step 1 baseline.

## Done criteria

ALL must hold:

- [ ] `makeApp` is a thin orchestrator calling named wiring functions (extension mounting, server-sessions/harness, risky-set, route-mounting all extracted)
- [ ] The return shape `{app, disposers, extensionContexts}` is unchanged
- [ ] Extension name/tool collision still throws the identical error messages
- [ ] `pnpm exec turbo run typecheck lint test --filter=@conciv/core` exits 0, all pass (same as baseline)
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings (no new cycle, no raised complexity)
- [ ] No behavior change (routes, mount order, errors identical)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `app.ts` doesn't match the "Current state" structure (drift — the factory may have already been refactored).
- The core test suite is red at baseline (Step 1) — do not refactor on red.
- Extracting a cluster changes mount order or an error message and a test catches it — that means the ordering was load-bearing in a way not captured above; report rather than "fixing" the test.
- Fallow reports a new circular dependency after extracting `mount-extensions.ts` — the import direction is wrong; report and keep it one-way.

## Maintenance notes

- After this lands, adding an extension surface should touch `mountExtensions` (and possibly `mountExtensionRoutes`), not the whole factory — that's the win; a reviewer should expect future extension work to land there.
- This does NOT address the harness-registry hardcoding (DEBT-07: built-in harnesses are eagerly imported and registered via a hardcoded array in `packages/harness/src/registry.ts`) — a separate, independent finding. Note it exists but keep it out of this plan.
- A reviewer of this PR should diff the _behavior_ (routes, tests) not just the shape: the risk in a composition-root refactor is a subtly reordered wiring step, so confirm the test suite is byte-identical green.
