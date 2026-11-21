# Test kits, step 2 (new calls) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a test the calls the engine already serves but the kit does not expose: wait for an engine event, the file watcher, a plugin's own rpc, the login code and a logged-out mount, the host settings on mount, and a restart.

**Architecture:** A new engine method lands on `createHarnessEngine`, joins the plugin testkit's `Engine`, and gets its browser command and handler (`browser-commands.ts`, `test-projects.ts`, `browser-engine.ts`). A mount option changes only `mount.ts`, which runs in the page in both modes.

**Tech Stack:** as step 0.

**Spec:** `docs/specs/kit-plan.md` (step 2). Facts: lane reports `015930-plugins-x.md` and `020124-plugins-6b.md` in the orchestrator inbox, with the reader files they name.

## Global Constraints

All of `docs/specs/2026-11-21-kit-step-0-plan.md` "Global Constraints" and the additions in `docs/specs/2026-11-21-kit-step-1-plan.md` apply. In addition:

- Steps 0 and 1 have landed. Proofs run through the committed bin file, in `packages/plugins/test-runner` unless a task says `apps/conciv` (the app's throwaway test setup from step 0 Task 2, never committed).
- A proof that calls a missing member fails at run time with a TypeError; that is each task's failing run unless it says otherwise.
- The maintainer is away. Every choice below that no ruling covers is listed under "Decisions to confirm"; nothing beyond them is decided by a lane.

## Review Focus

1. A wait that is set up after the thing it waits for already happened: `engine.event` resolves only once it is listening (Task 1).
2. An open wait when the engine stops: it must not leave an unhandled rejection (Task 1).
3. A logged-out mount that is silently logged in because the address carries the engine's token (Task 4).
4. A restart that loses the kit's own first session, or re-applies `files` and `settings` (Task 6).
5. A failure answer that crosses to browser mode as a thrown Error and loses its fields (Task 3).

Run order: 1, 2, 3, 4, 5, 6. Tasks 1, 2, 3, 4 and 6 change `harness-engine.ts` (one lane, in order). Task 5 changes only `mount.ts` and can run beside them.

---

### Task 1: wait for an engine event

**Files:** `packages/harness-testkit/src/harness-engine.ts`; `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts`; both READMEs; `.changeset/kit-engine-event.md`.

**Interfaces:**

- Produces: `engine.event(type: string): Promise<{arrived: Promise<EngineEvent>}>` with `EngineEvent = {type: string; data: unknown}` (the envelope's plain fields). The outer promise resolves once the subscription is live, so `await engine.event(...)` placed before the action cannot miss the event. `arrived` resolves with the first event of that type. When the engine stops first, `arrived` rejects with a plain message, and a wait nobody awaits raises no unhandled rejection.
- Browser mode: `concivEvent(engineId, type)` returns a wait id once live; `concivEventArrived(engineId, waitId)` returns the event. Same split as `gate`.

Facts (read): `event.subscribe({types?})` streams envelopes, engine-wide (`packages/contract/src/contract.ts:616-621`, served at `packages/core/src/api/rpc/router.ts:590-593`); `server.connected` comes first and the subscriber is registered before it is sent (`router.ts:301-318`, `event-feed.ts:93-100`); nothing earlier is replayed; heartbeats arrive on a filtered stream and are skipped; `session.created` is published before `sessions.create` answers (`packages/core/src/sessions/session-rows.ts:144-153`). opencode: subscribe, act, await, no polling (`core/test/config/skill.test.ts:111-124`).

- [ ] **Step 1: Proof** `src/kit-event.test.ts`, same body as `src/kit-event.browser.test.tsx`:

```ts
import {expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit/node'

test('a test waits for an engine event without polling', async () => {
  const engine = await createEngine()

  const wait = await engine.event('session.created')
  const session = await engine.newSession()

  expect(await wait.arrived).toMatchObject({type: 'session.created', data: {sessionID: session.id}})
})
```

The field name `sessionID` is the reader's (`packages/core/src/app.ts:411-416`); if the real event names it otherwise, report the real shape and use it.

- [ ] **Step 2: Failing run. Step 3: Change. Step 4: Passing run, node and browser mode. Step 5: Gates, commit** `feat(testkits): a test waits for an engine event`.

---

### Task 2: the file watcher

**Files:** `packages/harness-testkit/src/harness-engine.ts`, `packages/plugin-testkit/src/engine.ts`, both READMEs; `.changeset/kit-file-watcher.md`.

**Interfaces:** `fs?: {filewatcher?: boolean}` (opencode's option name, `server/src/options.ts:54-59`), default off. When `true` the kit leaves `CONCIV_DISABLE_FILEWATCHER` out of the engine's environment (it forces `'true'` today, after `env`).

Facts (read): the only reader is `packages/plugin-host/src/core/filesystem/watcher.ts:32`; with the watcher on, a changed skill list publishes `skill.updated` with data `{}` (`packages/plugin/src/schema/skill.ts:36`, `packages/plugin-host/src/core/skill.ts:153-159`); a project skill is `<root>/conciv/skills/<id>/SKILL.md` with optional frontmatter `name`, `description`; there is a 100 ms debounce. opencode never turns its watcher on in a test, so this proof has no precedent. On macOS the watcher uses fs-events; watcher tests have saturated it before, so this proof runs alone and is reported with its run time.

- [ ] **Step 1: Proof** `src/kit-watcher.test.ts` (node only):

```ts
import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit/node'

test('the engine notices a skill written into the project', async () => {
  const engine = await createEngine({fs: {filewatcher: true}})
  const wait = await engine.event('skill.updated')

  mkdirSync(join(engine.root, 'conciv/skills/kit'), {recursive: true})
  writeFileSync(join(engine.root, 'conciv/skills/kit/SKILL.md'), '---\nname: kit\ndescription: a kit skill\n---\nbody')

  expect(await wait.arrived).toMatchObject({type: 'skill.updated'})
})
```

- [ ] **Step 2: Failing run:** vitest's own timeout (the watcher is off, so the event never comes). **Step 3: Change. Step 4: Passing run, three times in a row; report each run's time. Step 5: Gates, commit** `feat(testkits): a test can turn the engine's file watcher on`.

---

### Task 3: a plugin's own rpc

**Files:** `packages/harness-testkit/src/harness-engine.ts`; `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts`; both READMEs; `.changeset/kit-plugin-rpc.md`.

**Interfaces:**

- Produces: `engine.rpc.call(rpcId: string, method: string, input?: unknown): Promise<unknown>` and `engine.rpc.failure(rpcId: string, method: string, input?: unknown): Promise<{type: string; message: string; data?: unknown}>`, over the `plugin.call` procedure (`contract.ts:573-577`). `failure` rejects when the call answers, as `tool().failure` does; an error that is not a plugin rpc failure is rethrown. The failure fields are opencode's `Rpc.Failure` and the product client's (`packages/plugin/src/client/promise/rpc.ts:107-111,159-164`); the error is parsed with zod.
- Browser mode: `concivRpcCall` and `concivRpcFailure` (two commands, because a thrown Error crosses as `{name, message, stack}` only).

Before the proof, read `NoInputSchema` and say whether `status` accepts a call with no input; write the call accordingly.

- [ ] **Step 1: Proof** `src/kit-rpc.test.ts`, same body as `.browser.test.tsx`:

```ts
import {expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit/node'

test("a test calls a plugin's own rpc", async () => {
  const engine = await createEngine({plugins: ['@conciv/plugin-test-runner']})

  expect(await engine.rpc.call('test-runner', 'status')).toEqual({
    summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0},
    failures: [],
    tests: [],
  })
  expect(await engine.rpc.failure('test-runner', 'nope')).toMatchObject({
    type: 'rpc.method_not_found',
    message: 'Unknown RPC method: test-runner.nope',
  })
})
```

Rpc id and method: `packages/plugins/test-runner/src/rpc.ts:22-25`; the failure: `packages/plugin-host/src/core/rpc.ts:116,245-247`.

- [ ] **Step 2 to 5**, commit `feat(testkits): a test calls a plugin's own rpc`.

---

### Task 4: the login code and a logged-out mount

**Files:** `packages/harness-testkit/src/harness-engine.ts`; `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts`, `mount.ts`; both READMEs; `.changeset/kit-login.md`.

**Interfaces:**

- `engine.loginCode(): Promise<string>`: the six digits from `auth.issueCode`, called with the engine's own credential (`contract.ts:423-425`, `packages/core/src/.../engine-login.ts:285-289`). As opencode's test reads its pair code with the server credential (`packages/server/test/process.test.ts:172-192`).
- `engine.revokeBrowsers(): Promise<void>`: what `conciv auth revoke --all` does, `revokeBrowsers(concivStateDir(root), 'all')` (`packages/protocol/src/engine-trust.ts:83-91`).
- `mount({login: 'none'})`: the app is bound to the engine's bare origin (`new URL(address.apiBase).origin`) with NO token source, so it is really logged out. The default mount is unchanged. (The kit's `apiBase` ends in `/t/<token>`, which the engine turns into its own bearer, `engine-login.ts:38,348-350`; passing it would log the browser in silently.)
- Browser mode: `concivLoginCode`, `concivRevokeBrowsers`.

Labels (read): the locked launcher is "Unauthorized. Authorize conciv" (`apps/conciv/src/shell/fab.tsx:133`); the dialog is "Authorize conciv" (`apps/conciv/src/app/engine-login.tsx:135`) with six textboxes "Digit 1 of 6" to "Digit 6 of 6" (`:160,163`); a full code submits itself; the open chat is the dialog "conciv chat agent"; the revoked text is "This browser is no longer authorized to use conciv." (`apps/conciv/src/shell/engine-lock-messages.ts:3`).

- [ ] **Step 1: Proofs.** `src/kit-login.test.ts` (node, test-runner):

```ts
test('the engine gives the test its login code', async () => {
  const engine = await createEngine()

  expect(await engine.loginCode()).toMatch(/^\d{6}$/)
})
```

`apps/conciv/src/login.dom.test.tsx`, same body as `apps/conciv/src/login.browser.test.tsx`:

```tsx
import {expect, test} from 'vitest'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine} from '@conciv/plugin-testkit/node'
import {mount} from '@conciv/plugin-testkit/browser'

test('a logged-out browser gets in with the code, and is put out when it is revoked', async () => {
  const user = userEvent.setup()
  const engine = await createEngine()
  await mount({engine, login: 'none'})

  await user.click(await screen.findByRole('button', {name: 'Unauthorized. Authorize conciv'}))
  await user.type(await screen.findByRole('textbox', {name: 'Digit 1 of 6'}), await engine.loginCode())
  expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeDefined()

  await engine.revokeBrowsers()
  expect(await screen.findByText('This browser is no longer authorized to use conciv.')).toBeDefined()
})
```

Needs the run, report what happens and adjust only the typing step: whether typing the six digits into "Digit 1 of 6" fills all six boxes or each digit must go into its own box; and whether the chat dialog opens by itself after the code or needs the launcher clicked again.

- [ ] **Step 2: Failing run** (`login` ignored: the launcher reads "Open conciv chat", so the first query fails). **Step 3: Change. Step 4: Passing run, happy-dom and browser mode. Step 5: Gates, commit** `feat(testkits): the login code, revoking browsers, and a logged-out mount`.

---

### Task 5: the host settings on mount

**Files:** `packages/plugin-testkit/src/mount.ts`, `src/README.md`; `.changeset/kit-mount-host.md`.

**Interfaces:** `MountOptions.host?: ConcivSettingsInit` (`packages/protocol/src/config-types.ts:28-34`, plain data: `modal`, `quickTerminal`, `defaultOpen`, `launcher`, `surface`), passed as `Platform.settings`, as the embed passes its init (`packages/embed/src/mount-impl.tsx:147,159`). No command: mount runs in the page.

- [ ] **Step 1: Proof** `apps/conciv/src/host.dom.test.tsx`, same body as `.browser.test.tsx`:

```tsx
test('a host that opens the chat by default gets it open', async () => {
  const engine = await createEngine()

  await mount({engine, host: {defaultOpen: true}})

  expect(await screen.findByRole('dialog', {name: 'conciv chat agent'})).toBeDefined()
})
```

`defaultOpen` on the closed route opens the panel on mount (`apps/conciv/src/routes/__root.tsx:380-382`).

- [ ] **Step 2: Failing run** (the dialog is not found). **Step 3 to 5**, commit `feat(plugin-testkit): mount takes the host's settings`.

---

### Task 6: restart

**Files:** `packages/harness-testkit/src/harness-engine.ts`; `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts`; both READMEs; `.changeset/kit-restart.md`.

**Interfaces:** `engine.restart(): Promise<void>`: a full stop and boot of the engine on the same project folder, state, home, token and port. It is a product lifecycle event, not a connection fault: sockets close only because the engine stops. Order: abort the kit's open turns, release a held gate, close the server, dispose the app, make a new app with the same `agentToken` (`packages/core/src/app.ts:197,448`), listen on the same port (`packages/serve/src/serve.ts:14,50`; if the port is taken, fail with a plain message). `files` and `settings` are NOT applied again. The reply queue, `requests()` and `opened()` carry on across it. `engine.session` stays usable: before stopping, the kit gives a session that has no title and no turn a title, because every boot removes empty untitled sessions (`session-rows.ts:342-367`). Browser mode: `concivRestart`.

Labels (read): while the engine is down the Send button reads "conciv lost connection to the engine"; back up it reads "Send message" (`apps/conciv/src/pane/pane-composer.tsx:58,62,79`); the composer is "Message the conciv agent".

- [ ] **Step 1: Proofs.** `src/kit-restart.test.ts` (node, test-runner):

```ts
test('the engine comes back on the same address and keeps answering', async () => {
  const engine = await createEngine({replies: [TestLLM.text('one', 'a'), TestLLM.text('two', 'b')]})
  const before = engine.address.apiBase
  await engine.session.send('first')

  await engine.restart()
  await engine.session.send('second')

  expect(engine.address.apiBase).toBe(before)
  expect(await engine.requests()).toHaveLength(2)
})
```

`apps/conciv/src/restart.dom.test.tsx`, same body as `.browser.test.tsx`:

```tsx
test('the open chat reconnects after the engine restarts', async () => {
  const user = userEvent.setup()
  const engine = await createEngine({replies: [TestLLM.text('back again', 'a')]})
  await mount({engine, route: '/panel/latest?open=true'})

  await engine.restart()
  await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'hello')
  await user.click(await screen.findByRole('button', {name: 'Send message'}))

  expect(await screen.findByText('back again')).toBeDefined()
})
```

- [ ] **Step 2: Failing run. Step 3: Change. Step 4: Passing run, node, happy-dom and browser mode; report any page error the browser run shows during the restart. Step 5: Gates, commit** `feat(testkits): a test restarts the engine on the same folder and address`.

---

## Not in this plan: needs the maintainer

1. **The outside-agent call (`engine.mcp`) and the `hubAccess` option.** The facts show the real outside agent does not use `/api/mcp` at all: `conciv mcp serve` sends its calls to the engine's `code.*` rpc with a hub origin (`packages/cli/src/hub.ts:159,268`). Which path the kit call drives is undecided: (a) `/api/mcp` with a hub origin, as the plan's table said; (b) the `code.*` rpc the real hub uses; (c) the real hub process through step 3's CLI runner, which is nearest to how opencode tests its own outside protocol. It also needs a rule nobody gave: the hub origin header always sent, and a refusal returned, not thrown.
2. **Waiting for "this session now has a page tab".** No engine event carries the session. Kit only: wait for the page plugin's `attached` signal with Task 1 (proves a page attached, not that the tab is listed for the session; fine with one page mounted). Product change: the page plugin publishes an event with the session when a tab is recorded (not as opencode, whose browser plugin has only the `control` event).
3. **Unit tests of the header guards in `packages/core`.** Core has no test setup at all today.

## Decisions to confirm (made by the orchestrator while the maintainer was away)

1. `mount({login: 'none'})` only; `'stale'` is left out, because on the closed route it shows the same lock as `'none'`.
2. An open event wait rejects when the engine stops, without an unhandled rejection.
3. `engine.rpc.failure` answers `{type, message, data?}`, as opencode; a non-plugin error is rethrown.
4. Restart: a running turn is aborted, a held gate is released, a taken port fails loudly, the kit titles an empty first session so it survives.
5. The mount option is named `host`.

## Product findings, not fixed here

- A revoked browser that reloads shows "Log in to use conciv on this page." and not the revoked text.
- With hub access `'open'`, a call for a session id that has no row is admitted (`packages/core/src/app.ts:752`).
- When the page plugin fails to attach, nothing is logged.
