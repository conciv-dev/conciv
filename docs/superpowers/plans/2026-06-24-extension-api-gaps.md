# Extension API Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the generic `@conciv/extension` contract so an extension can own namespaced HTTP routes + cleanup, inject typed context into its tools, receive a client argument, and declare typed config — proven against one throwaway fixture, no test-runner code touched.

**Architecture:** Each runtime gap is "a factory that gets no argument today gets one." Add the argument at each internal call site (`__server`/`__execute`/`__client`), build what those args contain (only `route` is new), and move `.server()` from boot into `makeApp` (where `app`+`cwd` exist) — replacing `collectServerContributions` with two inline projections. Typed config is an open module-augmentation registry. h3 stays out of `@conciv/extension` (route types there, route runtime in core).

**Tech Stack:** SolidJS, zod v4, h3 + srvx (server), TanStack AI tool defs, jiti (server-half load), tsdown (package build), vitest (unit/node IT), Playwright (browser IT), turborepo, oxlint/oxfmt.

## Global Constraints

- **Dev-only forever.** conciv never appears in a consumer's prod bundle. No artifact introduced here may be reachable by a consumer build; all delivery rides the dev-only plugin serve path.
- **No test-runner file touched.** This pass is the generic API only, proven by a fixture.
- **Code style (HARD):** zero narration comments (one concise line max, matching neighbors), no `any`/casts, no IIFE, no `else`, functions not classes, map/reduce over if/else, names spelled out fully. Prefer generics over type-only deps.
- **No mocks/stubs/jsdom.** Real `h3`/`srvx` servers, real MCP client, real browser (Playwright `browser.newPage()`).
- **Build/typecheck/test via turbo:** `pnpm turbo <tasks> --filter=<pkg>`. Widget/core ITs need `@conciv/core` (and the extension) built first.
- **v0, break freely** — no back-compat shims; update every call site in the same change.
- **Run every command from the worktree** `/Users/dev/Public/web/aidx/.claude/worktrees/extension-api-rewrite`. Never `cd` to the main repo root.
- The oxfmt pre-commit hook reflows files and aborts the first commit — re-add and commit again.

---

## File Structure

**`@conciv/extension` (the contract):**

- Modify `packages/extension/src/define-tool.ts` — `defineTool<Schema, Ctx>`; `__execute(raw, ctx)`.
- Modify `packages/extension/src/define-extension.ts` — generic `<Name, Schema>`; `parseConfig`; `.server((server) => ({context, dispose?}))`; `.client((client) => ({value, dispose?}))`; drop the `as unknown as` cast; fix `useContext` return type; 5-arg builder.
- Modify `packages/extension/src/types.ts` — `ServerApi`/`ServerResult`/`ClientApi`/`RegisterExtension` (type-only `H3`); `ExtensionTool.__execute(input, ctx?)`; builder field types.
- Delete `packages/extension/src/collect-server.ts` + its `index.ts` export (replaced by two-phase wiring in core).
- Modify `packages/extension/src/index.ts` — export the new types; drop `collectServerContributions`.

**`@conciv/protocol`:**

- Modify `packages/protocol/src/config-types.ts` — `ExtensionConfigRegistry` interface + `ConcivConfig.extensions`.

**`@conciv/core`:**

- Create `packages/core/src/api/ws.ts` — `attachWebSocket(server, app, originAllowed)` (Task 3a).
- Create `packages/core/src/extension-app.ts` — `makeExtensionApp(parent, name, originAllowed)` + `slug` (Task 3b).
- Modify `packages/core/src/app.ts` — `MakeAppOpts.extensions: ExtensionBuilder[]` + `extensionConfig`; run the App-phase `.map` (each factory registers its own routes on `server.app`); return disposers.
- Modify `packages/core/src/engine.ts` — call `attachWebSocket` after `serve(...)`.
- Modify `packages/core/src/engine.ts` — accept `extensions: ExtensionBuilder[]`; Prompt-phase projection; await disposers in `stop`.
- Modify `packages/core/src/api/mcp/mcp.ts` — call `execute(args)` (context closed over).
- Modify `packages/core/src/config.ts` — `ResolvedConcivConfig.extensions` passthrough.

**`@conciv/plugin`:**

