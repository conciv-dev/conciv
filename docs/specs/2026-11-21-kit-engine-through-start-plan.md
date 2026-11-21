# The kit starts every engine through the product's `start` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A test engine is started exactly the way the dev server starts one, so it has the product's config defaults and is announced to the CLI and the hub, with no extra kit option.

**Architecture:** `start` (`packages/core/src/start.ts`) is the thin wrapper the dev server calls around `makeApp`. It gains four optional inputs that it passes straight to `makeApp`. `createHarnessEngine` then calls `start` instead of `makeApp`, and the kit's hand-written config and its own port serving are deleted.

**Tech Stack:** as the step 0 plan.

**Spec:** the maintainer, 2026-11-21: "why is dev different?", then "sounds good" and "ok go" to: `StartOpts` takes the four inputs, the kit always goes through `start`, a measurement comes first. `docs/specs/kit-plan.md` step 3.

## Global Constraints

All of the step 0 plan's "Global Constraints" apply (local commits by pathspec under the commit lock, never push, never `--no-verify`, no test file committed, throwaway proofs with a failing run before and a passing run at the new head, opus subagents told "You are a subagent. Don't run memo").

- Product change: only the four optional `StartOpts` fields below. Each is passed to `makeApp` unchanged; absent, `start` behaves as today. Nothing else in `start.ts` changes.
- The kit's public options and results do not change. No new kit option in this plan.
- A test engine writes only inside its own temp root and its own home.

## Facts (read by the orchestrator)

1. `start` (`start.ts:221-342`): builds the config with `resolveConfig`; writes the system prompt file; serves the port and writes `server.json` with port and token (`servePort`, `:176-188`); writes the Claude connect file; registers the engine in the home database and retires the row on stop (`registerForOutsideAgents`, `:205-219`, `:309-316`); writes a dev endpoint file only when `nativePageDir` is given, into `devEndpointDir` whose default is `~/.conciv` (`lib/dev-endpoint.ts:18-20`); returns `{port, agentToken, trustBrowser, stop, cfg}`.
2. The kit (`harness-testkit/src/harness-engine.ts:395-486`) calls `makeApp` with a hand-written `cfg`, serves the port itself with `serveHono`, and does none of the announcing.
3. The hand-written `cfg` is not the product's: it sets `hubAccess: 'project'` and `systemPrompt: ''`, where `resolveConfig` gives `'open'` and `resolveSystemPrompt(undefined)` (`core/src/config.ts:80-98`).
4. `start` passes to `makeApp` everything the kit needs except four `MakeAppOpts` fields: `harnesses`, the six timeouts (`firstChunkTimeoutMs`, `firstStartTimeoutMs`, `eventHeartbeatIntervalMs`, `stopGraceMs`, `pageReplyTimeoutMs`, `queuedActionTimeoutMs`), `staleness`, `app`.
5. From `MadeApp` the kit reads only `fetch`, `agentToken`, `dispose` and `awaitActivation`. `start` covers all four through its own serving, `agentToken`, `stop` and its awaited activation.
6. Restart on the same address: `start` takes `port: {exact}` and `accessToken`, which must be a UUID (`start.ts:108-113`).
7. A busy remembered port makes `start` retry up to 4 times, 300 ms apart (`:118-131`). A fresh root has no `server.json`; a restart asks for the exact port.
8. `registerForOutsideAgents` also starts a background check of every engine listed in that home, 300 ms limit each, not awaited.

## Review Focus

1. Time per engine start: three home database opens and three file writes are new. Measured first (Task 0).
2. A test engine that writes outside its temp root or home: `homeDir` and `devEndpointDir` are always given by the kit.
3. Defaults that change for tests because the product's config now applies (hub access, system prompt): every earlier proof is rerun and each one whose result changes is reported with the old and new value.
4. `stop()`: every step still runs when an earlier one fails, and nothing of the engine outlives the test (the background engine check, the home database row).
5. `restart()`: same token, same port, same root, the home database row replaced, not doubled.

---

### Task 0: measure first

- [ ] A throwaway node script in `packages/harness-testkit`: start and stop 30 engines one after another with `createHarnessEngine()`, print the median and the slowest start time and the median stop time. Run it three times at the current head. Keep the script for Task 2.
- [ ] Report the numbers in the inbox. No commit.

### Task 1: `start` passes the four inputs to `makeApp`

**Files:** `packages/core/src/start.ts`, the README that describes `start`, `.changeset/start-passes-engine-inputs.md` (`@conciv/core`).

