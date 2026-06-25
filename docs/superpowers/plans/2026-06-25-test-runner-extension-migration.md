# Test-Runner Standalone Extension — Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this project works inline — do NOT dispatch subagents) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Stop for review between tasks.

**Goal:** Move the test runner into the first standalone built-in extension `@mandarax/extension-test-runner`, so zero test-runner code remains in `@mandarax/core`, `@mandarax/widget`, `@mandarax/protocol`, `@mandarax/tools`, `@mandarax/tool-ui`, `@mandarax/harness`, or `@mandarax/cli`, while the live test card still streams in chat with no regressions.

**Architecture:** The generic extension API (Gaps A–D) already landed and is fixture-proven; this plan is the migration layer on top. It runs the runner manager inside `.server()` (the manager IS the injected `context`), serves `/api/ext/test-runner/*` on `server.app`, exposes the `test` tool reading `ctx.manager`, and renders the live card via a tool `.render()` that opens the namespaced SSE through `ctx.apiBase`. `@mandarax/test-runner` (the vitest/jest/playwright/node-test adapters) stays as the engine; only the contract types relocate out of `@mandarax/protocol`.

**Tech Stack:** SolidJS, zod v4, h3 + srvx (server), TanStack AI tool defs, jiti (server-half load), tsdown (package build, client/server split), Playwright + vitest (ITs), turborepo, oxlint/oxfmt.

## Key decisions (load-bearing — baked into this plan; flag before executing if you disagree)

1. **The extension card gets live data + editor-open through `ctx.apiBase`, not injected `ToolViewCtx` seams.** `ToolViewCtx.subscribeTestRunner` is deleted; the card opens `EventSource(\`${ctx.apiBase}/api/ext/test-runner/stream\`)` itself. `ToolViewCtx.openEditor` is deleted; the card POSTs `${ctx.apiBase}/api/editor/open`(the editor route stays in core — it is not test-runner-specific).`ToolViewCtx`keeps`apiBase`, `harnessId`, `sendMessage`, `respondApproval`. `ToolAccent`keeps`'test'` (a UI-local palette value, not a classification layer; harmless and the card uses it).
2. **`defineTool` gains an optional `streamTitle?: string`** — the present-tense label shown on the now-line while the tool streams. `tool-ui`'s `nowTitle()` stops hard-coding `mandarax_test`; the widget threads each registered renderer's `streamTitle` into `nowTitle` by tool name. This is the one generic-API addition the migration forces.
3. **Built-in registration uses the landed array path, not the deleted queue.** The plugin owns `builtinExtensions: AnyExtension[]` merged into `loadServerExtensions(...)` (server → `start({extensions})`) and `extensionsModuleSource()` prepends the built-in's client import into the `mountWidget([...])` array. There is no `__MANDARAX__.queue` / `installExtensionGlobal` (deleted in the split).
4. **`MandaraxConfig.testRunner` moves to `extensions['test-runner'].runner`** via the extension's `configSchema`; the top-level field + `ResolvedMandaraxConfig.testRunner` + `MANDARAX_TEST_RUNNER` resolution are deleted (v0, break freely).
5. **Package location:** `packages/extensions/test-runner/` → name `@mandarax/extension-test-runner`, with a `./client` subpath for the browser view. `pnpm-workspace.yaml` gains `packages/extensions/*`.

## Global Constraints

- **No test-runner symbol** remains in core/widget/protocol/tools/tool-ui/harness/cli after Slice D. (`@mandarax/test-runner` the engine package stays.)
- **Code style (HARD):** zero narration comments (one concise line max), no `any`/casts, no IIFE, no `else`, functions not classes, map/reduce over if/else, names spelled out fully. Two sanctioned leaf casts allowed only behind a zod parse or where the author types nothing (see the gaps work).
- **No mocks/stubs/jsdom.** Real `http.createServer`/h3 apps, real browser (Playwright `browser.newPage()`), real MCP, real child processes.
- **Build/typecheck/test via turbo:** `pnpm turbo <tasks> --filter=<pkg>`. Widget/core ITs need `@mandarax/core` + `@mandarax/extension-test-runner` built first.
- **v0, break freely** — no back-compat shims; update every call site in the same change.
- **Run every command from the worktree** `/Users/dev/Public/web/aidx/.claude/worktrees/extension-api-rewrite`. Never `cd` to the main repo root.
- The oxfmt pre-commit hook reflows files and aborts the first commit — re-add and commit again.

