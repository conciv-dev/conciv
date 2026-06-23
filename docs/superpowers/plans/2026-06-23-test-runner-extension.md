# Test-Runner Standalone Extension — Implementation Plan

> **ON HOLD.** The extension delivery/split is being redesigned simpler — see `docs/superpowers/specs/2026-06-23-extension-split-design.md` (import-based, no global registry). This plan's test-runner migration is a LATER layer to rebuild on top of that. Do not execute as-is.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the test-runner into the first fully standalone `@mandarax/extension-test-runner`, growing the extension core API by exactly the four gaps the migration forces, so that zero test-runner code remains in core/widget/protocol/tools/tool-ui/harness/cli while the live test card still renders in chat with no regressions.

**Architecture:** Five sequential slices. Slices 1–2 grow the generic extension API (typed config, server factory that owns namespaced routes + injects tool context + returns cleanup, two-phase server lifecycle, client factory context) against a throwaway fixture extension — no test-runner code touched. Slice 3 relocates the runner-domain types out of protocol to break the dependency cycle. Slice 4 creates the extension package and atomically moves+deletes all test-runner code. Slice 5 updates the authoring surface.

**Tech Stack:** SolidJS, zod v4, h3 (server), TanStack AI tool defs, jiti (server-half loading), tsdown (package build — two entries for the client/server pre-split), Playwright (browser ITs), vitest (unit/node ITs), turborepo, oxlint/oxfmt.

## Global Constraints

- **No test-runner symbol** may remain in `@mandarax/core`, `@mandarax/widget`, `@mandarax/protocol`, `@mandarax/tools`, `@mandarax/tool-ui`, `@mandarax/harness`, or `@mandarax/cli` after slice 4.
- **Code style (HARD):** zero narration comments, no `any`/casts, no IIFE, no `else`, functions not classes, map/reduce over if/else, names spelled out fully. Prefer generics over type-only deps.
- **No mocks/stubs/jsdom.** Tests hit real `http.createServer`/h3 apps, a real browser (Playwright), real MCP, real child processes. Browser ITs use `browser.newPage()` not `newContext()`.
- **Build/typecheck via turbo**, never manual dist rebuilds: `pnpm turbo build --filter=<pkg>`. Widget/IT runs need `@mandarax/core` + the extension built first.
- **Routes registered by extensions are namespaced** to `/api/ext/<extension-name>/...`; extensions never receive a raw h3 app handle; SSE only through the re-exported `sseStream` helper.
- **`systemPrompt` stays a declarative field** on `defineExtension`; no imperative `server.systemPrompt()`.
- **v0, break API freely** — no back-compat shims; update all call sites in the same change.
- Run every command from the worktree `/Users/dev/Public/web/aidx/.claude/worktrees/extension-api-rewrite`; never `cd` to the main repo root.

---

## File Structure

**Slice 1–2 (API):**

- Modify `packages/extension/src/types.ts` — add `ConfigOf`, 4-arg builder types, `ExtensionServerTool.execute` 2nd context arg, `ServerRoute`, `ServerApi`, `ClientApi`, `ServerResult`.
- Modify `packages/extension/src/define-extension.ts` — generic over `Schema`/`Tools`, drop `as unknown as`, `configSchema`, `.client(client => …)` / `.server(server => …)` factory args.
- Modify `packages/extension/src/define-tool.ts` — `defineTool<Schema, Ctx>`, `.server((input, ctx) => …)`.
- Modify `packages/extension/src/runtime-context.ts` — per-extension value merge into the bag.
- Modify `packages/extension/src/collect-server.ts` → replace with builder-returning collection; new `apply-server.ts` runs `.server()` in the App phase.
- Create `packages/extension/src/server-route.ts` — the namespaced `{get,post,sse}` surface factory over an h3 app.
- Modify `packages/core/src/engine.ts`, `app.ts`, `api/mcp/mcp.ts` — two-phase lifecycle, context-passing `execute`, dispose collection.
- Modify `packages/plugin/src/core/extensions.ts` — `loadServerExtensions` returns builders; the plugin owns a `builtinExtensions: ExtensionBuilder[]` array merged with file-discovered user builders (`boot.ts`/`vite.ts:190`); `extensionsModuleSource()` emits each built-in's client import into the `__MANDARAX__.queue`; `vite.ts:113` param type changes.
- Modify `packages/tool-ui/src/now-title.ts` + `packages/widget/src/chat-panel.tsx` — `nowTitle` off the matched tool.
- Modify `packages/widget/src/chat-panel.tsx:745-747` (the `extensionInstances` memo — pass `ClientApi`, capture `dispose`) + `extension-slots.tsx` (per-card Provider wrapper + `ExtensionInstance.dispose`). Widget client seed stays `installExtensionGlobal([])`; built-ins arrive via the plugin-generated `__MANDARAX__.queue`, user ones via the same queue.
- Fixture: `packages/extension/test/fixtures/sample-server-extension.ts` and widget fixture `packages/widget/test/fixtures/sample-extension.tsx` (extended).

**Slice 3 (type relocation):**

- Create `packages/test-runner/src/events.ts` — node-free `TestEvent`/`TestEventSchema`/`TestRunResult`/`Summary`/`TestError`/`TestState` + schemas; add `./events` export.
- Modify `packages/test-runner/src/*` — re-point imports from `@mandarax/protocol/test-types`+`runner-types` to local.
- Move `runner-types.ts` runtime (`isRunnerUnavailable`, `runnerUnavailableError`, `defineRunner`, manager/adapter types) into `@mandarax/test-runner`.
- Create `packages/protocol/src/editor-types.ts` — `EditorOpenSchema`/`EditorOpen`.
- Modify `packages/protocol/{tsdown.config.ts,package.json}` — drop `test-types`/`runner-types` subpaths, add `editor-types`.
- Modify `packages/core/src/api/editor/editor.ts`, `widget/src/chat-panel.tsx` — import `EditorOpenSchema` from `editor-types`.

**Slice 4 (extension package + deletions):**

- Create `packages/extension-test-runner/` — `package.json` (browser/node split via tsdown; `./client` subpath for the client view), `src/extension.ts`, `src/test-tool.ts`, `src/test-card.tsx`, `src/test-card.stories.tsx`, `src/cli.ts`, `src/parse-json.ts`.
- Delete the full deletion list from the spec.
- Register in the plugin: add to the `builtinExtensions` array (server) and emit its client import in `extensionsModuleSource()` (client `__MANDARAX__.queue`); add `@mandarax/extension-test-runner` as a `@mandarax/plugin` dependency.

**Slice 5 (authoring):**

- Modify `packages/extensions/src/catalog.ts` (templates/validate), the scaffold, `packages/harness/plugins/claude/skills/mandarax-extensions/SKILL.md`.

