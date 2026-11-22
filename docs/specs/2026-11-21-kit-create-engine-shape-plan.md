# `createEngine` takes the product's config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `createEngine` is set up the way the conciv app is: one argument, the config a user writes in `conciv({...})`. What a test does beyond that is a call on the engine it gets back. The few things that must be known before the engine starts and are not product config sit in a small second argument.

**Architecture:** The kit already starts the engine through the product's `start`, which takes a `ConcivConfig`. So the first argument is passed straight through. The scripted agent's queue, the stale-code state and the project's files become calls on the engine. No kit option is a copy of a config field any more.

**Tech Stack:** as the step 0 plan.

**Spec:** the maintainer, 2026-11-21: "13 is still insane. Why is not like our conciv app?", "why is not doing it inside and give access to those?", "yes, but those can be exposed from the returned engine no?", then "yes" to: `createEngine(config)` with the product's config, the rest on the engine, the start-only inputs in a small second argument.

## Global Constraints

All of the step 0 plan's "Global Constraints" apply, and the landing rules of `2026-11-21-kit-last-pieces-plan.md` (own worktree and branch, land by cherry-pick under the commit lock).

- This task starts only after the clock (Task 1) and servers mode (Task 4) of the last-pieces plan have landed, because both add inputs in the old shape. It moves what they added.
- No real test exists yet, so nothing but READMEs, the skill, the plans' snippets and the first test file's draft uses the old shape. All of them are updated here.
- Every call on the engine works in node, happy-dom and browser mode (plain JSON, one browser command each).
- A value a browser-mode test cannot send (an Effect `Stream` reply such as `TestLLM.failAfter`) keeps today's limit; say so in the README, do not hide it.

## The shape

```ts
createEngine(config?: ConcivConfig, start?: EngineStart): Promise<Engine>
```

**`config`** is `ConcivConfig` from `@conciv/protocol/config-types` (`ConcivConfigSchema`, `:76-92`), parsed by that schema, passed to `start` as its `options`.

- These config fields are the kit's to set, and giving one is refused before the engine starts with a plain message naming the field: `stateRoot`, `homeDir`, `devEndpointDir`.
- `harness` (an id) picks which of the scripted agents is the engine's; default the first.
- `port` (a number) is the product's own field. `start` does not read it from the config (`core/src/config.ts:80-98`), so the kit maps it to `start`'s `port: {exact}`, as `unplugin/src/core/boot.ts:22` does. Giving it together with the second argument's `port` is refused with a plain message.
- Everything else (`plugins`, `permission`, `permissions`, `policies`, `systemPrompt`, `sessionId`, `hubAccess`, `claudeSessionId`, `enabled`, `widget`) is passed through untouched.

**`start`**, only what must be known before the engine starts and is not product config:

```ts
type EngineStart = {
  clock?: 'test'
  directory?: string
  timeouts?: {
    firstChunkTimeoutMs?
    firstStartTimeoutMs?
    eventHeartbeatIntervalMs?
    stopGraceMs?
    pageReplyTimeoutMs?
    queuedActionTimeoutMs?
  }
  harnesses?: Array<{id: string; models?: HarnessModel[]; commands?: HarnessCommand[]}>
  env?: Record<string, string>
  fs?: {filewatcher?: boolean}
  port?: 'connect'
}
```

`models` and `commands` are no longer top-level: one scripted agent with its own models is `harnesses: [{id: 'engine', models}]`.

**On the engine**, added:

| Call                          | Replaces                 | Notes                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.reply(...responses)`  | the `replies` option     | Appends to the scripted queue; `Promise<void>`                                                                                                                                                                                                              |
| `engine.stale(staleness)`     | the `staleness` option   | The kit hands `start` a function that returns the current value; before the first `stale` call it returns `undefined`, which the product reads as its own check (`StartOpts.staleness` becomes `() => EngineStaleness \| undefined`, `core/src/app.ts:483`) |
| `engine.version(version)`     | the `app.version` option | Needs the product to read the version per request: see Task 1                                                                                                                                                                                               |
| `engine.write(path, content)` | the `files` option       | Writes inside the project folder (same path guard as today); a file the engine reads at boot comes from a fixture `directory`                                                                                                                               |
| `engine.setting(...)`         | the `settings` option    | Exists already; the option is removed                                                                                                                                                                                                                       |

Unchanged on the engine: `session`, `newSession`, `gate`, `requests`, `address`, `root`, `opened`, `event`, `rpc`, `outside`, `loginCode`, `revokeBrowsers`, `restart`, and `clock` from the last-pieces plan.

`createHarnessEngine` (for harness authors) takes the same two arguments plus its own `harness?: HarnessAdapter` in `start`; `config` and the four flattened copies (`policies`, `systemPrompt`, `sessionId`, `hubAccess`) collapse into the first argument.

## Review Focus

1. A test that gives `stateRoot`, `homeDir` or `devEndpointDir`: refused with a message naming the field, and nothing was started.
2. The scripted agent takes its reply as opencode's `TestLLM` does (`_ref/opencode/packages/ai/src/testing.ts:168-180`): the reply is taken when the request arrives, an empty queue fails at once with a plain message, and only then is a gate waited on. A reply given during a gate goes to the next request.
3. `engine.write` with a path that leaves the project folder: refused, as `files` refuses today.
4. `engine.version` and `engine.stale` called after a `mount`: the app sees the new value on its next check, and before `mount` on its first.
5. Browser mode: each new call is one command; `createEngine(config, start)` crosses as two plain JSON values.

---

### Task 1: the engine's reported version is read per request (product)

**Files:** `packages/core/src/lib/cors.ts`, `app.ts`, `engine-login.ts`, `start.ts`, READMEs, `.changeset/engine-version-live.md`.

**Interfaces:** `MakeAppOpts.app.version` and `StartOpts.app.version` become `() => string` (it was added on this branch as a string, commit `fa661b828`), read by `corsMiddleware` on every response, on the normal routes and the 401 answer, the way `staleness` is already a function. Absent: the core package's version, as today.

- [ ] **Proof** (node, test-runner, with Task 2's `engine.version`): the header reads `0.0.1` after `engine.version('0.0.1')` and the package version before; the 401 answer carries the same. **Failing run, change, passing run, gates** (`turbo run typecheck --filter=...@conciv/core`), **land.**

### Task 2: the two arguments, and the calls on the engine

**Files:** `packages/harness-testkit/src/harness-engine.ts`, `scripted-harness.ts`; `packages/plugin-testkit/src/engine.ts`, `browser-commands.ts`, `browser-engine.ts`, `test-projects.ts`; both READMEs and `src/README.md`s; `AGENTS.md` (the kits line); `packages/skills/skills/conciv-develop/SKILL.md` and `references/rpc-and-testing.md`; the snippets in `docs/specs/2026-11-21-real-tests-plan.md`; `.changeset/kit-create-engine-shape.md`.

- [ ] **Step 1: Proofs** (throwaway; node, happy-dom and browser mode where a mount is involved):

```ts
test('a test engine is set up like the app, and the test scripts the agent on it', async () => {
  const engine = await createEngine({plugins: ['@conciv/plugin-test-runner'], hubAccess: 'project'})
  await engine.reply(TestLLM.text('Hello from the agent', 'reply'))

  await engine.session.send('hello')

  expect(await engine.requests()).toHaveLength(1)
})

test('a config field the kit owns is refused before the engine starts', async () => {
  await expect(createEngine({homeDir: '/somewhere'})).rejects.toThrow('homeDir')
})

test('a file written on the engine is in its project', async () => {
  const engine = await createEngine()
  await engine.write('src/app.ts', 'export const a = 1\n')

  expect(await engine.session.tool('open').call({file: 'src/app.ts'})).toMatchObject({ok: true, file: 'src/app.ts'})
})
```

plus: `engine.stale(...)` then a mount shows the stale-code notice (read its text from `apps/conciv/src/shell/engine-notice.tsx`); `createEngine({}, {clock: 'test'})`, `{directory}`, `{timeouts}`, `{harnesses}` each still do what their step proofs showed. Read every label and value from the product first.

- [ ] **Step 2: Failing run** (the old shape rejects the new calls). **Step 3: Change.** Rewrite the earlier throwaway proofs to the new shape as you rerun them; they are not committed. **Step 4: Passing run; rerun every earlier proof in the new shape, all three modes. Step 5: Gates plus `publint` and `attw` for both kits, land.**

### Task 3: the first test file's draft

- [ ] Rewrite `<workspace>/aidx-wt-chat-test/apps/conciv/src/chat.dom.test.tsx` (uncommitted, the maintainer's template) to the new shape, run it three times through the bin on the landed head with the app's test setup (the kit as a devDependency, `concivTest()`), and report the file. Do not commit it: the test plan's Task 0 does.

---

## To confirm with the maintainer

1. The names: `engine.reply`, `engine.stale`, `engine.version`, `engine.write`, and the second argument's keys.
2. `models` and `commands` only inside `harnesses`.
3. The version as a function in the product.
4. `StartOpts.staleness` and `MakeAppOpts.staleness` may return `undefined` for "the product's own check" (the kit is the option's only caller; no new export).
5. `engine.write` is refused on an engine made with `directory` (it would write into the committed fixture folder).
