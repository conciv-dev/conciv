# The kit's last pieces: the clock, the outside agent, `cli()` and servers mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four kit pieces that are still missing, so the test plan can start.

**Architecture:** Each piece is one task with one lane. Every lane works in its OWN worktree and branch and lands its commits on `test/plugin-testkit-mounts` itself, in the order it finishes, because three of the four touch the same kit files.

**Tech Stack:** as the step 0 plan, plus `effect/testing` `TestClock` (inside the `effect` version the repo already uses).

**Spec:** `docs/specs/kit-plan.md`, and the maintainer's rulings of 2026-11-21 quoted in each task. Facts: the lane reports in the orchestrator inbox named in each task; every file and line in this plan was opened by the lane that reported it.

## Global Constraints

All of the step 0 plan's "Global Constraints" apply (never push, never open a PR, never `--no-verify`, no test file committed, throwaway proofs with a failing run before and a passing run at the new head, opus subagents told "You are a subagent. Don't run memo", one inbox report per task).

- **Where the work is done.** `git worktree add -b kit/<task> ../aidx-wt-kit-<task> test/plugin-testkit-mounts`, `pnpm install`, build. Commit there freely. Never edit `/Users/omrikatz/Public/web/aidx-wt-kit-mounts` directly except to land.
- **Landing.** When a task is done and proven: take the commit lock (`mkdir /Users/omrikatz/Public/web/aidx/.git/kit-commit.lock`), `git -C /Users/omrikatz/Public/web/aidx-wt-kit-mounts cherry-pick <commits>`, release the lock. On a conflict: abort the cherry-pick, release the lock, bring your branch onto the new head yourself (a merge of `test/plugin-testkit-mounts` into your branch, then squash your work into fresh commits on top), rerun your proofs, and land again. Report the landed commit ids.
- **Before starting**, the head must contain "the test engine starts through the product's start" (lane plugins-q) and, for Task 4, the test-only loop change (lane plugins-p). If it does not yet, read and prepare, and start when it does.
- Every kit call added here must work in node, happy-dom and browser mode: its arguments and results are plain JSON, and it gets its browser command (`browser-commands.ts`, handler in `test-projects.ts`, caller in `browser-engine.ts`).
- A value, label or message used in a proof is read from the product file first. Where a report says "unknown, needs the run", run it once, read the real value, then write the assert.

## Review Focus

1. A clock call on an engine made without `clock: 'test'`: it rejects with a plain message.
2. An engine on the test clock whose test never advances it: boot must not hang (the mkdir retry at `plugin-runtime.ts:140`), and the 1 s TestClock warning must not flood the output.
3. An outside call that the engine refuses: it resolves with the hub's own error reply, it does not throw.
4. `cli()` given neither an engine, a port nor a folder: it must never connect to port 5173.
5. Servers mode with all ten connect ports busy: a plain message, and no engine left behind.

---

### Task 1: the engine's clock (lane plugins-x)

**Rulings:** "the engine takes a clock, as opencode" (approved product change); the reach is opencode's (Effect's `Clock`, not every raw `Date.now`); the call shape: "let's try A", `advance` takes the thing the test is waiting for.

**Facts:** inbox `092000-plugins-x.md` and the two reader files it names.

**Files:** `packages/core/src/start.ts`, `app.ts`, `runtime/plugin-runtime.ts`, `api/rpc/router.ts` (heartbeat), `packages/plugins/page` (`symbolicate.ts`, `connection.ts`); `packages/harness-testkit/src/harness-engine.ts`, a new `src/clock.ts`; `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts`; READMEs; `.changeset/engine-clock.md` (`@conciv/core`, `@conciv/plugin-page`, both kits).

**Interfaces:**