- Modify `packages/plugin/src/core/extensions.ts` — `loadServerExtensions(root): Promise<ExtensionBuilder[]>` (replaces `loadServerContributions`).
- Modify `packages/plugin/src/core/boot.ts` + `vite.ts` — pass builders into `start`; `bootEngine` signature.

**`@conciv/widget` (Gap C):**

- Modify `packages/widget/src/chat-panel.tsx` — pass `ClientApi` into `__client(...)`; capture + dispose the returned `dispose`.
- Modify `packages/widget/src/extension-slots.tsx` — instance carries `dispose`.

**Fixtures + tests:**

- Create `packages/core/test/fixtures/sample-server-extension.ts` — fixture exercising config + route + sse + tool ctx + dispose.
- Create `packages/core/test/api/extension-route.it.test.ts`, `packages/core/test/api/extension-server.it.test.ts`.
- Extend `packages/widget/test/fixtures/sample-extension.tsx` + a widget browser IT.
- Create `packages/extension/test/config-registry.test-d.ts`.

---

## Task 1: `defineTool<Schema, Ctx>` — context-carrying tool

**Files:**

- Modify: `packages/extension/src/define-tool.ts`, `packages/extension/src/types.ts`
- Test: `packages/extension/test/define-tool.test.ts` (create)

**Interfaces:**

- Produces: `defineTool<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown>(def): ToolBuilder<Schema, Ctx>` where `.server(execute: (input: z.infer<Schema>, ctx: Ctx) => unknown | Promise<unknown>)`. `ExtensionTool.__execute?: (input: unknown, ctx?: unknown) => Promise<unknown>` (ctx OPTIONAL so the current one-arg MCP caller stays green until Task 4). A phantom `__ctx?: Ctx` keeps `Ctx` recoverable from a `ToolBuilder`.

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
  }).server((input, ctx) => input.n * ctx.factor)
  expect(await tool.__execute?.({n: 3}, {factor: 2})).toBe(6)
})

