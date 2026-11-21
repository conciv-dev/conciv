# Test kits, step 1 (options the engine already takes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a test give the kit engine what the product engine already accepts: its address, its settings (policies, system prompt, configured session), the whole model request, models, commands and several harnesses as data, timeouts, the stale-code report, the project folder and a fixture project, and what the editor was asked to open.

**Architecture:** Every option is added to `createHarnessEngine` (`@conciv/harness-testkit`) and forwarded by `createEngine` (`@conciv/plugin-testkit`). An option is plain JSON so it crosses to browser mode inside the existing `concivCreateEngine` command; a new engine method needs one new browser command and its handler in `test-projects.ts`.

**Tech Stack:** as step 0.

**Spec:** `docs/specs/kit-plan.md` (step 1). Facts: lane reports `013110-plugins-x.md` and `013300-plugins-a.md` in the orchestrator inbox, with the reader files they name.

## Global Constraints

All of `docs/specs/2026-11-21-kit-step-0-plan.md` "Global Constraints" apply unchanged, including: no test file is committed, every proof is throwaway (failing run on the head before the change, passing run on the new head), kit changes are committed by pathspec, local only. In addition:

- Step 0 must have landed (Tasks 1 to 5). Proofs run through `conciv-test`.
- Proofs live in `packages/plugins/test-runner` (it has the kit, `conciv()` and Testing Library) unless a task says otherwise.
- A proof that uses a missing option fails at run time, not at typecheck (vitest does not typecheck). Each task says what its failing run prints; where it says "needs the run", report the real output and go on only if it fails for the stated reason.
- Any label, value or message in a proof that turns out different in the real run: stop and report, do not adjust the assert.
- Decided by the orchestrator while the maintainer was away, each small and reversible, flagged for him in "Decisions to confirm": the option and field names below, and the guards in Task 4.

## Review Focus

1. Two options that both change the same engine setting (`policies` and the settings resolver): one path only, Task 2.
2. An option the kit silently ignores (models given together with a harness adapter): it must throw, Task 4.
3. A second harness whose id equals the first: the product drops it silently, so the kit throws, Task 4.
4. `directory` given together with `files`, or a fixture the kit would delete on stop: Task 7.
5. A recorded request that cannot cross to browser mode (a function or a schema object in it): Task 3 keeps only plain data.

Run order: 1, 2, 3, 4, 5, 6, 7, 8. All eight change `packages/harness-testkit/src/harness-engine.ts`, so one lane does them one after another.

---

### Task 1: the engine address on the plugin testkit's engine

**Files:** `packages/plugin-testkit/src/engine.ts`, `browser-engine.ts`, `mount.ts`, `happy-dom.ts`, `browser.ts`, `node.ts`, `src/README.md`; `.changeset/kit-engine-address.md`.

**Interfaces:**