---

## File Structure

**Slice A — `defineTool.streamTitle` (the one API gap):**

- Modify `packages/extension/src/define-tool.ts`, `packages/extension/src/types.ts` — `streamTitle?` on the tool def + `ExtensionTool`.
- Modify `packages/tool-ui/src/now-title.ts` — `nowTitle(part, titleByName)` consults a name→title map; drop the `mandarax_test` case.
- Modify `packages/tool-ui/src/types.ts` (`ToolCardEntry` gains `streamTitle?`), `packages/extension/src/collect-client.ts` (carry it), `packages/widget/src/chat-panel.tsx` (build the map, pass to `nowTitle`).

**Slice B — relocate contract types out of `@mandarax/protocol`:**

- Create `packages/test-runner/src/events.ts` — `TestState`/`TestError`/`Summary`/`FileState`/`TestRow`/`TestRunResult`/`TestEvent` (+ schemas) + `TestCaseLike`/`parseFailure`. Add `./events` export to `packages/test-runner/{package.json,tsdown.config.ts}`.
- Move `runner-types.ts` runtime+types into `packages/test-runner/src/runner.ts` (`TestRunnerManager`/`TestRunnerAdapter`/`RunArgs`/`ListResult`/`UiServerInfo`/`TestRunnerCapabilities`/`defineRunner`/`isRunnerUnavailable`/`runnerUnavailableError`). Add `./runner` export.
- Create `packages/protocol/src/editor-types.ts` — `EditorOpenSchema`/`EditorOpen` (moved out of `test-types.ts`). Add `./editor-types` export; drop `./test-types` + `./runner-types` from `packages/protocol/{tsdown.config.ts,package.json}`.
- Modify importers: `packages/test-runner/src/*` (local imports), `packages/core/src/api/editor/editor.ts` + `packages/widget/src/chat-panel.tsx` (`EditorOpenSchema` from `editor-types`), `packages/tool-ui/src/cards/test.tsx` (events from `@mandarax/test-runner/events`).

**Slice C — create `@mandarax/extension-test-runner` + register as a built-in:**

- Create `packages/extensions/test-runner/package.json`, `tsconfig.json`, `tsdown.config.ts` (two entries: `src/extension.ts` server view, `src/client.ts` browser view), `vitest config` as needed.
- Create `packages/extensions/test-runner/src/extension.ts` — `defineExtension({name:'test-runner', configSchema, tools:[testTool], Component?, systemPrompt}).server(...).client(...)`.
- Create `packages/extensions/test-runner/src/test-tool.ts` — `defineTool` with `.server((input, ctx) => ctx.manager…)` + `.render(TestCard)` + `streamTitle`.
- Create `packages/extensions/test-runner/src/test-card.tsx` — the card (moved from `tool-ui/src/cards/test.tsx`, rewired to `ctx.apiBase`).
- Create `packages/extensions/test-runner/src/client.ts` — the browser entry (default export = the client-collapsed builder).
- Modify `pnpm-workspace.yaml` (`packages/extensions/*`), `packages/plugin/package.json` (dep), `packages/plugin/src/core/extensions.ts` (`builtinExtensions` + `extensionsModuleSource` import), `packages/plugin/src/core/{boot.ts,vite.ts}` (merge built-ins into `start`).

**Slice D — delete test-runner from the seven packages + rewire:**

- Delete: `packages/core/src/api/test-runner/`, `packages/tools/src/test.ts`, `packages/tool-ui/src/cards/test.tsx` + `test.stories.tsx`, `packages/widget/src/test-card.tsx`, `packages/cli/src/test.ts`.
- Modify: `packages/core/src/app.ts` (drop runner create + `registerTestRunnerRoutes` + the `test` ctx method), `packages/core/src/api/mcp/mcp.ts` (no `test`), `packages/core/src/config.ts` + `packages/protocol/src/config-types.ts` (drop `testRunner`), `packages/tools/src/server.ts` (drop `mandarax_test`), `packages/protocol/src/tool-view-types.ts` (drop `subscribeTestRunner`/`openEditor`), `packages/tool-ui/src/index.ts` + `builtinToolCards` (drop the test card), `packages/widget/src/{chat-panel.tsx,mount.tsx}` (drop the SSE seam + the `__MANDARAX_RENDER_TEST_CARD__` test seam), `packages/harness/src/claude/system-prompt.ts` (drop the `mandarax_test` clause), `packages/cli/src/*` (drop the `test` command registration).