**Interfaces:** `StartOpts` gains `harnesses?: readonly HarnessAdapter[]`, `firstChunkTimeoutMs?`, `firstStartTimeoutMs?`, `eventHeartbeatIntervalMs?`, `stopGraceMs?`, `pageReplyTimeoutMs?`, `queuedActionTimeoutMs?` (each `number`), `staleness?: () => EngineStaleness`, `app?: {version?: string}`. Same names and types as `MakeAppOpts`; each is added to `appOpts` and nothing else reads it.

- [ ] **Step 1: Change. Step 2: Gates** (`turbo run typecheck --filter=@conciv/core` and `--filter=...@conciv/core`, oxlint, oxfmt, fallow). **Step 3: commit** `feat(core): start passes several harnesses, the timeouts, staleness and the version to the engine`. Its behaviour is proven by Task 2, which runs every option through it.

### Task 2: the kit starts through `start`

**Files:** `packages/harness-testkit/src/harness-engine.ts`, `src/README.md`, `package.json` only if an import path changes; `.changeset/kit-engine-through-start.md` (both kits).

**Interfaces:**

- `bootApp` calls `start` from `@conciv/core/start` with: `options` (a `ConcivConfig` holding only what the test gave: `stateRoot` the temp root, `harness` the first harness id, `sessionId`, `systemPrompt`, `plugins`, `policies`, `permission`, `permissions`), `root` the project folder, `harness`, `harnesses`, `plugins`, the timeouts, `staleness`, `app`, `homeDir: engineHome(root)`, `devEndpointDir` a folder inside that home, `configProvider` the isolated one, `launchEditor` recording into `opened`, `print: () => {}`, and for a restart `port: {exact}` and `accessToken`.
- Deleted from the kit: the hand-written `cfg`, the direct `resolveConfig` call, `serveHono` and `listenAgain`.
- Defaults are the product's. Where the kit set a value the test did not give (`hubAccess: 'project'`, `systemPrompt: ''`), it now gives nothing. Report every earlier proof whose result changes because of that; do not put the old values back.
- Read `core/src/editor/open.ts` (`makeEditorOpener(..., 4000, ...)`): if it drops a repeated open of the same file within 4 s, say whether any earlier `opened()` proof sees it, and report; do not work around it.
- Read `lib/shutdown.ts` `runInOrder`: if it stops at the first failing step where the kit's `stop` ran them all, report it before building on it.

- [ ] **Step 1: Proofs** (throwaway, test-runner, node):

```ts
import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {cli, createEngine} from '@conciv/plugin-testkit/node'

test('the CLI finds the test engine from its project folder', async () => {
  const engine = await createEngine({plugins: ['@conciv/plugin-test-runner']})

  const run = await cli(['plugin', 'call', 'test-runner', 'status'], {cwd: engine.root})

  expect(run.exitCode).toBe(0)
})
```

Read `packages/cli/src/engine-origin.ts` first: if the CLI finds an engine from the folder's `server.json` this is the proof as written; if it needs the home database or a variable too, give exactly that in `env` and say what you gave. A second proof with the real CLI command that lists engines, if one exists (name it from `packages/cli/src`), showing the test engine listed while it runs and gone after `engine.restart()` is not used: after the test ends is not observable, so assert only "listed while running".

The proof build needs the CLI: `TURBO_CONCURRENCY=70% pnpm exec turbo run build --filter=@conciv/harness-testkit... --filter=@conciv/plugin-testkit... --filter=@conciv/plugin-test-runner... --filter=@conciv/cli...`, then `build:types` for both kits.

- [ ] **Step 2: Failing run** at the Task 1 head (the CLI finds no engine). **Step 3: Change. Step 4: Passing run; rerun EVERY earlier proof** (steps 0 to 4a, node, happy-dom and browser mode, and the app proofs) and list each one that changed. **Step 5: the Task 0 script again, three times;** report before and after. If the median start is more than 10 ms slower per engine, stop and report where the time goes (do not optimise on your own). **Step 6: check nothing is left behind:** after a run, no engine row remains un-retired in a test home that still exists, and nothing was written outside the temp root and home (list the developer's `~/.conciv` before and after). **Step 7: Gates plus `publint` and `attw` for both kits, commit** `refactor(testkits): the test engine starts through the product's start`.

---

## Not in this plan

1. Two engines on one home: each test engine has its own home today. Sharing one needs a kit option for the home; its name and shape wait for the maintainer.
2. The clock: `start` hides `MadeApp`, so the clock work will need `start` to take the clock too. Planned with the clock.