- Produces: `Engine` gains `address: EngineAddress` (`{apiBase: string; token: string}`, already the harness testkit's `HarnessEngineAddress`). `EngineAddress` is exported from `@conciv/plugin-testkit/node`.
- `mount` reads `options.engine.address`. Both `WeakMap`s (`engine.ts`, `browser-engine.ts`) and `engineAddress()` go; `makeMount` takes no argument; `StartedEngine.address` goes.

Facts (read): browser mode's handle already carries the address (`browser-commands.ts:4`, `test-projects.ts:135`); the health route is `GET <apiBase>/health` answering `{ok: true, harness, engine: {stale}, id}` (`packages/core/src/app.ts:329-334,360-362`); the kit's default harness id is `engine` (`scripted-harness.ts:10`); loopback origins are always allowed (`packages/core/src/lib/cors.ts:23-26`).

- [ ] **Step 1: Proof** `src/kit-address.test.ts` (node), and the same body as `src/kit-address.browser.test.tsx`:

```ts
import {expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit/node'

test('a test can call an engine route', async () => {
  const engine = await createEngine()

  const health = await fetch(`${engine.address.apiBase}/health`)

  expect(await health.json()).toMatchObject({ok: true, harness: 'engine'})
})
```

- [ ] **Step 2: Failing run.** Expected: `TypeError` reading `apiBase` of undefined.
- [ ] **Step 3: Make the change.** **Step 4: Passing run, node and browser mode.** Also rerun step 0's mount proof (happy-dom and browser mode): `mount` still resolves.
- [ ] **Step 5: Gates, commit** `feat(plugin-testkit): the engine a test makes carries its address`.

---

### Task 2: the engine's settings go through the product's resolver

**Files:** `packages/harness-testkit/src/harness-engine.ts`, `packages/plugin-testkit/src/engine.ts`, both `src/README.md`; `.changeset/kit-engine-settings.md`.

**Interfaces:**

- Produces on `HarnessEngineOptions` and `CreateEngineOptions`: `policies?: ConcivConfig['policies']`, `systemPrompt?: string`, `sessionId?: string`. `bootApp` builds `cfg` from `resolveConfig({...config, policies, systemPrompt, sessionId}, root, configProvider)` (`packages/core/src/config.ts:80-98`) and overrides only `enabled`, `stateRoot`, `harness`. When a test gives no `systemPrompt` the kit keeps today's `''`, and hub access stays `'project'`: the resolver's own defaults (`CHAT_SYSTEM_PROMPT`, `'open'`) are NOT taken.
- With `sessionId`, `engine.session` is that session (the engine makes its row at boot, `app.ts:865,888-904`); the kit does not create another first session.

Facts (read): the only reader of policies is `plugin.use` (`packages/plugin-host/src/core/plugin/module.ts:51`), which blocks the plugin, so its tools are missing; `resolveSessionId` throws `the configured conciv session id "<id>" is not a conciv session id (conciv_...)` (`config.ts:43-49`).

Before writing the proofs, read and cite: `isSessionId` (the shape a valid id must have) and how `module.ts:51` matches a policy's `resource` against a plugin (the exact string for `@conciv/plugin-test-runner`). Use those in the proofs. If either is unclear, stop and report.

- [ ] **Step 1: Proofs** `src/kit-settings.test.ts` (node):

```ts
import {expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit/node'

test('a session id that is not a conciv id is refused', async () => {
  await expect(createEngine({sessionId: 'nope'})).rejects.toThrow(
    'the configured conciv session id "nope" is not a conciv session id (conciv_...)',
  )
})

test('the engine opens on the session the test configured', async () => {
  const engine = await createEngine({sessionId: VALID_ID})

  expect(engine.session.id).toBe(VALID_ID)
})

test('a plugin the organization denies does not load', async () => {
  const engine = await createEngine({
    plugins: ['@conciv/plugin-test-runner'],
    policies: [{action: 'plugin.use', resource: TEST_RUNNER_RESOURCE, effect: 'deny'}],
  })

  const refused = await engine.session.tool('test_runner_status').failure({})

  expect(refused.message).toContain("'external_test_runner_status' is not defined")
})
```

`VALID_ID` and `TEST_RUNNER_RESOURCE` are the literals read above, written inline in the proof.

- [ ] **Step 2: Failing run.** Expected: test 1 resolves instead of rejecting; test 2 gets a generated id; test 3: `failure` throws "answered instead of failing".
- [ ] **Step 3: Change.** **Step 4: Passing run.** Rerun every earlier proof: the default engine behaves as before (same empty system prompt, same hub access).
- [ ] **Step 5: Gates, commit** `feat(testkits): policies, system prompt and a configured session reach the test engine`.

---

### Task 3: `requests()` keeps the whole model request

**Files:** `packages/harness-testkit/src/test-llm.ts`, `scripted-harness.ts`, `src/README.md`; `packages/plugin-testkit/src/README.md`; `.changeset/kit-whole-request.md`.

**Interfaces:**

- Produces: `TestLLM.ModelRequest = {system: string[]; messages: ModelMessage[]; tools: ModelRequestTool[]; model: string | null; effort: ReasoningEffort | null; options: Record<string, unknown>}` and `ModelRequestTool = {name: string; description: string; inputSchema: Record<string, unknown>}`. All plain data. `requests()` keeps its name and signature.

Facts (read): the adapter already receives each tool's schema as JSON Schema (`@tanstack/ai` 1.2.0 `dist/esm/activities/chat/index.js:770-774,800`), so NO export from `@conciv/ai` is needed (this corrects `kit-plan.md`); the system prompts reach the adapter call (`packages/chat/src/turn.ts:335`, `packages/ai/src/server/chat-server.ts:597-612`); the model and effort reach the harness only as `chatConfig({model, effort})` (`turn.ts:322-331`); the kit's default harness declares `systemPrompt: 'none'` (`scripted-harness.ts:143`), which is why the prompt is dropped today.

Before the change, read and cite the allowed values of the `systemPrompt` capability and pick the one under which the product hands the prompt to the adapter; if that changes what an earlier proof sees, stop and report.

- [ ] **Step 1: Proof** `src/kit-request.test.ts` (node):

```ts
import {expect, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'

test('the model request carries the system prompt and each tool with its input schema', async () => {
  const engine = await createEngine({
    plugins: ['@conciv/plugin-test-runner'],
    permission: {execute: 'deny'},
    systemPrompt: 'You answer in one word.',
    replies: [TestLLM.text('ok', 'a')],
  })

  await engine.session.send('hello')

  const [request] = await engine.requests()
  expect(request?.system).toContain('You answer in one word.')
  expect(request?.tools.find((tool) => tool.name === 'test_runner_run')).toMatchObject({
    inputSchema: {type: 'object', properties: {pattern: {type: 'string'}}},
  })
})
```

`permission: {execute: 'deny'}` makes every tool direct, so the plugin's tools reach the model under their own names (`packages/plugin-host/src/core/tool.ts:246-249`). The schema assert follows `z.object({pattern: z.string().optional()})` (`packages/plugins/test-runner/src/tools.ts:44`); if the real JSON Schema has another shape, stop and report it.

- [ ] **Step 2: Failing run.** Expected: `request.system` is undefined.
- [ ] **Step 3: Change; all four browser-mode paths still return plain JSON.** **Step 4: Passing run.** **Step 5: Gates, commit** `feat(testkits): requests() keeps the system prompts, tool schemas, model and options`.

---

### Task 4: models, commands and several harnesses as data

**Files:** `packages/harness-testkit/src/scripted-harness.ts`, `harness-engine.ts`, `packages/plugin-testkit/src/engine.ts`, both `src/README.md`; `.changeset/kit-harness-data.md`.

**Interfaces:**

- Produces: `models?: HarnessModel[]`, `commands?: HarnessCommand[]` (types from `@conciv/protocol/harness-types`), and `harnesses?: {id: string; models?: HarnessModel[]; commands?: HarnessCommand[]}[]`. Without `harnesses` the kit runs one harness with id `engine` using `models` and `commands` (defaults: today's lists). With `harnesses`, the first entry is the engine's harness and the rest are passed as `makeApp` `harnesses` (`packages/core/src/app.ts:276-279`); all answer from the one `replies` queue and one `requests()` log.
- The kit throws, before starting the engine: a duplicate harness id; `harnesses: []`; `harnesses` together with `harness`, `models` or `commands`; `models` or `commands` together with a `harness` adapter. Messages name the two options.

Facts (read): the composer's label is "Message the conciv agent" (`apps/conciv/src/pane/chat-pane.tsx:638`); a command option is labelled `/<name>` (`apps/conciv/src/pane/trigger-sources.ts:29-36`); the model trigger's label is `<MENU_LABEL>: <model name>` (`packages/ui-kit-chat/src/styled/harness-model-selector.tsx:149-151,493`); a harness's shown name is its id; never name a test command `model` (the widget's own `/model` hides it).

Before writing the proofs, read and cite the value of `MENU_LABEL`, the role of a slash-menu item, and how the model selector labels a model of a second harness (`packages/ui-kit-chat/src/.../model-menu.ts:47-48`).

- [ ] **Step 1: Proofs** `src/kit-harness.dom.test.tsx` and the same body as `src/kit-harness.browser.test.tsx`: the two tests quoted in `013300-plugins-a.md` ("the model prompt shows the model the test gave the harness", "the slash menu lists the command the test gave the harness"), with every label replaced by the literal read above, plus:

```tsx
test('the model menu offers the model of a second harness', async () => {
  const user = userEvent.setup()
  const engine = await createEngine({
    harnesses: [
      {id: 'first', models: [{id: 'one', name: 'Model One'}]},
      {id: 'second', models: [{id: 'two', name: 'Model Two'}]},
    ],
  })
  await mount({engine, route: '/panel/latest?open=true'})

  await user.click(await screen.findByRole('button', {name: MODEL_TRIGGER_FOR_MODEL_ONE}))

  expect(await screen.findByRole(MODEL_ITEM_ROLE, {name: SECOND_HARNESS_MODEL_LABEL})).toBeDefined()
})
```

and in `src/kit-harness.test.ts` (node): `await expect(createEngine({harnesses: [{id: 'a'}, {id: 'a'}]})).rejects.toThrow('a')`.

- [ ] **Step 2: Failing run** (needs the run for the exact text; the stated reason: the menus show the kit's fixed lists). **Step 3: Change. Step 4: Passing run in happy-dom and browser mode. Step 5: Gates, commit** `feat(testkits): models, commands and several harnesses are data a test gives`.

---

### Task 5: timeouts

**Files:** `packages/harness-testkit/src/harness-engine.ts`, `packages/plugin-testkit/src/engine.ts`, both READMEs; `.changeset/kit-timeouts.md`.

**Interfaces:** `timeouts?: {firstChunkTimeoutMs?: number; eventHeartbeatIntervalMs?: number; stopGraceMs?: number; pageReplyTimeoutMs?: number; queuedActionTimeoutMs?: number}`, spread into `makeApp` (`packages/core/src/app.ts:219-227`).

Only `firstChunkTimeoutMs` has a clean proof now; the heartbeat needs step 2's event wait, and the page timeouts need the page plugin's journeys. They are passed through and proven with those.

- [ ] **Step 1: Proof** `src/kit-timeouts.test.ts` (node):

```ts
import {expect, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'

test('a silent agent fails the turn after the limit the test set', async () => {
  const engine = await createEngine({replies: [TestLLM.hangAfter()], timeouts: {firstChunkTimeoutMs: 500}})

  await expect(engine.session.send('hello')).rejects.toThrow('the agent produced no output within 1s')
})
```

The text rounds 500 ms to "1s" (`packages/ai/src/server/chat-server.ts:717,728`).

- [ ] **Step 2: Failing run.** Expected: it fails after the product's 30 s default with "within 30s", or on vitest's own timeout; either is the stated reason. **Step 3: Change. Step 4: Passing run (under 2 s). Step 5: Gates, commit** `feat(testkits): the test engine takes the product's timeouts`.

---

### Task 6: the stale-code report

**Files:** as Task 5; `.changeset/kit-staleness.md`.

**Interfaces:** `staleness?: EngineStaleness` (the plain value; type from `packages/contract/src/contract.ts:183-191`), passed to `makeApp` as `staleness: () => options.staleness` (`app.ts:235,464`). A value that changes during a test is not in this plan.

- [ ] **Step 1: Proof** `src/kit-staleness.test.ts` (node): read `EngineStaleness` and write the smallest valid stale value inline as `STALE`:

```ts
test('the engine reports the stale code the test gave it', async () => {
  const engine = await createEngine({staleness: STALE})

  const health = await fetch(`${engine.address.apiBase}/health`)

  expect(await health.json()).toMatchObject({engine: {stale: true}})
})
```

- [ ] **Step 2: Failing run:** `engine: {stale: false}`. **Step 3 to 5** as above, commit `feat(testkits): the test engine can report stale code`.

---

### Task 7: the project folder, and a fixture project

**Files:** `packages/harness-testkit/src/harness-engine.ts`; `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts`; both READMEs; `.changeset/kit-project-folder.md`.

**Interfaces:**

- `engine.root: string`: the project folder, real path. In browser mode it comes on the engine handle.
- `directory?: string`: an existing folder, resolved against the working directory as plugin paths are (`engine.ts:64-67`). The engine runs with `cwd` there; `stateRoot`, `home` and the temp folder stay in the kit's own temp root, which is the only thing removed on stop. `engine.root` is then the fixture folder. `directory` together with `files` throws.

Facts (read): `makeApp` already keeps `cwd` apart from `stateRoot` and `home`; the test runner resolves vitest by walking up from the project folder (`packages/plugins/test-runner/src/vitest-run.ts:94`), so a fixture inside `packages/plugins/test-runner` finds the package's own vitest; the product can write into the project (`.conciv/` screenshots, the vitest cache), so a fixture folder gets a `.gitignore` for those when the real tests add one.

- [ ] **Step 1: Proofs** `src/kit-project.test.ts` (node). The fixture is throwaway too: `fixtures/sample/package.json` (`{"name": "sample", "private": true, "type": "module"}`) and `fixtures/sample/sum.test.ts` (one passing vitest test), in the proof worktree only.

```ts
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {createEngine} from '@conciv/plugin-testkit/node'

test('a test reads the project file it gave the engine', async () => {
  const engine = await createEngine({files: {'notes.txt': 'hi'}})

  expect(readFileSync(join(engine.root, 'notes.txt'), 'utf8')).toBe('hi')
})

test('the agent runs the tests of a fixture project', async () => {
  const engine = await createEngine({plugins: ['@conciv/plugin-test-runner'], directory: 'fixtures/sample'})

  const result = await engine.session.tool('test_runner_run').call({})

  expect(result).toMatchObject({summary: {passed: 1, failed: 0}})
})
```

- [ ] **Step 2: Failing run:** test 1 `engine.root` is undefined; test 2 a tool failure saying the runner is unavailable (needs the run for the text). **Step 3: Change. Step 4: Passing run; after it the fixture folder still exists and holds no `.conciv` state of the engine (`ls -a fixtures/sample`), report anything the run wrote there. Step 5: Gates, commit** `feat(testkits): the project folder, and an engine run on a fixture project`.

---

### Task 8: what the editor was asked to open

**Files:** `packages/harness-testkit/src/harness-engine.ts`; `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts` (command `concivOpened`); both READMEs; `.changeset/kit-opened.md`.

**Interfaces:** `engine.opened(): Promise<{file: string; line?: number; column?: number}[]>`, in the order asked; the recorder replaces today's `openInEditor: () => {}` and leaves out undefined fields.

Facts (read): the opener's type is `(file, line?, column?) => void` (`packages/core/src/editor/open.ts:3`); the `open` tool drops a column given without a line and answers `{ok, file[, line]}` (`packages/plugin-host/src/core/tool/plugin/server.ts:136-139`).

- [ ] **Step 1: Proof** `src/kit-opened.test.ts` (node), same body as `.browser.test.tsx`:

```ts
test('a test sees what the agent opened in the editor', async () => {
  const engine = await createEngine()

  await engine.session.tool('open').call({file: 'src/app.ts', line: 3, column: 5})
  await engine.session.tool('open').call({file: 'src/other.ts', column: 9})

  expect(await engine.opened()).toEqual([{file: 'src/app.ts', line: 3, column: 5}, {file: 'src/other.ts'}])
})
```

- [ ] **Step 2: Failing run:** `engine.opened is not a function`. **Step 3 to 5**, commit `feat(testkits): a test sees what the engine opened in the editor`.

---

## Moved out of step 1

- The file watcher option: its only clean proof needs step 2's event wait (`skill.updated`). It moves to the step 2 plan, after that call.

## Decisions to confirm (the maintainer's, made by the orchestrator while he was away)

1. Names: `policies`, `systemPrompt`, `sessionId`, `models`, `commands`, `harnesses`, `timeouts`, `staleness`, `directory`, `engine.root`, `engine.address`, `engine.opened()`, and the fields of `TestLLM.ModelRequest`.
2. The kit keeps an empty system prompt and `'project'` hub access by default; it does not take the product defaults.
3. The four guards in Task 4, and `directory` with `files` throwing in Task 7.
4. A harness is shown by its id; no `name` field was added.