**Slice E — authoring + final gate:**

- Modify `packages/extension/src/catalog.ts` (no test-runner specifics needed; verify scaffold/validate still pass), the SKILL `packages/harness/plugins/claude/skills/mandarax-extensions/SKILL.md` if it references the test runner.

---

## Slice A — `defineTool.streamTitle` (the now-line label moves onto the tool)

### Task A1: `defineTool` carries `streamTitle`

**Files:**

- Modify: `packages/extension/src/define-tool.ts`, `packages/extension/src/types.ts`
- Test: `packages/extension/test/define-tool.test.ts` (extend)

**Interfaces:**

- Produces: `defineTool({…, streamTitle?: string})`; `ExtensionTool.streamTitle?: string` (carried onto the builder).

- [ ] **Step 1: Write the failing test** (append to `define-tool.test.ts`)

```ts
test('streamTitle is carried onto the builder', () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({}), streamTitle: 'Running tests'})
  expect(tool.streamTitle).toBe('Running tests')
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @mandarax/extension exec vitest run test/define-tool.test.ts` → FAIL (`streamTitle` not on the type / undefined).

- [ ] **Step 3: Implement** — in `types.ts` add `streamTitle?: string` to `ExtensionTool`. In `define-tool.ts`, add `streamTitle?: string` to the `definition` param and set `streamTitle: definition.streamTitle` on the builder literal.

- [ ] **Step 4: Run to verify it passes** — same command → PASS; `pnpm turbo typecheck --filter=@mandarax/extension` green.

- [ ] **Step 5: Commit** — `git commit -m "feat(extension): defineTool carries an optional streamTitle for the now-line"`.

### Task A2: `nowTitle` reads a name→title map; tool-ui stops hard-coding test

**Files:**

- Modify: `packages/tool-ui/src/now-title.ts`, `packages/tool-ui/src/types.ts` (`ToolCardEntry`), `packages/extension/src/collect-client.ts`, `packages/widget/src/chat-panel.tsx`
- Test: `packages/tool-ui/test/now-title.test.ts` (create or extend)

**Interfaces:**

- Consumes: `ExtensionTool.streamTitle` (A1).
- Produces: `nowTitle(part: ToolCallPart, titleByName?: Record<string, string>): string` — `titleByName[part.name]` wins over the built-in switch; the `mandarax_test` case is removed. `ToolCardEntry` gains `streamTitle?: string`; `collectToolRenderers` copies `tool.streamTitle` onto each entry.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tool-ui/test/now-title.test.ts
import {expect, test} from 'vitest'
import {nowTitle} from '../src/now-title.js'

test('an extension-supplied title wins by tool name', () => {
  const part = {type: 'tool-call', id: '1', name: 'test_runner_run', input: {}} as never
  expect(nowTitle(part, {test_runner_run: 'Running tests'})).toBe('Running tests')
})