- Product: `StartOpts.clock?: Layer.Layer<never>` and `MakeAppOpts.clock?: Layer.Layer<never>`, passed into the plugin runtime input and provided around the whole host layer: `pluginHostLayer(input).pipe(Layer.provideMerge(input.clock ?? Layer.empty))` at `plugin-runtime.ts:339`. Absent: today's behaviour. It is a Layer, not a bare `Clock`, because `TestClock.layer` also swaps the Scheduler.
- Product: the three Effect time reads that run outside that runtime get the host's context, so the same clock reaches them: the event heartbeat (`router.ts:312-317`), the page source-map fetch timeout (`symbolicate.ts:29,79,87`), queued page plays (`connection.ts:290,412`). No behaviour change with the real clock.
- Kit option: `clock?: 'test'` on `HarnessEngineOptions` and `CreateEngineOptions`. With it the kit builds `TestClock.layer()` itself (`Layer.buildWithScope`), hands `Layer.succeedContext(context)` to `start`, and keeps the context to drive it. The clock starts at 0, as opencode's.
- Kit calls: `engine.clock.advance<T>(until: Promise<T>): Promise<T>` and `engine.clock.drain(): Promise<void>`.
  - `advance` repeats opencode's step (one real 1 ms macrotask, then `TestClock.adjust('500 millis')`) until `until` settles, and returns or rethrows its outcome. It gives up after 15 s of real time with `the engine clock was advanced for 15s and the awaited call never settled`.
  - `drain` is opencode's: four steps and one settle (`_ref/opencode/packages/core/test/lib/clock.ts:38-43`).
  - On an engine made without `clock: 'test'`, both reject with `this engine runs on the real clock: make it with clock: 'test'`.
- Browser mode: the page holds the promise; each step is one command `concivClockTick(engineId)`, which settles and adjusts once; `concivClockDrain(engineId)`.

- [ ] **Step 1: Proof** (node; throwaway; the recorder package gets the kit as a devDependency and `concivTest()` in the proof worktree only):

```ts
import {expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit/node'

test('the recorder gives up waiting for a page when the engine clock passes its limit', {timeout: 4000}, async () => {
  const engine = await createEngine({clock: 'test', plugins: ['@conciv/plugin-recorder']})

  const failed = await engine.clock.advance(engine.session.tool('recording_start').failure({}))

  expect(failed.message).toContain('no page client attached within 5s')
})
```

The product waits 5 s (`packages/plugins/recorder/src/tools.ts:12,41,44-46`) and the test's limit is 4 s, so it passes only if the engine's clock moved. The per-test timeout is the proof's device and exists only in this throwaway file. Whether code mode carries the message through unchanged is unknown: run once and assert what comes back. Two more: `advance` on a real-clock engine rejects with the message above; an engine made with `clock: 'test'` and never advanced still starts and answers a `session.send` (Review Focus 2).

- [ ] **Step 2: Failing runs:** before the change (`clock` unknown), and with the kit half only and no product hand-in (the test times out at 4 s). **Step 3: Change. Step 4: Passing run in node and, with the same body, in browser mode; rerun every earlier proof** (the real clock must be untouched). **Step 5: the 1 s TestClock warning** (`TestClock.ts:210-212,451-454`): show what a test that uses `clock: 'test'` prints, and say whether it needs quieting; do not quiet it without reporting. **Step 6: Gates** (typecheck `...@conciv/core` and the page plugin), **land.**

---

### Task 2: the outside agent (lane plugins3)

**Ruling:** the kit call goes the way the real hub goes, over the engine's `code.*` rpc, with the agent's identity as plain data ("A"). A connected agent cannot be set up in the kit and is on the follow-up list; only the never-connected refusal and the unnamed `terminal` client are covered.

**Facts:** inbox `091200-plugins3.md`, item 1.

**Files:** `packages/harness-testkit/src/harness-engine.ts` (or a new `src/outside.ts`), `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts`; READMEs; `.changeset/kit-outside-agent.md`.

**Interfaces** (the name `outside` is to be confirmed by the maintainer; the earlier plans said `mcp`):

```ts
type OutsideAgent = {client?: string; tab?: string}
type OutsideReply = {content: Array<{type: string; text?: string; [key: string]: unknown}>; isError?: true}

engine.outside(agent?: OutsideAgent): {
  describe: () => Promise<{execute: string; discover: string | null}>
  discover: (toolNames: string[]) => Promise<OutsideReply>
  call: (name: string, input?: unknown) => Promise<OutsideReply>
}
```