---

## SLICE 0 — Prerequisite: consolidate onto the singular `@mandarax/extension`

> **Review-found blocker.** `core` and `plugin` import the contribution types from the LEGACY plural `@mandarax/extensions` (`core/src/app.ts:5`, `engine.ts:6`, `api/mcp/mcp.ts:5`, `plugin/src/core/vite.ts:16` — all `from '@mandarax/extensions'`), while `plugin/src/core/extensions.ts`+`boot.ts` already use the singular `@mandarax/extension`. They only typecheck because both packages define structurally-identical `ExtensionServerTool`/`ExtensionServerContributions`. The moment Task 1 changes the singular `execute` to 2-arg, the two diverge and core breaks. Consolidate FIRST.

### Task 0: Repoint all consumers to `@mandarax/extension` (singular); drop the plural dep

**Files:**

- Modify: `packages/core/src/app.ts:5`, `engine.ts:6`, `api/mcp/mcp.ts:5`, `packages/plugin/src/core/vite.ts:16` — import `ExtensionServerTool`/`ExtensionServerContributions` from `@mandarax/extension`.
- Modify: `packages/core/package.json:56`, `packages/widget/package.json:47`, `packages/plugin/package.json:79` — remove the `@mandarax/extensions` (plural) dependency.
- Note: the base rewrite intends to delete the plural `@mandarax/extensions` package (`contract.ts`/`discovery.ts` — the old imperative API); confirm what still imports it (the client `extensionsModuleSource` lives there today — `plugin/extensions.ts:11` re-exports it). Keep the plural package until Slice 1 Task 5 relocates `extensionsModuleSource`, then delete it.

- [ ] **Step 1:** repoint the four imports; remove the three deps.
- [ ] **Step 2:** `pnpm turbo typecheck --filter=@mandarax/core --filter=@mandarax/widget --filter=@mandarax/plugin` → PASS (structurally identical types, so this is a clean swap).
- [ ] **Step 3: Commit** — `"refactor: consume the singular @mandarax/extension contract everywhere"`.

---

## SLICE 1 — API foundations (typed config, server factory, tool context, two-phase lifecycle)

### Task 1: `defineTool<Schema, Ctx>` — context-carrying tool

> **Review fix — keep the typecheck green:** the injected-context arg on `serverExecute`/`ExtensionServerTool.execute` MUST be **optional** (`context?: unknown`). One-arg callers exist until Tasks 5–6 (`mcp.ts:20` `tool.execute(args)`, `collect-server.test.ts:29`); a required 2nd arg makes `pnpm turbo typecheck` RED across core+extension. Optional keeps every task's typecheck green. Step 2's red below is a TYPE error in the new test, not a runtime failure.

**Files:**

- Modify: `packages/extension/src/define-tool.ts`
- Modify: `packages/extension/src/types.ts:50-58` (`ExtensionTool`, `ExtensionServerTool`)
- Test: `packages/extension/test/define-tool.test.ts` (create), `packages/extension/test/types.test-d.ts` (extend)

**Interfaces:**

- Produces: `defineTool<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown>(def: {name; description; inputSchema: Schema; promptSnippet?; promptGuidelines?; nowTitle?}): ToolBuilder<Schema, Ctx>` where `ToolBuilder<Schema, Ctx>.server(execute: (input: z.output<Schema>, ctx: Ctx) => unknown | Promise<unknown>): ToolBuilder<Schema, Ctx>` and `.render(r): ToolBuilder<Schema, Ctx>`. `ExtensionTool` gains `nowTitle?: string` and a phantom `__ctx?: Ctx`. `ExtensionServerTool.execute: (input: unknown, context?: unknown) => Promise<unknown>` (context OPTIONAL — preserves one-arg callers until Task 6).

- [ ] **Step 1: Write the failing test**

```ts
// packages/extension/test/define-tool.test.ts
import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineTool} from '../src/define-tool.js'

test('tool execute receives input and injected context', async () => {
  const tool = defineTool<z.ZodObject<{n: z.ZodNumber}>, {factor: number}>({
    name: 't',
    description: 'd',
    inputSchema: z.object({n: z.number()}),
    nowTitle: 'Running',
  }).server((input, ctx) => input.n * ctx.factor)
  expect(tool.nowTitle).toBe('Running')
  expect(await tool.serverExecute?.({n: 3}, {factor: 2})).toBe(6)
})

test('serverExecute reparses raw input at the boundary', async () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({n: z.number()})}).server(
    (input) => input.n,
  )
  await expect(tool.serverExecute?.({n: 'x'}, {})).rejects.toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/extension exec vitest run test/define-tool.test.ts`
Expected: FAIL — `serverExecute` arity / `nowTitle` undefined.

- [ ] **Step 3: Implement**

```ts
// packages/extension/src/define-tool.ts
import type {z} from 'zod'
import type {ExtensionTool, ToolRenderer} from './types.js'

export type ToolBuilder<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown> = ExtensionTool & {
  inputSchema: Schema
  __ctx?: Ctx
  server: (execute: (input: z.output<Schema>, context: Ctx) => Promise<unknown> | unknown) => ToolBuilder<Schema, Ctx>
  render: (renderer: ToolRenderer) => ToolBuilder<Schema, Ctx>
}

export function defineTool<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown>(definition: {
  name: string
  description: string
  inputSchema: Schema
  promptSnippet?: string
  promptGuidelines?: string[]
  nowTitle?: string
}): ToolBuilder<Schema, Ctx> {
  const builder: ToolBuilder<Schema, Ctx> = {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    promptSnippet: definition.promptSnippet,
    promptGuidelines: definition.promptGuidelines,
    nowTitle: definition.nowTitle,
    server(execute) {
      builder.serverExecute = async (raw, context) => execute(definition.inputSchema.parse(raw), context as Ctx)
      return builder
    },
    render(renderer) {
      builder.clientRender = renderer
      return builder
    },
  }
  return builder
}
```