test('falls back to the built-in label when no map entry exists', () => {
  const part = {type: 'tool-call', id: '1', name: 'Bash', input: {command: 'ls'}} as never
  expect(nowTitle(part)).toBe('Running ls')
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @mandarax/tool-ui exec vitest run test/now-title.test.ts` → FAIL (`nowTitle` takes 1 arg).

- [ ] **Step 3: Implement** — `nowTitle(part, titleByName = {})`: `const supplied = titleByName[part.name]; if (supplied) return supplied` before the switch; delete the `case 'mandarax_test'`. Add `streamTitle?: string` to `ToolCardEntry` in `tool-ui/src/types.ts`. In `collect-client.ts`, include `streamTitle: tool.streamTitle` on each pushed entry (carry the name too if the entry keys by name). In `chat-panel.tsx`, build `const streamTitles = () => Object.fromEntries(props.tools().flatMap((e) => (e.streamTitle ? [[e.names[0], e.streamTitle]] : [])))` and pass it at the `nowTitle(part)` call site → `nowTitle(part, streamTitles())`.

- [ ] **Step 4: Run to verify it passes** — tool-ui test green; `pnpm turbo build typecheck --filter=@mandarax/tool-ui --filter=@mandarax/extension --filter=@mandarax/widget` green.

- [ ] **Step 5: Commit** — `git commit -m "feat(tool-ui): nowTitle consults a tool-supplied streamTitle map; drop hard-coded mandarax_test"`.

---

## Slice B — relocate the contract types out of `@mandarax/protocol`

### Task B1: `@mandarax/test-runner/events` (wire types)

**Files:**

- Create: `packages/test-runner/src/events.ts`
- Modify: `packages/test-runner/package.json`, `packages/test-runner/tsdown.config.ts`
- Test: `packages/test-runner/test/events.test-d.ts` (create) or a runtime parse test.

**Interfaces:**

- Produces (moved verbatim from `protocol/src/test-types.ts`, MINUS `EditorOpenSchema`): `TestStateSchema`/`TestState`, `TestErrorSchema`/`TestError`, `SummarySchema`/`Summary`, `FileStateSchema`/`FileState`, `TestRowSchema`/`TestRow`, `TestRunResultSchema`/`TestRunResult`, `TestEventSchema`/`TestEvent`, `TestCaseLike`, `parseFailure`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/test-runner/test/events.test.ts
import {expect, test} from 'vitest'
import {TestEventSchema} from '../src/events.js'

test('a run-end event parses', () => {
  const ev = {
    type: 'run-end',
    runId: 'r',
    summary: {passed: 1, failed: 0, skipped: 0, durationMs: 5},
    failures: [],
    tests: [],
  }
  expect(TestEventSchema.parse(ev).type).toBe('run-end')
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @mandarax/test-runner exec vitest run test/events.test.ts` → FAIL (`../src/events.js` missing).

- [ ] **Step 3: Implement** — create `events.ts` by copying `protocol/src/test-types.ts` content EXCEPT `EditorOpenSchema`/`EditorOpen`. Add to `package.json` exports `"./events": {types, import}` and the entry to `tsdown.config.ts`.

- [ ] **Step 4: Run to verify it passes** — test green; `pnpm turbo build --filter=@mandarax/test-runner` green.

- [ ] **Step 5: Commit** — `git commit -m "feat(test-runner): own the wire event types (./events), moved off protocol"`.

### Task B2: `@mandarax/test-runner/runner` (manager/adapter contract)

**Files:**

- Create: `packages/test-runner/src/runner.ts`
- Modify: `packages/test-runner/{package.json,tsdown.config.ts}`, every `packages/test-runner/src/**` importer of `@mandarax/protocol/runner-types` and `@mandarax/protocol/test-types`
- Test: `packages/test-runner/test/runner.test.ts` (create)

**Interfaces:**

- Produces (moved from `protocol/src/runner-types.ts`): `RunArgs`, `ListResult`, `UiServerInfo`, `TestRunnerCapabilities`, `TestRunnerManager`, `TestRunnerAdapter`, `RunnerUnavailableError`, `runnerUnavailableError`, `isRunnerUnavailable`, `defineRunner`. Imports `TestEvent`/`TestRunResult` from `./events.js`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/test-runner/test/runner.test.ts
import {expect, test} from 'vitest'
import {defineRunner, isRunnerUnavailable, runnerUnavailableError} from '../src/runner.js'

test('defineRunner validates id + create', () => {
  expect(() => defineRunner({id: '', capabilities: {} as never, create: () => ({}) as never})).toThrow()
})
test('runner-unavailable error is tagged + detected', () => {
  expect(isRunnerUnavailable(runnerUnavailableError('vitest', 'no binary'))).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @mandarax/test-runner exec vitest run test/runner.test.ts` → FAIL (`../src/runner.js` missing).

- [ ] **Step 3: Implement** — create `runner.ts` from `protocol/src/runner-types.ts` (import `TestEvent`/`TestRunResult` from `./events.js`). Add `"./runner"` export + tsdown entry. Re-point every `packages/test-runner/src/**` import from `@mandarax/protocol/{runner-types,test-types}` to `./runner.js` / `./events.js` (grep: `grep -rl "@mandarax/protocol/\(runner\|test\)-types" packages/test-runner/src`).

- [ ] **Step 4: Run to verify it passes** — test green; `pnpm turbo build typecheck --filter=@mandarax/test-runner` green.

- [ ] **Step 5: Commit** — `git commit -m "feat(test-runner): own the manager/adapter contract (./runner), moved off protocol"`.

### Task B3: `protocol/editor-types` + drop the test/runner subpaths

**Files:**

- Create: `packages/protocol/src/editor-types.ts`
- Modify: `packages/protocol/{tsdown.config.ts,package.json}`, `packages/core/src/api/editor/editor.ts`, `packages/widget/src/chat-panel.tsx`
- Delete: `packages/protocol/src/test-types.ts`, `packages/protocol/src/runner-types.ts`

**Interfaces:**

- Produces: `EditorOpenSchema`/`EditorOpen` from `@mandarax/protocol/editor-types`.

- [ ] **Step 1: Write the failing type test**

```ts
// packages/protocol/test/editor-types.test.ts
import {expect, test} from 'vitest'
import {EditorOpenSchema} from '../src/editor-types.js'
test('editor-open body parses', () => {
  expect(EditorOpenSchema.parse({file: '/a.ts', line: 3})).toEqual({file: '/a.ts', line: 3})
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @mandarax/protocol exec vitest run test/editor-types.test.ts` → FAIL.

- [ ] **Step 3: Implement** — create `editor-types.ts` with `EditorOpenSchema`/`EditorOpen`. Add `"./editor-types"` export + tsdown entry; remove `"./test-types"` + `"./runner-types"` exports + entries. Delete `test-types.ts` + `runner-types.ts`. Re-point `core/src/api/editor/editor.ts` + `widget/src/chat-panel.tsx` to `@mandarax/protocol/editor-types`. (Other protocol importers of test/runner types are handled in Slice D's deletions; if a typecheck here flags one not yet deleted, note it — those files are removed in Slice D.)

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @mandarax/protocol exec vitest run test/editor-types.test.ts` + `pnpm turbo build typecheck --filter=@mandarax/protocol` green. (Core/widget will not fully typecheck until Slice D; that is expected and called out.)

- [ ] **Step 5: Commit** — `git commit -m "feat(protocol): editor-types leaf; drop test-types/runner-types subpaths"`.

---

## Slice C — `@mandarax/extension-test-runner` + built-in registration

### Task C1: scaffold the package + the test tool (server-only first, node IT)

**Files:**

- Create: `packages/extensions/test-runner/package.json`, `tsconfig.json`, `tsdown.config.ts`, `src/test-tool.ts`, `src/extension.ts`
- Modify: `pnpm-workspace.yaml`
- Test: `packages/extensions/test-runner/test/extension.it.test.ts` (create — real h3 via the core test server helper or a local h3 mount)

**Interfaces:**

- Produces: `testRunnerExtension` (default export of `src/extension.ts`) = `defineExtension({name:'test-runner', configSchema, tools:[testTool]}).server((server) => ({context:{manager}, dispose}))`. `configSchema = z.object({runner: z.enum(['vitest','jest','node-test','playwright']).default('vitest')})`. The `.server` factory builds the manager via `@mandarax/test-runner`'s registry (`getRunner(server.config.runner) ?? getRunner('vitest')`).`.create(server.cwd)`, registers `server.app.get('/stream'|'/list'|'/status'|'/ui')` + `server.app.post('/run'|'/stop')` mirroring today's `registerTestRunnerRoutes`, and returns `{context: {manager}, dispose: () => void manager.stop()}`.
- Produces: `testTool` = `defineTool<typeof TestInput, {manager: TestRunnerManager}>({name:'test_runner_run', description, inputSchema: TestInput, streamTitle:'Running tests'}).server(({action, pattern}, ctx) => ctx.manager…)` then `.render(TestCard)` (added in C2). `TestInput = z.object({action: z.enum(['list','run','status']), pattern: z.string().optional()})`.

- [ ] **Step 1: Write the failing node IT** (mirror `core/test/api/extension-server.it.test.ts`)

```ts
// packages/extensions/test-runner/test/extension.it.test.ts
import {expect, test} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {startTestServer} from '@mandarax/core/test-helpers' // see note
import {testRunnerExtension} from '../src/extension.js'

test('extension serves /status and registers test_runner_run', async () => {
  const {base, close} = await startTestServer({
    extensions: [testRunnerExtension],
    extensionConfig: {'test-runner': {runner: 'vitest'}},
  })
  try {
    const status = await (await fetch(`${base}/api/ext/test-runner/status`)).json()
    expect(status).toHaveProperty('summary')
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    expect((await mcp.tools()).map((t) => t.name)).toContain('test_runner_run')
    await mcp.close()
  } finally {
    await close()
  }
}, 30_000)
```

> NOTE: `startTestServer` lives in `@mandarax/core/test/helpers/server.ts` (not exported). Either (a) add a `@mandarax/core` dev export `./test-helpers` pointing at it, or (b) stand up a local h3 server in this test calling `makeExtensionApp` + `registerMcpRoutes` directly. Pick (a) — one small export — and record it in this task.

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @mandarax/extension-test-runner exec vitest run` → FAIL (package/exports missing).

- [ ] **Step 3: Implement** — scaffold `package.json` (deps: `@mandarax/extension`, `@mandarax/test-runner`, `zod`; devDeps: `h3`, vitest, tsdown, `@tanstack/ai-mcp`, `@mandarax/core`), `tsconfig.json` (extends the repo base), `tsdown.config.ts` (entries `src/extension.ts` + `src/client.ts`). Write `test-tool.ts` (no `.render` yet) + `extension.ts` per Interfaces. Add `packages/extensions/*` to `pnpm-workspace.yaml`; `pnpm install`. Add the `@mandarax/core` `./test-helpers` export.

- [ ] **Step 4: Run to verify it passes** — `pnpm turbo build --filter=@mandarax/extension --filter=@mandarax/core --filter=@mandarax/test-runner && pnpm --filter @mandarax/extension-test-runner exec vitest run` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(extension-test-runner): server factory owns the runner + routes + test tool"`.

### Task C2: the card + client view (`.render` + `.client`)

**Files:**

- Create: `packages/extensions/test-runner/src/test-card.tsx`, `packages/extensions/test-runner/src/client.ts`, `packages/extensions/test-runner/src/test-card.stories.tsx`
- Modify: `packages/extensions/test-runner/src/test-tool.ts` (`.render(TestCard)`), `packages/extensions/test-runner/src/extension.ts` (`.client(...)` if a shared subscription is wanted), `tsdown.config.ts`/`package.json` (`./client` subpath)
- Test: `packages/extensions/test-runner/test/test-card.stories.tsx` drives a Storybook/browser render, OR a widget browser IT in Slice D.

**Interfaces:**

- Produces: `TestCard(props: ToolCardProps)` — moved from `tool-ui/src/cards/test.tsx`, with the two seams rewired: live SSE via `new EventSource(\`${props.ctx.apiBase}/api/ext/test-runner/stream\`)` (replacing `ctx.subscribeTestRunner`), editor-open via a POST to `${props.ctx.apiBase}/api/editor/open`(replacing`ctx.openEditor`), "Fix this" via `props.ctx.sendMessage`. `client.ts`default-exports the client-collapsed builder for`@mandarax/extension-test-runner/client`.

- [ ] **Step 1: Write the failing render test** — a stories file rendering `TestCard` with a static `result` (a `run-end` shaped `TestRunResult`) and asserting the pass/fail tree renders; run via the package's browser/Storybook test. (Full body mirrors `tool-ui/src/cards/test.stories.tsx`, which is being deleted in Slice D — copy it here and repoint the import.)

- [ ] **Step 2: Run to verify it fails** — package test → FAIL (`TestCard` missing).

- [ ] **Step 3: Implement** — copy `tool-ui/src/cards/test.tsx` → `test-card.tsx`; replace the `ctx.subscribeTestRunner` path with an `EventSource` on `ctx.apiBase`; replace `ctx.openEditor` with a `fetch` POST to `/api/editor/open`; import events from `@mandarax/test-runner/events`. Add `.render(TestCard)` to `test-tool.ts`. Create `client.ts` (default export the builder). Add the `./client` subpath to `package.json`/`tsdown.config.ts`.

- [ ] **Step 4: Run to verify it passes** — package render test green; `pnpm turbo build typecheck --filter=@mandarax/extension-test-runner` green.

- [ ] **Step 5: Commit** — `git commit -m "feat(extension-test-runner): live + static TestCard via ctx.apiBase; client view"`.

### Task C3: register as a built-in (plugin)

**Files:**

- Modify: `packages/plugin/package.json` (dep `@mandarax/extension-test-runner`), `packages/plugin/src/core/extensions.ts` (`builtinExtensions` + `extensionsModuleSource`), `packages/plugin/src/core/boot.ts`, `packages/plugin/src/core/vite.ts`
- Test: `packages/plugin/test/extension-isolation.it.test.ts` (extend) or a new `builtin.it.test.ts`

**Interfaces:**

- Produces: `loadServerExtensions(root)` returns `[testRunnerExtension, ...discovered]`; `extensionsModuleSource()` emits `import testRunner from '@mandarax/extension-test-runner/client'` and includes it first in the `mountWidget([testRunner, ...userExtensions])` array.

- [ ] **Step 1: Write the failing test** — assert `loadServerExtensions(<empty dir>)` returns a list whose names include `'test-runner'`, and that `extensionsModuleSource()` contains `@mandarax/extension-test-runner/client`.

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @mandarax/plugin exec vitest run` → FAIL.

- [ ] **Step 3: Implement** — add `const builtinExtensions = [testRunnerExtension]` (server import) merged into `loadServerExtensions` result; prepend the client import line in `extensionsModuleSource()`; thread through `boot.ts`/`vite.ts` (they already pass `loadServerExtensions(...)` to `start`). Add the plugin dependency.

- [ ] **Step 4: Run to verify it passes** — plugin test green; `pnpm turbo build typecheck --filter=@mandarax/plugin` green.

- [ ] **Step 5: Commit** — `git commit -m "feat(plugin): register test-runner as the first built-in extension"`.

---

## Slice D — delete test-runner from the seven packages + verify no regression

> This is the atomic removal. After it, the grep gate in the Final section must come back clean. Land it as ONE task: many files, but they only typecheck together (deleting a route + its tool + its config field + its card must happen in one commit).

**Files:** (delete) `packages/core/src/api/test-runner/`, `packages/tools/src/test.ts`, `packages/tool-ui/src/cards/test.tsx` + `test.stories.tsx`, `packages/widget/src/test-card.tsx`, `packages/cli/src/test.ts`. (modify) `packages/core/src/{app.ts,api/mcp/mcp.ts,config.ts}`, `packages/protocol/src/{config-types.ts,tool-view-types.ts}`, `packages/tools/src/{server.ts,types.ts}`, `packages/tool-ui/src/{index.ts,now-title.ts}` (already done in A2) + the `builtinToolCards` source, `packages/widget/src/{chat-panel.tsx,mount.tsx}`, `packages/harness/src/claude/system-prompt.ts`, `packages/cli/src/<command-index>`.

**Interfaces:**

- `MandaraxToolContext` loses `test`; `mandaraxTools` drops `mandaraxTestServerTool`. `ToolViewCtx` loses `subscribeTestRunner`/`openEditor`. `ResolvedMandaraxConfig`/`MandaraxConfig` lose `testRunner`. `makeApp` no longer creates a runner or calls `registerTestRunnerRoutes`.

- [ ] **Step 1: Write the failing IT** — the live-card regression guard. A widget browser IT (Playwright, mirroring `widget.it.test.ts`) OR a core node IT proving the test card still streams from `/api/ext/test-runner/stream` end-to-end with the built-in registered. (If a widget browser IT: serve a page that mounts the bundle with the built-in, script an SSE on `/api/ext/test-runner/stream`, assert the card renders `1 failed` + the failure row. This replaces the deleted `__MANDARAX_RENDER_TEST_CARD__` seam's coverage.) Write it RED first (it exercises the post-deletion wiring).

- [ ] **Step 2: Run to verify it fails** — appropriate `vitest run` → FAIL.

- [ ] **Step 3: Implement the deletions + rewires** — delete the files above; in `core/app.ts` drop `requireRunner`/`runner`/`registerTestRunnerRoutes` + the `test:` ctx; in `mcp.ts`/`tools/types.ts` drop `test` from `MandaraxToolContext`; in `tools/server.ts` drop `mandaraxTestServerTool` + its import; in `config.ts`+`config-types.ts` drop `testRunner` (+ `MANDARAX_TEST_RUNNER`); in `tool-view-types.ts` drop the two seams; in `tool-ui/index.ts`+`builtinToolCards` drop the test card; in `widget/chat-panel.tsx` drop the `subscribeTestRunner` wiring (~line 444-460) + the `ToolViewCtx` fields it set; in `widget/mount.tsx` drop `TestCard` import + `mountTestCardForTest` + `__MANDARAX_RENDER_TEST_CARD__`; in `harness/system-prompt.ts` drop the `mandarax_test runs tests;` clause (keep `mandarax_open`); in `cli` drop the `test` subcommand registration.

- [ ] **Step 4: Run to verify it passes** — the regression IT green; `pnpm turbo build typecheck lint test --filter=@mandarax/core --filter=@mandarax/widget --filter=@mandarax/protocol --filter=@mandarax/tools --filter=@mandarax/tool-ui --filter=@mandarax/harness --filter=@mandarax/cli --filter=@mandarax/plugin --filter=@mandarax/extension-test-runner` all green.

- [ ] **Step 5: Commit** — `git commit -m "refactor: remove test-runner from core/widget/protocol/tools/tool-ui/harness/cli — lives in @mandarax/extension-test-runner"`.

---

## Slice E — authoring + final gate

### Task E1: SKILL + catalog sweep

**Files:** `packages/harness/plugins/claude/skills/mandarax-extensions/SKILL.md`, `packages/extension/src/catalog.ts` (verify only)

- [ ] **Step 1:** Grep the SKILL + catalog for `test-runner`/`mandarax_test`/`testRunner`; if any reference the OLD built-in surface, update to describe the extension as the worked example (or remove if stale).
- [ ] **Step 2:** `pnpm --filter @mandarax/core exec vitest run test/api/mcp/extension-tools.it.test.ts` (catalog/scaffold/validate still green).
- [ ] **Step 3: Commit** — `git commit -m "docs(extensions): SKILL/catalog reflect test-runner as a standalone extension"`.

---

## Final gate

- [ ] `git grep -nE "test-runner|testRunner|TestRunner|mandarax_test|subscribeTestRunner|runner-types" -- packages/core packages/widget packages/protocol packages/tools packages/tool-ui packages/harness packages/cli ':!*.test.*'` → only `@mandarax/test-runner` engine references (the import of the engine package by the extension is in `packages/extensions/`, not these) — i.e. NO test-runner domain symbol in the seven packages.
- [ ] `pnpm turbo build typecheck lint test` across all touched packages → green.
- [ ] The live test card streams in a real browser via the built-in (the Slice D regression IT) — no regression vs the deleted `__MANDARAX_RENDER_TEST_CARD__` path.
- [ ] CLI `mandarax tools test …` either removed cleanly OR re-homed (decision: removed — the extension owns its own routes; a CLI shim can come later if wanted; record the removal in the commit).

---

## Self-Review

**Spec coverage:** Gaps A–D (done, prior pass) are the foundation. Slice A = the one new API need (`streamTitle`) the migration surfaces. Slice B = relocate contract types out of protocol (break the "no test-runner in protocol" rule). Slice C = the extension package (server/tool/card/client) + built-in registration via the landed array path (not the deleted queue). Slice D = the atomic deletion across the seven packages + the live-card regression guard. Slice E = authoring. Final gate = the grep proof + the no-regression IT.

**Placeholder scan:** The two genuinely open spots are flagged inline, not hidden: (1) Task C1 NOTE — export `@mandarax/core` `./test-helpers` vs local h3 mount (recommended: the export); (2) Task D1 — widget-browser vs core-node regression IT (either is real; pick by where the bundle mount is cheapest). Every other step carries concrete files/commands. Card/tool/extension bodies are "moved verbatim + rewire these two seams," with the exact seams named.

**Type consistency:** `TestRunnerManager`/`TestEvent`/`TestRunResult` move B1→B2→consumed in C1/C2; `streamTitle` defined A1 → consumed A2 → set in C1's tool. `ToolViewCtx` seam removals (D) match the card's rewire to `ctx.apiBase` (C2). Tool name `test_runner_run` is consistent across C1 (tool), A2 test (map key example differs — uses the same literal), and the now-line map.

**Decision risk:** Five load-bearing calls are listed up top; if any flips (esp. #1 card-data-path or #2 streamTitle), Slices A/C/D change shape — confirm before executing.