- The client is `makeRpcClient(apiBase, {headers: {'conciv-origin': 'hub', 'conciv-client': client ?? 'terminal'}})`; `tab` is the rpc input's `sessionId`. `describe`, `discover` and `call` are `rpc.code.describe`, `code.discover` and `code.execute`, with the replies built by `codeDiscoverReply` and `codeExecuteReply` from `@conciv/contract`, exactly as `packages/cli/src/hub.ts:259-271,353-364` does. An rpc error the engine answered becomes `{content: [{type: 'text', text: error.message}], isError: true}`, as `hub.ts:191`.
- Kit option `hubAccess?: 'open' | 'project'` on both kits, passed in the config given to `start`. Default: the product's (`'open'`).

- [ ] **Step 1: Proofs** (node, `packages/plugins/test-runner`):

```ts
test('an outside agent that was never connected is refused', async () => {
  const engine = await createEngine({plugins: ['@conciv/plugin-test-runner']})

  const reply = await engine.outside({client: 'claude'}).call('test_runner_list')

  expect(reply).toEqual({
    content: [
      {
        type: 'text',
        text: 'Claude is disconnected from conciv; reconnect it from the conciv widget or run `conciv mcp connect claude`',
      },
    ],
    isError: true,
  })
})
```

A second: the unnamed client lists and calls a tool by name (`engine.outside()` then `discover(['external_test_runner_list'])` and `call('test_runner_list')`). Its real replies are unknown: run once, read them, then assert their values. If `list` fails on a project with no vitest installed, use the tool that answers without one (`status`, as the step 0 proof did) and say so. A third, with `hubAccess: 'project'` and a `tab`: the call waits for the outside-agent card, `engine.session.approve()` lets it through. Whether `approve()` sees that ask is unknown: run it; if it does not, report and leave the third proof out.

- [ ] **Step 2: Failing run. Step 3: Change. Step 4: Passing run in node and browser mode; rerun every earlier proof. Step 5: Gates, land.**

---

### Task 3: `cli()` never reaches a real dev server (lane plugins3, after Task 2)

**Facts:** inbox `091200-plugins3.md`, item 2. The CLI resolves its engine in this order (`packages/cli/src/engine-origin.ts:43-60`): `CONCIV_PORT`, then a `.conciv/server.json` in the folder or a parent, then the home database, then port 5173.

**Files:** `packages/harness-testkit/src/cli.ts`, `src/README.md`; `.changeset/kit-cli-no-default-port.md`.

**Interfaces:**

- `CliOptions` gains `engine?: {address: {apiBase: string; token: string}}`. With it `cli()` sets `CONCIV_PORT` and `CONCIV_TOKEN` from that address. This is how a test reaches an engine that runs on a fixture folder, whose `server.json` is not in that folder.
- With no `engine`, no `CONCIV_PORT` in `env` and no `cwd`, `cli()` sets `CONCIV_PORT` to a port the kit just opened and closed on `127.0.0.1`, so the child gets a refused connection and prints the CLI's own "No conciv dev server on 127.0.0.1:<port>." message.
- With a `cwd` and nothing else, `cli()` sets no port: the test is about the CLI finding the engine from its folder.
- The names `engine` on `cli` and the behaviour above are to be confirmed by the maintainer.

- [ ] **Step 1: Proofs** (node, `packages/harness-testkit`): the no-engine call exits 1, prints `No conciv dev server on 127.0.0.1:` and never `127.0.0.1:5173` (run it also with a throwaway listener on 5173 that counts connections: zero); `cli(args, {engine})` reaches an engine made with `directory`; `cli(args, {cwd: engine.root})` still finds a no-fixture engine with no port. **Step 2: Failing run. Step 3: Change. Step 4: Passing run. Step 5: Gates, land.**

---

### Task 4: plugins by name in `mount`, and servers mode (lane plugins-a)

**Rulings:** a plugin is given by name or `[name, options]`, the config's own form ("that's not how we define plugins"); servers mode as the embed does it, the engine on a connect port (R6).

**Facts:** the spike in `/Users/omrikatz/Public/web/aidx-wt-tryit-spike` and inbox `090859-plugins-a.md`; inbox `020119-plugins-a.md` (servers mode, connect ports).

**Files:** `packages/plugin-testkit/src/mount.ts`, `test-projects.ts`, `engine.ts`; `packages/harness-testkit/src/harness-engine.ts`; `apps/conciv/src/data/app-data.ts` (the product defect below); READMEs; changesets.

