# Test kits, step 4a (product changes: engine version, the start limit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two small product changes the kit needs, each mirroring something that already exists: the engine's reported version becomes an input (as opencode's `app.version`), and the "agent did not start" limit becomes an option (as its sibling, the first-output limit, already is). The clock is described but not built: it waits for the maintainer.

**Architecture:** Each is one optional field on `makeApp`'s options with today's behaviour as the default, threaded exactly the way an existing sibling field is, and then one option or call on the kits.

**Tech Stack:** as step 0, plus `effect/testing` (`TestClock`, already shipped inside the `effect` version the repo uses; no new dependency).

**Spec:** `docs/specs/kit-plan.md` (step 4). Facts: lane report `020243-plugins-q.md` in the orchestrator inbox and the reader files it names. This plan is step 4a. It does NOT move the engine's raw time reads onto the clock; see the end.

## Global Constraints

All of the step 0 plan's "Global Constraints" and the additions of the later step plans apply. In addition:

- This plan changes PRODUCT code (`packages/core`, `packages/chat`, `packages/ai`). Every change is an optional input whose default is today's value: with the option absent, behaviour is unchanged, and the task's last step shows that by rerunning every earlier proof.
- Mirror the sibling. Before touching a file, read how the named sibling option travels from `makeApp` to where it is used, and thread the new one the same way, file by file. No new pattern.
- Product changes need a changeset naming the product package, and the README line where the sibling is described.
- Gates add: `turbo run typecheck --filter=@conciv/core --filter=@conciv/chat --filter=@conciv/ai` and `--filter=...@conciv/core` for dependents' typecheck only if the task changed an exported type.

## Review Focus