Update `types.ts`: `ExtensionTool` adds `nowTitle?: string` and `serverExecute?: (input: unknown, context?: unknown) => Promise<unknown>`; `ExtensionServerTool.execute: (input: unknown, context?: unknown) => Promise<unknown>` (context OPTIONAL — preserves one-arg callers until Task 6).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/extension exec vitest run test/define-tool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/define-tool.ts packages/extension/src/types.ts packages/extension/test/define-tool.test.ts
git commit -m "feat(extension): defineTool carries Ctx; execute takes injected context"
```

---

### Task 2: `defineExtension` generics — `configSchema` + tuple `tools` + 4-arg builder

**Files:**

- Modify: `packages/extension/src/define-extension.ts`, `packages/extension/src/types.ts`
- Test: `packages/extension/test/define-extension.test.ts` (create), `types.test-d.ts` (extend)

**Interfaces:**

- Consumes: `ToolBuilder<Schema, Ctx>` (Task 1).
- Produces: `defineExtension<Schema extends z.ZodTypeAny = z.ZodNever, Tools extends ToolBuilder<z.ZodObject<z.ZodRawShape>, unknown>[] = []>(meta: {name; configSchema?: Schema; tools?: [...Tools]; Component?; systemPrompt?; theme?}): ExtensionBuilder<ConfigOf<Schema>, Tools, {}, {}>`. `ConfigOf<S> = [S] extends [z.ZodNever] ? Record<never,never> : z.output<S>`. `RequiredContext<Tools> = intersection of each tool's `Ctx`. Builder: `ExtensionBuilder<Config, Tools, ServerContext, ClientValue>`with`.server<C extends RequiredContext<Tools>>(fn: (server: ServerApi<Config>) => ServerResult<C>): ExtensionBuilder<Config, Tools, C, ClientValue>`and`.client<V extends object>(fn: (client: ClientApi) => ClientFactoryResult<V>): ExtensionBuilder<Config, Tools, ServerContext, ClientValue & V>`, plus `useSlot()`and`useContext`(returns`ExtensionHostContext & ClientValue`). No `as unknown as`.

- [ ] **Step 1: Write the failing test (runtime + types)**

```ts
// packages/extension/test/define-extension.test.ts
import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'

test('configSchema parses with defaults applied', () => {
  const ext = defineExtension({name: 'x', configSchema: z.object({runner: z.string().default('vitest')})})
  expect(ext.parseConfig({})).toEqual({runner: 'vitest'})
})

test('no configSchema yields empty-object config', () => {
  const ext = defineExtension({name: 'x'})
  expect(ext.parseConfig(undefined)).toEqual({})
})

test('server factory return is retained', () => {
  const tool = defineTool<z.ZodObject<{n: z.ZodNumber}>, {f: number}>({
    name: 't',
    description: 'd',
    inputSchema: z.object({n: z.number()}),
  }).server((i, c) => i.n + c.f)
  const ext = defineExtension({name: 'x', tools: [tool]}).server(() => ({context: {f: 1}}))
  expect(ext.serverFactory).toBeTypeOf('function')
})
```

Add a `.test-d.ts` assertion: `defineExtension({name:'x', tools:[toolNeedingFactor]}).server(() => ({context: {}}))` must be a type error (missing `factor`), and `.server(() => ({context: {factor: 1}}))` must compile.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mandarax/extension exec vitest run test/define-extension.test.ts`
Expected: FAIL — `parseConfig` undefined.

- [ ] **Step 3: Implement**

Add `parseConfig(raw: unknown): Config` to the builder (`meta.configSchema ? meta.configSchema.parse(raw ?? {}) : {}`). Re-type the builder with the four parameters; type the builder object literally (no `as unknown as` — give `client`/`server` precise return types). Keep `useSlot`/`useContext` reading `useExtensionRuntimeContext()`. Fix the `useContext` impl return type from `ExtensionHostContext | Selected` (the current union bug at `define-extension.ts:44`) to the overload-narrowed result. **`RequiredContext<Tools>` MUST use the `UnionToIntersection` idiom** — `UnionToIntersection<CtxOf<Tools[number]>>` — not a bare `CtxOf<Tools[number]>` (which is a union = too-weak a constraint; two tools needing `{a}` and `{b}` must require BOTH). Define `ConfigOf`, `RequiredContext`, `UnionToIntersection`, `CtxOf`, `ServerApi`, `ServerResult`, `ClientApi` in `types.ts` (Task 3/4 fill route + client shapes; here they may be minimal: `ServerApi<Config> = {config: Config; cwd: string; route: ServerRoute}`, `ServerResult<C> = {context: C; dispose?: () => void | Promise<void>}`, `ClientApi = {apiBase: string; client: SessionClient; requestMeta: () => RequestMeta}`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @mandarax/extension exec vitest run` and `pnpm --filter @mandarax/extension exec tsc -p tsconfig.json --noEmit`
Expected: PASS; type test compiles, negative case errors as asserted.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/define-extension.ts packages/extension/src/types.ts packages/extension/test/define-extension.test.ts packages/extension/test/types.test-d.ts
git commit -m "feat(extension): defineExtension generic over configSchema + tuple tools, 4-arg builder"
```

---

### Task 3: Namespaced `ServerRoute` surface (`{get, post, sse}`)

**Files:**

- Create: `packages/extension/src/server-route.ts`
- Test: `packages/core/test/api/extension-routes.it.test.ts` (create — real h3 + http.createServer)

**Interfaces:**

- Consumes: core's `sseStream` (`@mandarax/core` internal — re-export a thin `sse` wrapper) and h3 `H3`.
- Produces: `makeServerRoute(app: H3, extensionName: string): ServerRoute` where `ServerRoute = {get(path, handler); post(path, handler); sse(path, open)}`. Every `path` is mounted at `/api/ext/<slug(extensionName)>/<path>`. `slug` lowercases and replaces non-alphanumerics with `-`.

- [ ] **Step 1: Write the failing IT**

```ts
// packages/core/test/api/extension-routes.it.test.ts
import {expect, test} from 'vitest'
import {H3} from 'h3'
import {serve} from 'srvx'
import {makeServerRoute, type SseRegister} from '@mandarax/extension/server-route'