**Interfaces:**

- `MountOptions.plugins?: ConcivConfig['plugins']` (a name, or a name with JSON options) and `engine` becomes optional. The kit turns each name into the plugin through a vite virtual module its projects provide, as the spike does, using the same lookup `createEngine` uses. A plugin keeps its OWN id (the id its definition declares), not its package name: read how the engine path names it and do the same.
- With no engine and at least one plugin: `engine: {kind: 'servers'}` and memory navigation on `/panel/connect?open=true`, as `packages/embed/src/mount-impl.tsx:135-160`. With no engine and no plugin: a plain error.
- Kit option `port?: 'connect'` and `token?: string` on both kits: the engine is started on the first free port of 4732 to 4741 (`@conciv/protocol/connect-ports`) through `start`'s `port: {exact}`, trying the next on `EADDRINUSE`, failing with `no free port between 4732 and 4741` as `packages/try/src/connect.ts:62-83`; the token is a UUID, generated when not given, and is `engine.address.token`.
- Browser-mode pre-bundling of a plugin's browser dependencies: the spike's `@solid-primitives/*` filter is not a rule. Read how the product pre-bundles a consumer's plugin dependencies (`packages/unplugin/src/core/vite.ts`, `concivSolidConfig`, the embed pre-bundle list) and use the same source of truth. If no rule exists there, report it; do not invent one.
- Product defect to fix in this task: in servers mode the app opens its event stream before any engine is bound and logs "conciv core not connected yet" on every mount (`apps/conciv/src/data/app-data.ts:226`, `forgetDeletedSessions`). The stream starts when an engine is bound.

- [ ] **Step 1: Proofs** (throwaway; `packages/plugins/try-it` gets the kit, `concivTest()` and a test script in the proof worktree only; happy-dom and browser mode, same body):

```ts
test('the visitor sees the connect steps, then the chat once their agent is found', async () => {
  const engine = await createEngine({port: 'connect'})

  await mount({plugins: [['@conciv/plugin-try-it', {token: engine.address.token}]]})

  expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeDefined()
})
```

and one with no engine running: the heading "Drive this page with your agent." by role, and the token in the connect command on screen. Read every label from the product first (`packages/plugins/try-it/src/connect-pane.tsx`, `apps/conciv/src/pane/chat-pane.tsx:638`).

- [ ] **Step 2: Failing run. Step 3: Change. Step 4: Passing run, both projects, cold and warm vite cache** (no "Vite unexpectedly reloaded a test", no "multiple instances of Solid"). **Step 5: Answer these with runs and report each plainly:** is the servers-mode connection trusted after it binds (the servers app has no login step, `apps/conciv/src/index.tsx:248-275`; if the composer stays locked or the bind is refused, that is a product defect: report the exact text, do not work around it); what happens with all ten connect ports taken (Review Focus 5); can two test files that both use `port: 'connect'` run at once. **Step 6: Gates, land.**

---

## Not in this plan

- **The page attach event:** nothing to build. A test opens `engine.event('rpc.experimental.page.control')` before `mount`, mounts on a session route (`/panel/<session id>?open=true`; the page never attaches at `/`), and awaits `arrived` (inbox `091857-plugins-r.md`, item 2).
- **The fixed timers:** no option is added. A clean test reaches only the recorder's start wait, which Task 1's clock covers; the others need a failed engine answer, a browser control or a native host, all outside the kit. Their reactions get plain unit tests of the machines in the test plan, as opencode tests its own (same report, item 1).
- **Two engines on one home:** needs a kit option for the home; its name and shape wait for the maintainer.
- **A connected outside agent:** the follow-up list ("a harness brings its own hub connect definition").

## To confirm with the maintainer (names and defaults chosen here)

1. `engine.outside(...)` rather than `engine.mcp(...)`.
2. `cli(args, {engine})`, and the closed-port default.
3. `clock: 'test'`, `engine.clock.advance(until)`, `engine.clock.drain()`, the 15 s limit and the clock starting at 0.
4. `port: 'connect'` and `token` on `createEngine`; `hubAccess`.