1. A default engine after each change: same version header, same 30 s start limit. The rerun of the earlier proofs is a regression smoke only; each task adds one assert on the default (Task 1: a default engine's header equals the core package version; Task 2 cannot assert 30 s without waiting it out, so the default is checked by reading the diff: the constant stays the fallback).
2. The version reaches BOTH places the header is written (the normal routes and the 401 path), Task 1.
3. A test clock that also freezes work the engine must finish in real time (the HTTP round trip, the socket): the clock is given only to the plugin host's Effect runtime, Task 3.
4. `advance` called on an engine that was not made with a test clock: it rejects with a plain message, Task 3.
5. Browser mode: `advance` crosses as one command carrying a number, Task 3.

Run order: 1, 2. One lane. Task 3 is NOT executable: see its own first line.

---

### Task 1: the engine's version is an input

**Files:** `packages/core/src/app.ts`, `packages/core/src/lib/cors.ts`, the engine gate that writes the 401 (`packages/core/src/.../engine-login.ts:297-304`, built at `app.ts:858`); `packages/harness-testkit/src/harness-engine.ts`, `packages/plugin-testkit/src/engine.ts`; READMEs; `.changeset/engine-version-input.md` (`@conciv/core`, both kits).

**Interfaces:**

- Product: `MakeAppOpts.app?: {version?: string}`, default the core package's own version (today hard-coded at `cors.ts:55-57`), handed to `corsMiddleware` at both call sites: the normal routes (`app.ts:359`) and the refusal app that answers 401 (`packages/core/src/.../engine-login.ts:297`, reached through `makeEngineGate`, built at `app.ts:858`). It changes the reported header only; the plugin host's own App service keeps the package version (`plugin-runtime.ts:114`). As opencode `app: {name?, version?, channel?}` (`packages/server/src/options.ts:8-14`, test `packages/server/test/process.test.ts:16,55`).
- Kits: `app?: {version?: string}` on `HarnessEngineOptions` and `CreateEngineOptions`, passed through. Plain JSON.

- [ ] **Step 1: Proof** `src/kit-version.test.ts` (node, test-runner):

```ts
import {expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit/node'

test('the engine reports the version the test gave it', async () => {
  const engine = await createEngine({app: {version: '0.0.1'}})

  const health = await fetch(`${engine.address.apiBase}/health`)

  expect(health.headers.get('x-conciv-version')).toBe('0.0.1')
})
```

Read the header's exact name in `cors.ts` first and use it; if it is not readable by `fetch` in node, report it. Two more asserts in the same file:

```ts
test('a refused request carries the same version', async () => {
  const engine = await createEngine({app: {version: '0.0.1'}})

  const refused = await fetch(`${new URL(engine.address.apiBase).origin}/api/mcp`)

  expect(refused.status).toBe(401)
  expect(refused.headers.get('x-conciv-version')).toBe('0.0.1')
})

test('an engine given no version reports its own', async () => {
  const engine = await createEngine()

  const health = await fetch(`${engine.address.apiBase}/health`)

  expect(health.headers.get('x-conciv-version')).toMatch(/^\d+\.\d+\.\d+$/)
})
```

Pick the protected path from `engine-login.ts:28` (any path not in its open list); if `/api/mcp` is open or answers another status, use one that answers 401 and report it.

A second proof in the app proof worktree, `apps/conciv/src/version.dom.test.tsx`: mount on `/panel/latest?open=true` with `app: {version: '0.0.1'}` and `expect(await screen.findByRole('alert')).toHaveTextContent('but the conciv engine is older')` (`apps/conciv/src/shell/engine-notice.tsx:21,64`). If `toHaveTextContent` is not available in the kit's setup, use `findByText` with a function matcher on that sentence and say so.

- [ ] **Step 2: Failing run** (the header is the real core version). **Step 3: Change, mirroring how `staleness` is threaded. Step 4: Passing run; rerun every earlier proof. Step 5: Gates, commit** `feat(core): the engine's reported version is an input`.

---

### Task 2: the "agent did not start" limit is an option

**Files:** `packages/chat/src/index.ts` (`FIRST_START_TIMEOUT_MS`, `:30`, used `:121`), the chat deps type, `packages/core/src/app.ts` (`MakeAppOpts`, beside `firstChunkTimeoutMs` at `:219`, threaded to chat as `firstChunkTimeoutMs` is at `:687`); both kits (`timeouts` gains the field); READMEs (`packages/chat/src/README.md:22` describes both limits); `.changeset/first-start-timeout-option.md` (`@conciv/chat`, `@conciv/core`, both kits).

**Interfaces:**

- Product: `MakeAppOpts.firstStartTimeoutMs?: number`, default 30 000, threaded exactly as `firstChunkTimeoutMs`. The error text stays `the agent did not start within ${seconds}s` (`packages/ai/src/server/chat-server.ts:727`).
- Kits: `timeouts.firstStartTimeoutMs`.

Facts (read): the kit's gate holds a reply BEFORE the run reports it started (`scripted-harness.ts`, `take` runs before `RUN_STARTED`), so a held gate is exactly "the agent has not started".

- [ ] **Step 1: Proof** `src/kit-start-limit.test.ts` (node, test-runner):

```ts
import {expect, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'

test('an agent that never starts fails the turn after the limit the test set', async () => {
  const engine = await createEngine({replies: [TestLLM.text('late', 'a')], timeouts: {firstStartTimeoutMs: 500}})
  await engine.gate()

  await expect(engine.session.send('hello')).rejects.toThrow('the agent did not start within 1s')
})
```

500 ms reads "1s" if this text rounds as the first-output text does (`chat-server.ts:717,728`); read `:727` and its rounding, and use what the code produces.

- [ ] **Step 2: Failing run.** The product limit and vitest's test timeout are both 30 s, so the failing run would be a race between them. Give this one proof a shorter vitest timeout for the failing run only (`test(name, {timeout: 5000}, ...)`): it then fails on vitest's 5 s timeout, which shows the option is ignored. **Step 3: Change. Step 4: Passing run with the same 5 s timeout (the turn fails after about half a second; the text reads "1s" by rounding); rerun every earlier proof. Step 5: Gates, commit** `feat(chat): the limit for an agent that never starts is an option`.

---

### Task 3: the engine's Effect runtime takes a clock: NOT EXECUTABLE, waits for the maintainer

Not built. Two reasons, both found in review:

1. **No valid proof exists.** The seam needs one engine behaviour that sleeps through Effect's `Clock` inside the plugin host runtime and that a test can observe without polling. The closest is the skill reload's 100 ms debounce (`packages/plugin-host/src/core/skill.ts:137,153`), but the file system's own callback can arrive after a single `advance(100)`, before the debounce sleep exists; opencode meets the same race and drives its test clock with repeated advances between real settles (`packages/core/test/lib/clock.ts:4-32`), which is a larger interface than the one call the overall plan names. The other candidates (the supervisor's 24 h sleep, server polling, the search's 20 ms sleep) show nothing a test can observe.
2. **It would not complete the clock item anyway.** `kit-plan.md` says every engine read of the time goes through the clock; this seam reaches only the reads already on Effect's clock (about 50 of about 136).

What the seam would be, for the ruling: `MakeAppOpts.clock`, a layer merged at the bottom of the plugin host layer beside the config provider layer (`packages/core/src/runtime/plugin-runtime.ts:339`); kit `clock: 'test'` and a call that drives `TestClock` on `MadeApp.pluginHost`, in browser mode one command carrying a number.

---

## Not in this plan: needs the maintainer

1. **The clock, both its reach and its driving call.** The driving call first: one `advance(ms)`, or opencode's shape, a call that advances in steps between real settles until a condition holds. Then how far it goes. The inventory found three groups of engine time reads: about 50 already on Effect's clock inside the plugin host runtime (Task 3 covers these), 3 on Effect but outside that runtime, and 83 raw ones (`Date.now`, `setTimeout`, `AbortSignal.timeout`) in about 30 files of core, chat, ai, db, the page plugin and the plugin host. The overall plan says "every engine read of the time goes through it". opencode itself does not go that far: its core source still has 75 raw `Date.now()` reads and its server tests run on the live clock. Moving the 83 is a large product change with no opencode precedent; it is left for a ruling. Until then, time-based journeys that depend on raw reads (the session list's "Yesterday" header reads a stored `Date.now()` stamp) are not reachable by the clock.
2. **The other hard-coded timers.** The page plugin's permission sync is on the host runtime, so the clock would reach it. The whiteboard binding wait, the page's attach retries and mask limits, the recorder's waits and the ios pick limit are in the BROWSER, where no engine clock or engine option reaches; each needs a plugin option or stays untested. Listed for a ruling per plugin.

## Decisions to confirm (made by the orchestrator while the maintainer was away)

1. The names `app.version` and `timeouts.firstStartTimeoutMs`.