test('execute reparses raw input at the boundary', async () => {
  const tool = defineTool({name: 't', description: 'd', inputSchema: z.object({n: z.number()})}).server((i) => i.n)
  await expect(tool.__execute?.({n: 'x'}, undefined)).rejects.toThrow()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/extension exec vitest run test/define-tool.test.ts`
Expected: FAIL — `.server` execute arity (ctx) does not typecheck / `__execute` ignores 2nd arg.

- [ ] **Step 3: Implement**

```ts
// packages/extension/src/define-tool.ts
import type {z} from 'zod'
import type {ExtensionTool, ToolRenderer} from './types.js'

export type ToolBuilder<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown> = ExtensionTool & {
  inputSchema: Schema
  __ctx?: Ctx
  server: (execute: (input: z.infer<Schema>, ctx: Ctx) => Promise<unknown> | unknown) => ToolBuilder<Schema, Ctx>
  render: (renderer: ToolRenderer) => ToolBuilder<Schema, Ctx>
}

export function defineTool<Schema extends z.ZodObject<z.ZodRawShape>, Ctx = unknown>(definition: {
  name: string
  description: string
  inputSchema: Schema
  promptSnippet?: string
  promptGuidelines?: string[]
}): ToolBuilder<Schema, Ctx> {
  const builder: ToolBuilder<Schema, Ctx> = {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    promptSnippet: definition.promptSnippet,
    promptGuidelines: definition.promptGuidelines,
    server(execute) {
      builder.__execute = async (raw, ctx) => execute(definition.inputSchema.parse(raw), ctx as Ctx)
      return builder
    },
    render(renderer) {
      builder.__render = renderer
      return builder
    },
  }
  return builder
}
```

In `types.ts`, change `ExtensionTool.__execute?: (input: unknown) => Promise<unknown>` to `__execute?: (input: unknown, ctx?: unknown) => Promise<unknown>`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @conciv/extension exec vitest run test/define-tool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/define-tool.ts packages/extension/src/types.ts packages/extension/test/define-tool.test.ts
git commit -m "feat(extension): defineTool carries Ctx; __execute takes injected context"
```

---

## Task 2: protocol — `ExtensionConfigRegistry` + `ConcivConfig.extensions`

**Files:**

- Modify: `packages/protocol/src/config-types.ts`
- Test: `packages/protocol/test/config-types.test-d.ts` (create)

**Interfaces:**

- Produces: `interface ExtensionConfigRegistry {}` (augmentable); `ConcivConfig.extensions?: {[Name in keyof ExtensionConfigRegistry]?: ExtensionConfigRegistry[Name]}`.

- [ ] **Step 1: Write the failing type test**

```ts
// packages/protocol/test/config-types.test-d.ts
import {expectTypeOf, test} from 'vitest'
import type {ConcivConfig, ExtensionConfigRegistry} from '../src/config-types.js'

declare module '../src/config-types.js' {
  interface ExtensionConfigRegistry {
    sample: {flag?: boolean}
  }
}

test('extensions field types from the registry', () => {
  expectTypeOf<ConcivConfig['extensions']>().toMatchTypeOf<{sample?: {flag?: boolean}} | undefined>()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/protocol exec vitest --typecheck run test/config-types.test-d.ts`
Expected: FAIL — `extensions` / `ExtensionConfigRegistry` not exported.

- [ ] **Step 3: Implement**

In `packages/protocol/src/config-types.ts`, add above `ConcivConfig`:

```ts
export interface ExtensionConfigRegistry {}
```

and inside `interface ConcivConfig`:

```ts
  extensions?: {[Name in keyof ExtensionConfigRegistry]?: ExtensionConfigRegistry[Name]}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @conciv/protocol exec vitest --typecheck run test/config-types.test-d.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/config-types.ts packages/protocol/test/config-types.test-d.ts
git commit -m "feat(protocol): open ExtensionConfigRegistry + ConcivConfig.extensions"
```

---

## Task 3a: core ws transport — crossws on srvx's node server + upgrade origin guard

> srvx `0.11.16` does not upgrade ws (its node adapter has zero ws code); h3's `defineWebSocketHandler` only attaches a `.crossws` hook bag to a 426 response. So core wires the upgrade itself, ONCE: catch the node `upgrade` event, run crossws, resolve the matched h3 route's ws hooks, and origin-guard the handshake (the `.use` CORS guard never runs on upgrades — the API exposes `eval`/`override`, so an unguarded socket is a hole). After this, every extension's `server.app.get('/ws', defineWebSocketHandler(...))` just works.

**Files:**

- Create: `packages/core/src/api/ws.ts` — `attachWebSocket(server, app, originAllowed)`.
- Modify: `packages/core/src/engine.ts` — call `attachWebSocket` after `serve(...)`.
- Modify: `packages/core/package.json` — declare `crossws` (installed transitively today; the user approved declaring it).
- Test: `packages/core/test/api/ws.it.test.ts` (create — real srvx server + real `ws` client).

**Interfaces:**

- Produces: `attachWebSocket(server: Server, app: H3, originAllowed: (origin: string | null) => boolean): void`. Hangs a `crossws/adapters/node` adapter on `server.node.server`'s `upgrade` event; the adapter's `resolve` runs the h3 app for the request and reads the matched handler's attached `.crossws` hooks; the `upgrade` hook returns `403`-equivalent (refuses the handshake) when `originAllowed(req.headers.origin)` is false.
- Consumes: `originAllowed` (`core/src/api/cors.ts`), srvx `Server.node.server`, h3 route resolution.

- [ ] **Step 1: Write the failing ws IT** — boot a real srvx server with one h3 ws route (`defineWebSocketHandler` echoing messages); open a real `ws` client to `/__ws_probe`; assert echo round-trip; open a second with a non-loopback `Origin` header; assert the handshake is rejected. (Uses the `ws` package — a core devDep; if absent, add it with approval.)

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @conciv/core exec vitest run test/api/ws.it.test.ts` → FAIL (`attachWebSocket` not found; without it the route returns 426, never upgrades).

- [ ] **Step 3: Implement** `attachWebSocket` per the interface (crossws node adapter, resolve via the h3 app, origin-guarded `upgrade`); declare `crossws` in `package.json`; call it in `engine.ts` right after `serve(...)`, passing `(origin) => originAllowed(origin, extraOrigins)`.

- [ ] **Step 4: Run to verify it passes** — `pnpm turbo build --filter=@conciv/core && pnpm --filter @conciv/core exec vitest run test/api/ws.it.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(core): ws transport — crossws on srvx node server, origin-guarded upgrade"`.

---

## Task 3b: `makeExtensionApp` (core, guarded sub-H3) + api types (extension)

> Extensions get a real, full h3 sub-app — every verb, middleware, `defineWebSocketHandler`, event streams — NOT a narrowed verb wrapper. It is a separate `H3` instance, so its `.use()` middleware sees only its own routes (isolation for free); core mounts it at `/api/ext/<slug>` via `withBase` and pre-installs the loopback origin guard on it so a sub-app route can't escape the guard. h3 enters `@conciv/extension` as a TYPE-ONLY import (`import type {H3}`), erased at build — zero runtime in the browser bundle, honoring "h3 out of the contract" at runtime.

**Files:**

- Create: `packages/core/src/extension-app.ts` — `makeExtensionApp(parent, name, originAllowed)` + `slug`.
- Modify: `packages/extension/src/types.ts` (add `ServerApi`/`ServerResult`/`ClientApi`, type-only `H3`), `packages/extension/src/index.ts` (export them), `packages/extension/package.json` (h3 as a type-only devDep).
- Test: `packages/core/test/api/extension-app.it.test.ts` (create — real h3 + srvx; GET + SSE + ws all under `/api/ext/<slug>/`, all origin-guarded).

**Interfaces:**

- Produces (extension types, runtime-h3-free):
  ```ts
  import type {H3} from 'h3'
  export type ServerApi<Config> = {config: Config; cwd: string; app: H3}
  export type ServerResult<Context> = {context: Context; dispose?: () => void | Promise<void>}
  export type ClientApi = {apiBase: string; client: SessionClient; requestMeta: () => RequestMeta}
  ```
- Produces (core runtime): `makeExtensionApp(parent: H3, name: string, originAllowed: (o: string | null) => boolean): H3`. Creates `const sub = new H3()`, pre-installs the same origin/host guard `registerCors` uses, then `parent.use(\`${prefix}/**\`, withBase(prefix, sub.handler))` where `prefix = /api/ext/${slug(name)}`. Returns `sub`. SSE inside a route uses core's existing `sseStream`; ws uses h3's `defineWebSocketHandler` (carried by Task 3a's transport).

- [ ] **Step 1: Write the failing IT** — mount `makeExtensionApp(app, 'Test Runner', () => true)`; register on the returned sub-app a `get('/status', () => ({ok:true}))`, an SSE route via `sseStream`, and a `get('/ws', defineWebSocketHandler(echo))`; serve via srvx; assert GET serves at `/api/ext/test-runner/status`, SSE streams a frame, ws echoes; then assert a non-loopback `Origin` GET is rejected 403.

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @conciv/core exec vitest run test/api/extension-app.it.test.ts` → FAIL (`makeExtensionApp` not found).

- [ ] **Step 3: Implement** `makeExtensionApp` + `slug` (lowercase, non-alphanumeric runs → `-`, trimmed) in `extension-app.ts`; add the `ServerApi`/`ServerResult`/`ClientApi` types (type-only `H3`) to `types.ts`; export from `index.ts`; add h3 as an extension devDep for the type-only import.

- [ ] **Step 4: Run to verify it passes** — `pnpm turbo build --filter=@conciv/extension && pnpm --filter @conciv/core exec vitest run test/api/extension-app.it.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(extension): ServerApi.app is a guarded h3 sub-app mounted at /api/ext/<slug>/"`.

---

## Task 4: `defineExtension` generics + two-phase lifecycle (atomic across extension + core + plugin)

> These change together and do not typecheck independently: re-typing `.server`'s return breaks `collect-server.ts` and its consumers, so `collectServerContributions` is deleted and the two-phase wiring lands in the same task. Sub-steps commit the extension unit tests first, then the core/plugin wiring once the node IT is green.

**Files:**

- Modify: `packages/extension/src/define-extension.ts`, `packages/extension/src/types.ts`, `packages/extension/src/index.ts`
- Delete: `packages/extension/src/collect-server.ts`
- Modify: `packages/core/src/app.ts`, `packages/core/src/engine.ts`, `packages/core/src/api/mcp/mcp.ts`, `packages/core/src/config.ts`
- Modify: `packages/plugin/src/core/extensions.ts`, `packages/plugin/src/core/boot.ts`, `packages/plugin/src/core/vite.ts`
- Create: `packages/core/test/fixtures/sample-server-extension.ts`, `packages/core/test/api/extension-server.it.test.ts`
- Modify: `packages/extension/test/define-extension.test.ts` (create)

**Interfaces:**

- Produces: `defineExtension<Name extends string, Schema extends z.ZodType = z.ZodNever, Tools extends ToolBuilder<z.ZodObject<z.ZodRawShape>, unknown>[] = []>(meta: {name: Name; configSchema?: Schema; tools?: [...Tools]; Component?; systemPrompt?; theme?}): ExtensionBuilder<Name, ConfigOf<Schema>, Tools, {}, {}>`. Builder carries `name: Name`, `configSchema?: Schema`, `parseConfig(raw: unknown): ConfigOf<Schema>`, `__server?: (server: ServerApi<ConfigOf<Schema>>) => ServerResult<ServerContext>`, `__client?: (client: ClientApi) => ClientFactoryResult<ClientValue>`. `.server<C extends RequiredContext<Tools>>(fn): ExtensionBuilder<Name, Config, Tools, C, ClientValue>`; `.client<V extends object>(fn): ExtensionBuilder<Name, Config, Tools, ServerContext, ClientValue & V>`. `ConfigOf<S> = [S] extends [z.ZodNever] ? Record<never, never> : z.output<S>`. `RequiredContext<Tools> = UnionToIntersection<CtxOf<Tools[number]>>`.
- Produces: core `MakeAppOpts.extensions?: ExtensionBuilder[]`, `MakeAppOpts.extensionConfig?: Record<string, unknown>`; `makeApp` returns `{app, disposers}` (or attaches disposers to the engine via `StartOpts`). `engine`'s `StartOpts.extensions?: ExtensionBuilder[]`. Plugin `loadServerExtensions(root): Promise<ExtensionBuilder[]>`.
- Consumes: `ToolBuilder<Schema, Ctx>` (Task 1), `makeExtensionApp` + `originAllowed` (Task 3b), `attachWebSocket` (Task 3a), `sseStream` (`core/src/api/sse.ts`), `ExtensionConfigRegistry` (Task 2).

- [ ] **Step 1: Write the failing extension unit test**

```ts
// packages/extension/test/define-extension.test.ts
import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'

test('parseConfig applies defaults; absent schema yields {}', () => {
  const withSchema = defineExtension({name: 'x', configSchema: z.object({runner: z.string().default('vitest')})})
  expect(withSchema.parseConfig({})).toEqual({runner: 'vitest'})
  expect(defineExtension({name: 'y'}).parseConfig(undefined)).toEqual({})
})

test('server factory receives api and returns context + dispose', () => {
  const tool = defineTool<z.ZodObject<{n: z.ZodNumber}>, {factor: number}>({
    name: 'mul',
    description: 'd',
    inputSchema: z.object({n: z.number()}),
  }).server((i, c) => i.n * c.factor)
  const ext = defineExtension({name: 'm', tools: [tool]}).server((server) => {
    server.app.get('/ping', () => ({ok: true}))
    return {context: {factor: server.config ? 10 : 10}, dispose: () => {}}
  })
  expect(ext.__server).toBeTypeOf('function')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @conciv/extension exec vitest run test/define-extension.test.ts`
Expected: FAIL — `parseConfig` undefined; `.server` factory arg/return shape.

- [ ] **Step 3: Implement the builder**

Re-type `ExtensionBuilder<Name, Config, Tools, ServerContext, ClientValue>` and the literal builder object in `define-extension.ts` — give `client`/`server` precise re-parameterized return types so the `as unknown as` cast at the end is removed. Add `parseConfig(raw) => meta.configSchema ? meta.configSchema.parse(raw ?? {}) : {}`. Change `__server` to be called with a `ServerApi` and to return `ServerResult` (no longer `{tools, systemPrompt}`). Keep `useSlot`/`useContext` reading `useExtensionRuntimeContext()`; fix `useContext`'s return type from the current `ExtensionHostContext | Selected` union to the overload-narrowed result. Add to `types.ts`: `ConfigOf`, `RegisterExtension`, `UnionToIntersection`, `CtxOf`, `RequiredContext`. Export `RegisterExtension` from `index.ts`. Delete `collect-server.ts` and its `index.ts` export.

```ts
// types.ts additions
export type RegisterExtension<E extends {name: string; configSchema?: import('zod').ZodType}> = E extends {
  name: infer Name extends string
  configSchema: infer Schema extends import('zod').ZodType
}
  ? {[Key in Name]: import('zod').input<Schema>}
  : {}
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never
export type CtxOf<Tool> = Tool extends {__ctx?: infer Ctx} ? Ctx : unknown
export type RequiredContext<Tools extends readonly unknown[]> = UnionToIntersection<CtxOf<Tools[number]>>
export type ConfigOf<Schema> = [Schema] extends [import('zod').ZodNever]
  ? Record<never, never>
  : import('zod').output<Schema>
```

- [ ] **Step 4: Run extension unit + typecheck**

Run: `pnpm --filter @conciv/extension exec vitest run && pnpm turbo typecheck --filter=@conciv/extension`
Expected: PASS.

- [ ] **Step 5: Commit the contract change**

```bash
git add packages/extension/src packages/extension/test/define-extension.test.ts
git commit -m "feat(extension): generic defineExtension (name/config/tools), .server returns {context,dispose}, drop cast"
```

- [ ] **Step 6: Write the failing node IT (fixture)**

```ts
// packages/core/test/fixtures/sample-server-extension.ts
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'

const ping = defineTool<z.ZodObject<{n: z.ZodNumber}>, {factor: number}>({
  name: 'sample_mul',
  description: 'multiply by the configured factor',
  inputSchema: z.object({n: z.number()}),
}).server((input, ctx) => ({result: input.n * ctx.factor}))

export const sampleConfig = z.object({factor: z.number().default(3)})

export const sampleServerExtension = defineExtension({
  name: 'sample',
  configSchema: sampleConfig,
  tools: [ping],
}).server((server) => {
  let stopped = false
  server.app.get('/echo', () => ({factor: server.config.factor, cwd: server.cwd}))
  return {
    context: {factor: server.config.factor},
    dispose: () => {
      stopped = true
      void stopped
    },
  }
})
```

```ts
// packages/core/test/api/extension-server.it.test.ts
import {expect, test} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {startTestServer} from '../../helpers/server.js'
import {sampleServerExtension} from '../fixtures/sample-server-extension.js'

test('extension route serves, tool runs against injected ctx, dispose on stop', async () => {
  const {base, close} = await startTestServer({
    extensions: [sampleServerExtension],
    extensionConfig: {sample: {factor: 5}},
  })
  try {
    const echo = await (await fetch(`${base}/api/ext/sample/echo`)).json()
    expect(echo.factor).toBe(5)
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    const tool = (await mcp.tools()).find((t) => t.name === 'sample_mul')
    if (!tool?.execute) throw new Error('sample_mul not registered')
    expect(JSON.stringify(await tool.execute({n: 4}))).toContain('20')
    await mcp.close()
  } finally {
    await close()
  }
}, 30_000)
```

(Extend `packages/core/test/helpers/server.ts` `TestServerOpts` with `extensions?: ExtensionBuilder[]` + `extensionConfig?: Record<string, unknown>`, threaded into `makeApp`.)

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm turbo build --filter=@conciv/extension && pnpm --filter @conciv/core exec vitest run test/api/extension-server.it.test.ts`
Expected: FAIL — `makeApp`/`start` do not accept `extensions` builders.

- [ ] **Step 8: Implement the two-phase wiring**

`config.ts`: add `extensions?: ConcivConfig['extensions']` to `ResolvedConcivConfig` + `resolveConfig` passthrough.

`engine.ts`: `StartOpts.extensions?: ExtensionBuilder[]`; replace the prompt assembly at line 34 with the Prompt-phase projection; pass `extensions` (builders) + `cfg.extensions` into `MakeAppOpts`; capture `disposers` from `makeApp` and `await Promise.all(disposers.map((d) => d()))` in `stop` before `server.close()`.

```ts
const systemPrompt = [
  cfg.systemPrompt,
  ...(opts.extensions ?? []).flatMap((ext) => [...(ext.tools ?? []).map((t) => t.promptSnippet), ext.systemPrompt]),
]
  .filter(Boolean)
  .join('\n\n')
```

`app.ts`: `MakeAppOpts` gains `extensions?: ExtensionBuilder[]` + `extensionConfig?: Record<string, unknown>`; drop `extensionTools`. Build the sse wrapper and the App-phase map; pass `extensionTools` (computed) to `registerMcpRoutes`; return `{app, disposers}` (update `engine.ts`'s `makeApp(appOpts)` call to read both).

```ts
const guard = (origin: string | null) => originAllowed(origin, new Set(opts.allowedOrigins ?? []))
const serverApiFor = (ext) => ({
  config: ext.parseConfig(opts.extensionConfig?.[ext.name]),
  cwd: opts.cwd,
  app: makeExtensionApp(app, ext.name, guard),
})
const seen = new Set<string>()
const mounted = (opts.extensions ?? []).map((ext) => {
  const result = ext.__server?.(serverApiFor(ext))
  const context = result?.context
  const tools = (ext.tools ?? [])
    .filter((t) => t.__execute)
    .map((t) => {
      if (seen.has(t.name)) throw new Error(`extension tool name collision: "${t.name}"`)
      seen.add(t.name)
      return {
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        execute: (input: unknown) => t.__execute(input, context),
      }
    })
  return {tools, dispose: result?.dispose}
})
const extensionTools = mounted.flatMap((m) => m.tools)
const disposers = mounted.map((m) => m.dispose).filter((d): d is () => void | Promise<void> => Boolean(d))
```

`mcp.ts`: keep `tool.execute(args)` (1-arg) — context is closed over.

`plugin/src/core/extensions.ts`: rename `loadServerContributions` → `loadServerExtensions(root): Promise<ExtensionBuilder[]>` returning the discovered builders directly (drop the `collectServerContributions` calls). `boot.ts:23` + `vite.ts:190` call `loadServerExtensions`; pass `extensions: [...builtins(empty for now), ...builders]` to `start`. `vite.ts` `bootEngine` param type → `ExtensionBuilder[]`.

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm turbo build typecheck --filter=@conciv/extension --filter=@conciv/core --filter=@conciv/plugin && pnpm --filter @conciv/core exec vitest run test/api/extension-server.it.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit the wiring**

```bash
git add packages/core/src packages/plugin/src packages/core/test
git commit -m "feat(core): two-phase extension lifecycle — routes/ctx/dispose in makeApp, prompt projection in engine"
```

---

## Task 5: Widget — `.client(ClientApi)` argument + dispose capture (Gap C)

**Files:**

- Modify: `packages/widget/src/chat-panel.tsx`, `packages/widget/src/extension-slots.tsx`
- Modify: `packages/widget/test/fixtures/sample-extension.tsx`
- Test: `packages/widget/test/extension-client.browser.test.tsx` (create)

**Interfaces:**

- Consumes: `ClientApi` (Task 3), the per-panel extension instances memo already in `chat-panel.tsx`.
- Produces: each panel calls `ext.__client?.(clientApi)` once; the returned `dispose` is stored on the instance and run in `onCleanup`.

- [ ] **Step 1: Write the failing browser IT** — a fixture extension whose `.client(api)` opens an `EventSource` to a fixture SSE route and exposes `subscribe` via `value`; assert (counting connections on the real server) exactly one source per panel and that unmount closes it.

```ts
// packages/widget/test/extension-client.browser.test.tsx (sketch — full bodies filled at implementation)
import {expect, test} from 'vitest'
// render the widget with mountWidget([sampleExtension]); drive a run; assert the card reads
// useContext((c) => c.subscribe) and that the server sees exactly one EventSource; unmount → source closes.
```

- [ ] **Step 2: Run to verify it fails** — `pnpm turbo build --filter=@conciv/core --filter=@conciv/extension && pnpm --filter @conciv/widget exec vitest run test/extension-client.browser.test.tsx` → FAIL (factory gets no arg; dispose dropped).

- [ ] **Step 3: Implement** — in `chat-panel.tsx`'s extension-instances memo, build `clientApi = {apiBase, client, requestMeta}` from the panel's existing host bag and call `ext.__client?.(clientApi)`; store `{extension, clientValue, dispose}`; `onCleanup(() => instances.forEach((i) => i.dispose?.()))`. `extension-slots.tsx`: `ExtensionInstance` gains optional `dispose`. Extend `sample-extension.tsx` with the `.client(api)` body.

- [ ] **Step 4: Run to verify it passes** — same command → PASS; `pnpm turbo typecheck --filter=@conciv/widget` green.

- [ ] **Step 5: Commit** — `git commit -m "feat(widget): client factory receives ClientApi; capture + dispose it on unmount"`.

---

## Task 6: Type tests — config autocomplete + ctx intersection

**Files:**

- Create: `packages/extension/test/config-registry.test-d.ts`

- [ ] **Step 1: Write the type test**

```ts
// packages/extension/test/config-registry.test-d.ts
import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool, type RegisterExtension} from '../src/index.js'
import type {ConcivConfig} from '@conciv/protocol/config-types'

const cfgSchema = z.object({runner: z.enum(['vitest', 'jest']).default('vitest')})
const ext = defineExtension({name: 'demo', configSchema: cfgSchema})

declare module '@conciv/protocol/config-types' {
  interface ExtensionConfigRegistry extends RegisterExtension<typeof ext> {}
}

test('config key + value type from the registry', () => {
  expectTypeOf<NonNullable<ConcivConfig['extensions']>['demo']>().toMatchTypeOf<
    {runner?: 'vitest' | 'jest'} | undefined
  >()
})

test('extension context must satisfy the intersection of its tools Ctx', () => {
  const t = defineTool<z.ZodObject<{}>, {factor: number}>({
    name: 't',
    description: 'd',
    inputSchema: z.object({}),
  }).server((_, c) => c.factor)
  // @ts-expect-error — context missing `factor`
  defineExtension({name: 'k', tools: [t]}).server(() => ({context: {}}))
  defineExtension({name: 'k', tools: [t]}).server(() => ({context: {factor: 1}}))
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @conciv/extension exec vitest --typecheck run test/config-registry.test-d.ts` → FAIL until Task 4's generics are present (it passes once they are; if green immediately, confirm the `@ts-expect-error` actually fires by temporarily removing `factor`).

- [ ] **Step 3: (No new impl)** — this task validates Tasks 2+4. If the negative case does not error, fix the `RequiredContext`/`ConfigOf` types in `types.ts` until it does.

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit** — `git commit -m "test(extension): type tests for config registry + tool-context intersection"`.

---

## Final gate

- [ ] `pnpm turbo build typecheck lint test --filter=@conciv/extension --filter=@conciv/protocol --filter=@conciv/core --filter=@conciv/plugin --filter=@conciv/widget` → all green.
- [ ] Fixture node IT + widget browser IT pass; the type tests (config autocomplete, ctx intersection) pass.
- [ ] No test-runner file changed (`git diff --name-only main... | grep -i test-runner` → only this plan / spec, no src).

---

## Self-Review

**Spec coverage:** Gap A (server factory/routes/dispose) → Tasks 3,4. Gap B (tool ctx) → Tasks 1,4. Gap C (client arg + dispose) → Task 5. Gap D (typed config registry) → Tasks 2,4,6. Two-phase lifecycle (replaces `collectServerContributions`) → Task 4. `makeServerRoute` in core, types in extension (h3 out of the contract) → Task 3. No new package, dev-only, no test-runner touched → Global Constraints + Final gate. Builder generics / cast removal → Task 4. Fixture-proven (node + browser + type) → Tasks 4,5,6.

**Placeholder scan:** Task 5's browser IT body is sketched (the widget test-render harness is established in the existing `sample-extension` browser tests; the implementer mirrors it) — every other step carries full code. No "TBD"/"handle edge cases".

**Type consistency:** `__execute(input, ctx?)` (Task 1) ↔ App-phase binding `t.__execute(input, context)` (Task 4) ↔ `mcp.ts` `execute(args)` (Task 4). `ServerApi.{config,cwd,route}` / `ServerResult.{context,dispose}` / `ClientApi.{apiBase,client,requestMeta}` (Task 3) consistent across Tasks 4,5. `makeServerRoute(app, name, sse)` (Task 3) matches the `sse` wrapper built in Task 4. `RegisterExtension` (Task 4 types) matches its use in Tasks 5/6 and the spec.
