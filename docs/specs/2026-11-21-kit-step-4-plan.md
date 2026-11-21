# Test kits, step 4a (product changes: engine version, the start limit, the clock seam) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three small product changes the kit needs, each mirroring something that already exists: the engine's reported version becomes an input (as opencode's `app.version`), the "agent did not start" limit becomes an option (as its sibling, the first-output limit, already is), and the engine's Effect runtime takes a clock (as opencode's test runtime runs under `TestClock`).

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

1. A default engine after each change: same version header, same 30 s start limit, same live clock. Covered by rerunning the earlier proofs in every task.
2. The version reaches BOTH places the header is written (the normal routes and the 401 path), Task 1.
3. A test clock that also freezes work the engine must finish in real time (the HTTP round trip, the socket): the clock is given only to the plugin host's Effect runtime, Task 3.
4. `advance` called on an engine that was not made with a test clock: it rejects with a plain message, Task 3.
5. Browser mode: `advance` crosses as one command carrying a number, Task 3.

Run order: 1, 2, 3. One lane.

---

### Task 1: the engine's version is an input

**Files:** `packages/core/src/app.ts`, `packages/core/src/lib/cors.ts`, the engine gate that writes the 401 (`packages/core/src/.../engine-login.ts:297-304`, built at `app.ts:858`); `packages/harness-testkit/src/harness-engine.ts`, `packages/plugin-testkit/src/engine.ts`; READMEs; `.changeset/engine-version-input.md` (`@conciv/core`, both kits).

**Interfaces:**

- Product: `MakeAppOpts.app?: {version?: string}`, default the core package's own version (today hard-coded at `cors.ts:55-57`), handed to `corsMiddleware` at both call sites (`app.ts:359` via `composeRoutes` called at `:822`, and the gate at `:858`). As opencode `app: {name?, version?, channel?}` (`packages/server/src/options.ts:8-14`, test `packages/server/test/process.test.ts:16,55`).
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

Read the header's exact name in `cors.ts` first and use it; if it is not readable by `fetch` in node, report it.

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

- [ ] **Step 2: Failing run:** vitest's own timeout (the product waits 30 s). **Step 3: Change. Step 4: Passing run (about a second); rerun every earlier proof. Step 5: Gates, commit** `feat(chat): the limit for an agent that never starts is an option`.

---

### Task 3: the engine's Effect runtime takes a clock

**Files:** `packages/core/src/app.ts`, `packages/core/src/runtime/plugin-runtime.ts` (where `pluginHostLayer` is assembled and the host runtime made, `:339`); `packages/harness-testkit/src/harness-engine.ts`; `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts`; READMEs; `.changeset/engine-clock.md`.

**Interfaces:**

- Product: `MakeAppOpts.clock?: Layer.Layer<never>`, merged at the bottom of `pluginHostLayer`, beside where the config provider layer is merged. Absent: the live clock, as today. This is the whole product change: it moves the engine time reads that already go through Effect's `Clock` inside the plugin host runtime (about 50 sites by the inventory). As opencode, whose core test layers build under `TestClock.layer()` (`packages/core/test/lib/effect.ts:72,79-80`) and whose tests move it (`packages/core/test/lib/clock.ts:9-32`).
- Kits: `clock?: 'test'` on `createEngine` (opt in), and `engine.clock.advance(ms: number): Promise<void>`, which runs `TestClock.adjust` on the host runtime the engine made (`MadeApp.pluginHost`, `app.ts:393`). On an engine made without `clock: 'test'` it rejects: `the engine was not made with clock: 'test'`. Browser mode: `concivClockAdvance(engineId, ms)`.

Before the proof, read the inventory in `020243-plugins-q.md` and pick ONE time-based behaviour that (a) reads the time or sleeps through Effect's `Clock` inside the plugin host runtime, and (b) a test can observe with today's kit calls and no polling (an event through `engine.event`, a tool answer, a `requests()` entry). Cite its file:line. If no site meets both, STOP and report the candidates: the seam is not committed without a proof.

- [ ] **Step 1: Proof** `src/kit-clock.test.ts` (node), same body as `.browser.test.tsx`, in this shape, with the behaviour picked above:

```ts
test('a test moves the engine clock instead of waiting', async () => {
  const engine = await createEngine({clock: 'test'})
  const wait = await engine.event(EVENT_THAT_FIRES_AFTER_A_DELAY)

  START_THE_BEHAVIOUR
  await engine.clock.advance(DELAY_MS)

  expect(await wait.arrived).toMatchObject({type: EVENT_THAT_FIRES_AFTER_A_DELAY})
})
```

Plus one line in the same file: `await expect((await createEngine()).clock.advance(1)).rejects.toThrow("the engine was not made with clock: 'test'")`.

- [ ] **Step 2: Failing run. Step 3: Change. Step 4: Passing run, node and browser mode, in well under the real delay; rerun every earlier proof (a default engine still runs on the live clock). Step 5: Gates, commit** `feat(core): the engine's plugin host runtime takes a clock`.

---

## Not in this plan: needs the maintainer

1. **How far the clock goes.** The inventory found three groups of engine time reads: about 50 already on Effect's clock inside the plugin host runtime (Task 3 covers these), 3 on Effect but outside that runtime, and 83 raw ones (`Date.now`, `setTimeout`, `AbortSignal.timeout`) in about 30 files of core, chat, ai, db, the page plugin and the plugin host. The overall plan says "every engine read of the time goes through it". opencode itself does not go that far: its core source still has 75 raw `Date.now()` reads and its server tests run on the live clock. Moving the 83 is a large product change with no opencode precedent; it is left for a ruling. Until then, time-based journeys that depend on raw reads (the session list's "Yesterday" header reads a stored `Date.now()` stamp) are not reachable by the clock.
2. **The other hard-coded timers.** The page plugin's permission sync is on the host runtime, so Task 3 reaches it. The whiteboard binding wait, the page's attach retries and mask limits, the recorder's waits and the ios pick limit are in the BROWSER, where no engine clock or engine option reaches; each needs a plugin option or stays untested. Listed for a ruling per plugin.

## Decisions to confirm (made by the orchestrator while the maintainer was away)

1. The names `app.version`, `timeouts.firstStartTimeoutMs`, `clock: 'test'`, `engine.clock.advance(ms)`.
2. The test clock is opt in per engine; a default engine keeps the live clock.