test('routes mount under /api/ext/<name>/ and reject cross-origin', async () => {
  const app = new H3()
  const noopSse: SseRegister = () => {}
  const route = makeServerRoute(app, 'test-runner', noopSse)
  route.get('/status', () => ({ok: true}))
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  const base = new URL(server.url ?? '').origin
  const res = await fetch(`${base}/api/ext/test-runner/status`)
  expect(await res.json()).toEqual({ok: true})
  await server.close(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @mandarax/core exec vitest run test/api/extension-routes.it.test.ts`
Expected: FAIL — `makeServerRoute` not exported.

- [ ] **Step 3: Implement**

```ts
// packages/extension/src/server-route.ts
import type {H3} from 'h3'

export type SseEmit = (data: unknown) => void
export type SseEmit = (data: unknown) => void
export type SseRegister = (app: H3, path: string, open: (emit: SseEmit) => () => void) => void
export type ServerRoute = {
  get: (path: string, handler: (event: unknown) => unknown) => void
  post: (path: string, handler: (event: unknown) => unknown) => void
  sse: (path: string, open: (emit: SseEmit) => () => void) => void
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function makeServerRoute(app: H3, extensionName: string, sse: SseRegister): ServerRoute {
  const prefix = `/api/ext/${slug(extensionName)}`
  const at = (path: string) => `${prefix}${path.startsWith('/') ? path : `/${path}`}`
  return {
    get: (path, handler) => void app.get(at(path), (event) => handler(event)),
    post: (path, handler) => void app.post(at(path), (event) => handler(event)),
    sse: (path, open) => sse(app, at(path), open),
  }
}
```

`sse` is REQUIRED and injected by core (Task 6) as a wrapper over `sseStream`, so `@mandarax/extension` does not depend on `@mandarax/core` (no node-free default SSE exists here). The Task-3 IT therefore exercises `.get` only; the SSE path is covered by the Task-6 IT (which has core's `sseStream` to inject). Add `./server-route` to `packages/extension/package.json` exports.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm turbo build --filter=@mandarax/extension && pnpm --filter @mandarax/core exec vitest run test/api/extension-routes.it.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/server-route.ts packages/extension/package.json packages/core/test/api/extension-routes.it.test.ts
git commit -m "feat(extension): namespaced ServerRoute {get,post,sse} under /api/ext/<name>/"
```

---

### Task 4: `.client(client => …)` factory argument + capture dispose

> **Review note (current code):** the per-extension `value` merge ALREADY exists — `chat-panel.tsx:745` runs `extension.clientFactory?.().value` once per panel in a `createMemo`, and `extension-slots.tsx:22` spreads `...instance.clientValue` into the `ExtensionRuntimeContext.Provider`. So do NOT invent a `runApplyClient` helper. Two real defects to fix: (a) `clientFactory()` takes no args — give it `ClientApi`; (b) the `dispose` returned alongside `value` is **dropped** at `chat-panel.tsx:746` — capture it and call it in `onCleanup` (panel unmount + HMR), or the Gap-4 EventSource leaks.

**Files:**

- Modify: `packages/extension/src/define-extension.ts`, `types.ts` (`.client` factory takes `ClientApi`; `ClientApi = {apiBase: string; client: SessionClient; requestMeta: () => RequestMeta}`).
- Modify: `packages/widget/src/chat-panel.tsx:745-747` — pass the panel's `ClientApi` into `clientFactory(clientApi)`, store `{extension, clientValue, dispose}`, and `onCleanup(() => instances.forEach((i) => i.dispose?.()))`.
- Modify: `packages/widget/src/extension-slots.tsx` — `ExtensionInstance` gains optional `dispose`.
- Test: `packages/extension/test/define-extension.test.ts` (extend — `.client((api) => …)` receives the api and its `dispose` is retained on the builder result), widget browser IT in Task 9 proves the EventSource closes on unmount.

- [ ] **Step 1: Write the failing test** — assert `clientFactory` is invoked with a `ClientApi` and the returned `{value, dispose}` round-trips (dispose is a function).
- [ ] **Step 2: Run** → FAIL (factory takes no args today).
- [ ] **Step 3: Implement** the `ClientApi` arg in `define-extension.ts`; update `chat-panel.tsx` memo to pass `clientApi` (built from the panel's `apiBase`/`client`/`requestMeta`, already in `hostBag`) and capture+dispose.
- [ ] **Step 4: Run** → `pnpm turbo build typecheck --filter=@mandarax/extension --filter=@mandarax/widget` PASS.
- [ ] **Step 5: Commit** — `"feat(extension): client factory receives ClientApi; widget captures + disposes it"`.

---

### Tasks 5 + 6: Builder collection + two-phase core wiring — LAND TOGETHER

> **Review fix:** Tasks 5 and 6 are mutually dependent and must land in ONE commit. Task 5 changes `loadServerContributions`→`loadServerExtensions` (returns builders) and replaces `collectServerContributions`; Task 6's `engine`/`app`/`boot`/`vite` are the only things that can consume the new shape. Neither typechecks without the other, so there is no independent green gate at Task 5 — gate green only at the end of Task 6. (Sub-steps still commit the extension-package unit tests first, then the core wiring.)

### Task 5: Builder collection → return builders; `applyServerContributions` (App phase)

**Files:**

- Modify: `packages/extension/src/collect-server.ts` (rename concept), create `packages/extension/src/apply-server.ts`
- Modify: `packages/plugin/src/core/extensions.ts` (return `ExtensionBuilder[]`, not drained contributions)
- Test: `packages/extension/test/apply-server.test.ts` (create)

**Interfaces:**

- Produces: `collectSystemPrompts(builders): string[]` (Prompt phase — reads declarative `systemPrompt` + per-tool `promptSnippet`, never runs `.server()`); `applyServerContributions(builders, {app, cwd, configFor, sse}): {tools: ExtensionServerTool[]; disposers: Array<() => void | Promise<void>>}` (App phase — runs each `.server(makeServerApi(...))`, binds each tool's `execute` to close over that extension's returned `context`, dedups tools by name, collects disposers). `loadServerExtensions(root): Promise<ExtensionBuilder[]>` replaces `loadServerContributions`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/extension/test/apply-server.test.ts
import {expect, test} from 'vitest'
import {H3} from 'h3'
import {z} from 'zod'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'
import {applyServerContributions, collectSystemPrompts} from '../src/apply-server.js'

test('applyServerContributions binds tool execute to the extension context', async () => {
  const tool = defineTool<z.ZodObject<{n: z.ZodNumber}>, {factor: number}>({
    name: 'mul',
    description: 'd',
    inputSchema: z.object({n: z.number()}),
  }).server((i, c) => i.n * c.factor)
  const ext = defineExtension({name: 'm', tools: [tool]}).server(() => ({context: {factor: 10}}))
  const {tools} = applyServerContributions([ext], {app: new H3(), cwd: '/tmp', configFor: () => ({}), sse: () => {}})
  const mul = tools.find((t) => t.name === 'mul')
  expect(await mul?.execute({n: 4}, undefined)).toBe(40)
})

test('collectSystemPrompts reads declarative prompt without running .server()', () => {
  let ran = false
  const ext = defineExtension({name: 'p', systemPrompt: 'hello'}).server(() => {
    ran = true
    return {context: {}}
  })
  expect(collectSystemPrompts([ext])).toContain('hello')
  expect(ran).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @mandarax/extension exec vitest run test/apply-server.test.ts` → FAIL.

- [ ] **Step 3: Implement** `apply-server.ts` (the `execute` the MCP layer calls passes the per-extension context, so the bound tool ignores the 2nd arg the MCP layer would pass and uses the closed-over context). Update `extensions.ts` `loadServerExtensions` to return builders. Update `index.ts` exports (replace the `collectServerContributions` export). **Consumers to update (review-confirmed): `plugin/src/core/extensions.ts:6,47,56`, `plugin/src/core/boot.ts:23`, `plugin/src/core/vite.ts:21,113,190`, `core/src/engine.ts` — all currently consume the pre-drained `ExtensionServerContributions`.**

- [ ] **Step 4: Run** — `pnpm --filter @mandarax/extension exec vitest run` → PASS.

- [ ] **Step 5: Commit** — `"feat(extension): two-phase server lifecycle — collectSystemPrompts + applyServerContributions"`.

---

### Task 6: Wire two-phase lifecycle + context-passing MCP into core

> **Review note + decided architecture (the plugin owns the built-in ARRAY):** there is no seam to register a built-in extension. The plugin is the only layer wired to BOTH channels, so it owns a `builtinExtensions: ExtensionBuilder[]` array (our in-house defaults — test-runner is the first of several; empty until Task 16). User extensions keep loading **dynamically** exactly as today: the server file-glob (`loadServerExtensions(root)`) and the client `__MANDARAX__` queue. The two channels:
>
> - **Server:** `boot.ts:23` / `vite.ts:190` → `start({extensions: [...builtinExtensions, ...await loadServerExtensions(root)]})`.
> - **Client:** the built-ins are emitted into the generated `extensionsModuleSource()` (each `import {ext} from '@mandarax/extension-<name>/client'; (g.queue ??= []).push(ext)`), so they ride the SAME `__MANDARAX__.queue` the widget already drains. The widget seed stays `installExtensionGlobal([])` — built-ins are NOT a widget-bundled seed (correction to an earlier draft). Core and widget stay extension-blind; only the plugin gains the dependency.

**Files:**

- Modify: `packages/core/src/engine.ts` (accept `extensions: ExtensionBuilder[]`; Prompt phase via `collectSystemPrompts`; collect disposers into `stop`), `app.ts` (App phase: build `sse` wrapper over `sseStream`, call `applyServerContributions`, pass resulting tools to `registerMcpRoutes`), `api/mcp/mcp.ts` (call `tool.execute(args, undefined)` — context is already closed over).
- Modify: `packages/plugin/src/core/boot.ts:23` and `packages/plugin/src/core/vite.ts:190` — merge `[...builtinExtensions, ...await loadServerExtensions(root)]` into `start()`; introduce the `builtinExtensions: ExtensionBuilder[]` constant (empty now).
- Modify: `packages/plugin/src/core/extensions.ts` `extensionsModuleSource()` — emit a client `import`+`queue.push` per built-in (empty now; Task 16 adds test-runner). A `MandaraxConfig.extensions?: false | string[]` opt-out can narrow the default set (default: all built-ins on).
- Modify: `packages/plugin/src/core/vite.ts:113` — `extensions` param type changes from `ExtensionServerContributions` to `ExtensionBuilder[]`.
- Test: `packages/core/test/api/extension-server.it.test.ts` (create — real app + MCP + a route + dispose).

**Interfaces:**

- Consumes: `applyServerContributions`, `collectSystemPrompts`, `makeServerRoute`, `loadServerExtensions`.
- Produces: `StartOpts.extensions: ExtensionBuilder[]`; `MakeAppOpts.extensions: ExtensionBuilder[]`; engine `stop` awaits disposers; a `builtinExtensions: ExtensionBuilder[]` array in the plugin (the server built-in seam).

- [ ] **Step 1: Write the failing IT** — load a fixture extension that registers `/api/ext/sample/ping` and a tool; assert the route responds, the tool executes over `/api/mcp` against injected context, and `engine.stop` calls the extension's `dispose`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the wiring. In `app.ts`, build `const sse = (app, path, open) => sseStream(...)` and pass to `makeServerRoute`. Replace `extensionTools: opts.extensions?.tools ?? []` with the result of `applyServerContributions`. In `engine.ts` Prompt phase: `const systemPrompt = [cfg.systemPrompt, ...collectSystemPrompts(opts.extensions ?? [])].filter(Boolean).join('\n\n')`. Collect disposers from `makeApp` (return them on the app handle or via an out param) and await in `stop`.

- [ ] **Step 4: Run** → `pnpm turbo build --filter=@mandarax/core && pnpm --filter @mandarax/core exec vitest run test/api/extension-server.it.test.ts` → PASS.

- [ ] **Step 5: Commit** — `"feat(core): two-phase extension server lifecycle + context-passing MCP + dispose on stop"`.

---

### Task 7: `nowTitle` self-describes; remove the `mandarax_test` switch case path

**Files:**

- Modify: `packages/tool-ui/src/now-title.ts` (signature takes the matched tool entry), `packages/widget/src/chat-panel.tsx` (`activeCallTitle` passes the tools array / matched entry).
- Test: `packages/tool-ui/src/now-title.test.ts` (create or extend).

- [ ] **Step 1:** failing test — `nowTitle(part, tools)` returns the matched tool's `nowTitle` before falling back to the built-in switch.
- [ ] **Steps 2–5:** implement `nowTitle(part: ToolCallPart, tools: ToolCardEntry[]): string`; thread `tools` from `chat-panel.tsx`; the built-in switch stays for non-extension tools; verify; commit `"feat(tool-ui): nowTitle reads matched tool entry, falls back to built-in switch"`.

---

### Task 8: Tool cards render under their owning extension's `ExtensionRuntimeContext.Provider`

> **Review note (current code + a subtlety the spec glossed):** `extension-slots.tsx:22` already wraps `<Component/>` slot mounts in `ExtensionRuntimeContext.Provider value={{...bag, ...instance.clientValue, currentSlot}}`. But tool cards are NOT rendered there — they go through `tools()` (`mount.tsx:78` → `collectToolRenderers` → by-name dispatch in the chat thread), which has no Provider. A card's `useContext((c) => c.subscribeTests)` therefore throws today. **Do not wrap the whole tool-card thread in one Provider** — multiple extensions can each contribute a card with its own `clientValue`, and a single merged bag would collide on flat keys (the value merge is per-extension by design). Instead, each card must render under _its owning extension's_ Provider.

**Files:**

- Modify: `packages/widget/src/extension-slots.tsx` — export a small `ToolCardContext` wrapper, or extend `ExtensionSurface`, that renders a given card under `ExtensionRuntimeContext.Provider value={{...bag, ...instance.clientValue, currentSlot: 'widget'}}` for the instance that owns the tool name.
- Modify: `packages/widget/src/mount.tsx` / `chat-panel.tsx` — the tool-card dispatch must know which extension instance owns each tool name. Build an ownership map (tool name → `ExtensionInstance`) from `props.extensions()` (each builder's `tools[].name`); when the thread renders a card whose name is in the map, wrap that one card in the owning instance's Provider; built-in cards (not in the map) render as today.
- Test: covered by the Task 9 browser IT (a card reads `useContext` and resolves; two extensions' cards do not see each other's `clientValue`).

**Sub-tasks (split — this is novel, cross-file, on the streaming render path):**

- **8a — ownership map + wrapper.** In `extension-slots.tsx`, export `ExtensionToolCard(props: {instance: ExtensionInstance; bag: ExtensionHostBag; children})` that renders `children` under `ExtensionRuntimeContext.Provider value={{...bag, ...instance.clientValue, currentSlot: 'widget'}}`. In `chat-panel.tsx`, build `ownerByToolName = new Map<string, ExtensionInstance>()` from `extensionInstances()` (each `instance.extension.tools?.map((t) => t.name)`). Commit.
- **8b — thread it through dispatch.** Where the chat thread renders a tool card by name, look up `ownerByToolName.get(part.name)`; if present, wrap that one card in `<ExtensionToolCard instance={owner} bag={hostBag}>`; built-in cards (not in the map) render unchanged. Commit.

- [ ] **Step 1:** failing browser IT — a fixture extension's card reads `useContext((c) => c.subscribeX)` and renders the streamed value; without the Provider it errors. A second fixture extension's card must NOT see the first's `clientValue`.
- [ ] **Steps 2–4:** implement 8a then 8b; verify.
- [ ] **Step 5: Commit** — `"feat(widget): tool cards render under their owning extension's runtime context"`.

---

### Task 9: Fixture browser IT — slots + context + single SSE per panel

**Files:**

- Modify: `packages/widget/test/fixtures/sample-extension.tsx` — add a `.client(client => …)` opening one EventSource to a fixture SSE route + a tool card reading `useContext((c) => c.subscribeX)`.
- Test: `packages/widget/test/extension.browser.test.tsx` (extend).

- [ ] **Step 1:** failing browser IT — render the card + a status-slot Component in one panel; assert (via the real server counting connections) exactly one EventSource opens; assert `useContext` selector narrows; HMR dispose closes the source.
- [ ] **Steps 2–5:** make it pass against the Task 4/8 wiring; commit `"test(widget): browser IT proves single SSE per panel + useContext narrowing"`.

**Slice 1–2 gate:** `pnpm turbo build typecheck lint --filter=@mandarax/extension --filter=@mandarax/core --filter=@mandarax/widget --filter=@mandarax/tool-ui` green; the fixture ITs pass. No test-runner file touched yet.

---

## SLICE 3 — Type relocation (break the protocol→runner cycle)

### Task 10: Node-free `events` entrypoint in `@mandarax/test-runner`

**Files:**

- Create: `packages/test-runner/src/events.ts` — move the FULL runner-domain type/schema closure verbatim from `protocol/src/test-types.ts` (excluding `EditorOpenSchema`): `TestState`, `TestError`(+`TestErrorSchema`), `Summary`(+`SummarySchema`), `FileState`(+`FileStateSchema`), `TestRow`(+`TestRowSchema`), `TestRunResult`(+`TestRunResultSchema`), `TestEvent`(+`TestEventSchema`), plus the `parseFailure` helper and `TestCaseLike` type. **Review-confirmed:** `@mandarax/test-runner` already imports `FileState`/`TestRow`/`parseFailure`/`TestCaseLike` (`driver.ts:5`, `playwright/report.ts:2`, `playwright/run-child.ts:5`, `vitest/run-child.ts:7,62`), and the schemas reference each other — a 7-symbol subset would break the runner build.
- Modify: `packages/test-runner/package.json` — add `"./events"` export (types + import), ensure `events.ts` imports nothing node.
- Modify: `packages/test-runner/tsdown.config.ts` — add `src/events.ts` entry.
- Test: `packages/test-runner/test/events.test.ts` (create) — `TestEventSchema.safeParse` round-trips; assert the built `dist/events.js` has no `node:` import (read the file, assert no `require('node:`/`from 'node:`).

- [ ] **Steps 1–5:** TDD the schema round-trip + the node-free assertion; commit `"feat(test-runner): node-free events entrypoint (TestEvent/TestRunResult schemas)"`.

### Task 11: Move runner manager/adapter types + `isRunnerUnavailable` into `@mandarax/test-runner`

**Files:**

- Modify: `packages/test-runner/src/registry.ts`/`driver.ts` — absorb `TestRunnerManager`, `TestRunnerAdapter`, `RunArgs`, `ListResult`, `UiServerInfo`, `defineRunner`, `isRunnerUnavailable`, `runnerUnavailableError`, `RunnerUnavailableError` from `protocol/src/runner-types.ts`; re-point internal imports.
- Test: `packages/test-runner/test/runner-unavailable.test.ts` (move `protocol/test/define-runner.test.ts`).

- [ ] **Steps 1–5:** move + re-point; build; commit `"feat(test-runner): own the runner-domain types (manager/adapter/unavailable)"`.

### Task 12: Carve `EditorOpenSchema` into `protocol/editor-types.ts`; re-point consumers

**Files:**

- Create: `packages/protocol/src/editor-types.ts` (`EditorOpenSchema`, `EditorOpen`).
- Modify: `packages/protocol/{tsdown.config.ts,package.json}` — add `editor-types`, remove `test-types`/`runner-types` subpaths.
- Modify: `packages/core/src/api/editor/editor.ts:2`, `packages/widget/src/chat-panel.tsx:28` — import from `@mandarax/protocol/editor-types`.
- Modify: `packages/core/src/api/errors.ts` — import `isRunnerUnavailable` from `@mandarax/test-runner` **temporarily** (removed in Task 16 when the 422 mapping moves to the extension); OR drop the import now and re-add mapping in the extension (preferred — do it now to keep core clean).
- Test: `packages/core/test/api/editor/*` stays green.

- [ ] **Steps 1–5:** carve + re-point; `pnpm turbo build --filter=@mandarax/protocol --filter=@mandarax/core --filter=@mandarax/widget`; commit `"refactor(protocol): editor-types split out; runner types leave protocol"`.

### Task 13: Settle package naming

**Files:**

- Confirm `@mandarax/extension` (singular) is the contract; document `@mandarax/extension-<name>` convention in the extension package README.

- [ ] **Step 1:** add a one-paragraph README note; commit `"docs(extension): built-in extensions use @mandarax/extension-<name>"`.

**Slice 3 gate:** `pnpm turbo build typecheck --filter=@mandarax/protocol --filter=@mandarax/test-runner --filter=@mandarax/core --filter=@mandarax/widget` green; protocol exposes no runner-domain subpath.

---

## SLICE 4 — Extension package + atomic move/delete

### Task 14: Scaffold `@mandarax/extension-test-runner` with browser/node split build

> **Decided architecture — pre-split by FILE LAYOUT, no strip, no plugin dependency.** The `stripServerHalf` transform is for USER extensions (single authoring file, auto-split by the dev plugin at serve time). Our own built-in package is laid out as we choose, so we ship it pre-split as **two source files** + conditional `exports` — no AST strip, no babel-at-build, no dependency on the dev-only `@mandarax/plugin`. The strip stays in the plugin, for user extensions only. `@mandarax/test-runner` gets NO `browser` condition; its node-free `/events` subpath is the ONLY client-safe entry, and the Build IT is the authoritative gate against node code reaching the browser.

**File layout (the pre-split):**

- `src/test-tool.ts` — SHARED, client-safe: `defineTool<typeof TestInput, {runner: TestRunnerManager}>({...}).render(TestCard)` (schema + card only; NO `.server()` here). Imports the card + `/events` schemas; no node.
- `src/extension.client.ts` → the `./client` (browser) export: `defineExtension(meta).client((client) => …)` using `test-tool`. No node imports, no `.server()`.
- `src/extension.server.ts` → the `.` (node/default) export: `import {extension} from './extension.client.js'` then attach the server half — `.server((server) => { getRunner(...).create(...); routes; return {context:{runner}, dispose} })` and bind the tool's execute (`testTool.server((input, ctx) => ctx.runner[…])`). The client bundle never imports this file, so `getRunner`/h3/node never reach the browser.

**Files:**

- Create: `packages/extension-test-runner/package.json` (deps: `@mandarax/extension`, `@mandarax/test-runner`, `@mandarax/ui-kit-system`, `@mandarax/api-client`, `zod`, `solid-js`, `lucide-solid`; devDeps: `tsdown` — NO `@mandarax/plugin`, NO strip util; `exports`: `.` → `node`/`default` `dist/extension.server.js`; `./client` → `dist/extension.client.js`), `tsconfig.json`, `tsdown.config.ts` (two entries, one per source file — plain compile, no transform).
- Create: `packages/extension-test-runner/src/parse-json.ts` (3-line safe JSON parse).
- Test: `packages/extension-test-runner/test/build.it.test.ts` (create) — build the package, assert `dist/extension.client.js` contains no `@mandarax/test-runner` (main, not `/events`), no `h3`, no `node:`; assert `dist/extension.server.js` does reference `@mandarax/test-runner`.

- [ ] **Steps 1–5:** scaffold the two-entry package; author `test-tool.ts` (shared) + the two entries; make the build IT pass (client chunk node-free); commit `"feat(extension-test-runner): two-file pre-split package + build IT"`.

### Task 15: Implement the extension (tool + routes + config + client SSE) and move the card

**Files:**

- Create: `src/test-tool.ts` (`defineTool<typeof TestInput, {runner: TestRunnerManager}>(...).server((input, ctx) => ctx.runner[…]).render(TestCard)`, `nowTitle: 'Running tests'`).
- Create: `src/test-card.tsx` (move `tool-ui/src/cards/test.tsx` verbatim; rewire `props.ctx.subscribeTestRunner` → `useContext((c) => c.subscribeTests)`, keep `openEditor`/`sendMessage` via `useContext`; carry `parse-json`, import `resultText` from `@mandarax/tool-ui`).
- Create: `src/test-card.stories.tsx` (move from tool-ui).
- Create: `src/extension.ts` — `defineExtension({name:'test-runner', configSchema, tools:[testTool], systemPrompt})` `.server((server) => { const runner = getRunner(server.config.runner).create(server.cwd); register /stream(sse) /list /status /ui /run /stop with RunArgsSchema/ListQuerySchema + the 422 mapping for runner-unavailable; return {context:{runner}, dispose:()=>runner.stop()} })` `.client((client) => { open EventSource(/api/ext/test-runner/stream); return {value:{subscribeTests}, dispose} })`.
- Create: `src/cli.ts` — the `mandarax tools test` subcommand re-pointed to `/api/ext/test-runner/*`.
- Test: node IT (config parse, route serves, tool over MCP, dispose), browser IT (live card streams + static render + Fix/Open + run-end teardown), CLI IT.

> **Review fix — split (this is the densest, highest-regression task):**
>
> - **15a — tool + server.** `test-tool.ts` + `extension.ts` `.server()` (runner, config, 6 routes with `RunArgsSchema`/`ListQuerySchema` carried verbatim, 422 mapping, `dispose`). Node IT (config parse, routes serve, tool over MCP against injected runner, dispose calls `runner.stop()`). Commit.
> - **15b — card + client.** Move `test-card.tsx`+`stories` verbatim, rewire `subscribeTestRunner`→`useContext`, keep `openEditor`/`sendMessage` via `useContext`, carry `parse-json`, import `resultText` from `@mandarax/tool-ui`; `extension.ts` `.client()` opens the EventSource. Browser IT (live stream + static render + Fix/Open + run-end teardown calls per-card `unsubscribe()` NOT `source.close()`). Commit.
> - **15c — CLI.** `cli.ts` subcommand → `/api/ext/test-runner/*`. **CLI "not available" (resolves spec Open item 1):** the command ships WITH the extension; a clean-core install simply has no `tools test` command (unknown-command, acceptable) — the CLI IT asserts the command works when the extension is loaded, and is absent (not a 404 stack) when it is not. Commit.

- [ ] **Steps:** TDD 15a → 15b → 15c as above; each ends green.

### Task 16: Register the built-in + delete all core/widget/protocol/tools/tool-ui/cli copies (atomic)

**Files:**

- Modify (register in BOTH channels via the plugin — Task 6 set them up): add `testRunnerExtension` to the **server** `builtinExtensions` array (`plugin/src/core` — merged into `start()`) AND emit its client import into `extensionsModuleSource()` (`import {testRunnerExtension} from '@mandarax/extension-test-runner/client'; g.queue.push(testRunnerExtension)`) so the widget receives it via `__MANDARAX__.queue`. The widget seed stays `[]`. Add `@mandarax/extension-test-runner` as a `@mandarax/plugin` dependency.
- Delete (per spec list): `core/src/api/test-runner/`, `app.ts` runner wiring + `ctx.test`, `core/package.json` dep, `errors.ts` 422 import, `config.ts`/`config-types.ts` `testRunner`, `protocol/src/test-types.ts`+`runner-types.ts` (residual after Task 12), `tool-view-types.ts` `subscribeTestRunner` + `chat-panel.tsx` wiring, `tools/src/test.ts`+`server.ts`/`defs.ts`/`tools.ts`/`types.ts:12`, `tool-ui/src/cards/test.tsx`+`test.stories.tsx`+`index.tsx` entries+`now-title.ts:64`, `widget/src/test-card.tsx`+`mount.tsx` test seam, `harness/src/claude/system-prompt.ts` `mandarax_test` line, `cli/src/test.ts`+`tools.ts` registration. Test files to rewrite/move (review-confirmed full list): `core/test/api/test-runner/*`, `core/test/helpers/server.ts:68` (`testRunner:'vitest'`), `core/test/config.test.ts`, **`core/test/api/mcp/mcp.it.test.ts`** (review-added — references `mandarax_test`), `core/test/api/chat/chat.it.test.ts`, `tools/test/test-tool.it.test.ts`, `widget/test/widget.it.test.ts` (the `__MANDARAX_RENDER_TEST_CARD__` driver), `cli/test/cli.it.test.ts:77`. (`protocol/test/define-runner.test.ts` is moved in Task 11, not here.)

> **Precondition (review):** Task 16 must not start until Task 15b's browser IT is green (the card renders + streams from the extension). Registration + the whole deletion list land as ONE commit so the live card never vanishes.

- Test: **clean-core regression** — `packages/core/test/clean-core.it.test.ts` (create): boot with `extensions: []`; assert no `/api/ext/test-runner/*` route, no `testRunner` config read, non-loopback Origin 403 on an extension route; a repo grep test asserts no `mandarax_test`/`subscribeTestRunner`/`TestRunnerManager` symbol in the seven packages.

- [ ] **Step 1:** write the clean-core regression IT + grep test (FAIL — symbols still present).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** register built-in, execute the full deletion list in one change, rewrite/move the affected tests.
- [ ] **Step 4:** `pnpm turbo build typecheck lint test --filter=...` across all seven packages + the extension → PASS; clean-core + grep green.
- [ ] **Step 5: Commit** — `"feat: test-runner is a standalone extension; remove all test-runner code from core/widget/etc"`.

**Slice 4 gate:** full `pnpm turbo build typecheck lint --filter=...[all]` green; clean-core regression + grep test pass; the live card renders in the running app (verify via the `run` skill).

---

## SLICE 5 — Authoring surface

### Task 17: Update catalog templates, validate, scaffold, SKILL

**Files:**

- Modify: `packages/extensions/src/catalog.ts` — templates emit the new shape (`configSchema`, `.server((input, ctx))`, `nowTitle`, `server.route`/`sse`); `validateSource` checks the new tokens.
- Modify: `packages/harness/plugins/claude/skills/mandarax-extensions/SKILL.md` — rewrite examples to the new contract.
- Test: `packages/extensions/test/catalog.test.ts` — scaffolded source validates and (type-)compiles against the new contract; the agent-tool IT asserts the new surface.

- [ ] **Steps 1–5:** TDD; commit `"docs(extensions): catalog/scaffold/SKILL reflect config + tool-context + routes"`.

---

## Self-Review

**Spec coverage:** Gap 1 → Task 2; Gap 2 → Tasks 3,5,6,15; Gap 3 → Tasks 1,5,6,15; Gap 4 → Tasks 4,8,9,15. Boot lifecycle correction → Tasks 5,6. Built-in server-extension seam (review-found gap; absent today) → Task 6, filled in Task 16. Type relocation/cycle → Tasks 10–12. EditorOpenSchema carve-out → Task 12. CLI → Tasks 15,16. Security (namespace/CORS/no-raw-handle) → Tasks 3,6,16. Strip/node-free → Tasks 10,14. Pre-split build → Task 14. Dispose (client leak at chat-panel.tsx:746 + server) → Tasks 4,5,6,15. Atomic move+delete → Task 16. nowTitle → Task 7. Authoring → Task 17. Naming → Task 13.

**Round-2 review adjustments (2 plan-review agents):** added Slice 0 / Task 0 (consume the singular `@mandarax/extension` everywhere — core/plugin imported the legacy plural `@mandarax/extensions`, a build blocker once `execute` changes); made the injected-context arg OPTIONAL so every task's typecheck stays green until Task 6; merged Tasks 5+6 (mutually dependent, no independent green gate); named the `UnionToIntersection` idiom in Task 2 (a bare union is the wrong, too-weak constraint); fixed Task 3's code block (`new URL(server.url ?? '').origin`, defined `SseRegister`, `sse` required — no `defaultSse`); expanded Task 10's type-move list to the full closure (`FileState`/`TestRow`/`parseFailure`/`TestCaseLike`); Task 14 ships the built-in pre-split by FILE LAYOUT (two source files + conditional exports, no strip, no dependency on the dev-only `@mandarax/plugin`) — addressing the "plugin never in production" constraint — with `@mandarax/test-runner` getting no `browser` condition (`/events` is the sole client entry); split Tasks 8 (8a/8b) and 15 (15a/b/c); Task 16 adds `core/test/api/mcp/mcp.it.test.ts` to the deletion list and a precondition that Task 15b is green first. Type-soundness blocker from round 1 re-confirmed SOUND.

**Review-driven adjustments (against the landed slice-1–3 code):** Task 4 integrates with the existing `extensionInstances` memo + `extension-slots.tsx` Provider (no invented `runApplyClient`) and fixes the dropped-`dispose` leak; Task 8 wraps each tool card under its _owning_ extension's Provider (per-extension, not a colliding global merge); Tasks 5/6 update the real consumers (`plugin/extensions.ts`, `boot.ts`, `vite.ts`, `engine.ts`) and add the plugin-owned `builtinExtensions: ExtensionBuilder[]` array (in-house defaults) merged with dynamically-loaded user extensions; Task 16 registers test-runner in the server `builtinExtensions` array AND emits its client import into `extensionsModuleSource()` so it rides the `__MANDARAX__.queue` (widget seed stays `[]`).

**Placeholder scan:** Tasks 4, 7, 8, 9, 15 compress per-step code where the implementation is a verbatim move or a direct consequence of an interface defined in a neighboring task; each names exact files, the exact interface, and the exact test obligation. Tasks 1–3, 5, 6, 10, 14, 16 carry full code/tests for the novel, high-risk surface. No "TBD"/"handle edge cases".

**Type consistency:** `serverExecute(input, context)` (Task 1) matches `applyServerContributions` binding (Task 5) and `mcp.ts` call (Task 6). `ServerApi.config/cwd/route`, `ServerResult.context/dispose`, `ClientApi.apiBase/client/requestMeta` consistent across Tasks 2,3,4,5,6,15. `makeServerRoute(app, name, sse)` (Task 3) matches the `sse` wrapper built in Task 6. `nowTitle(part, tools)` (Task 7) matches the field set in Task 1.
