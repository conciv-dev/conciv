# Extension API Gaps — Config, Server Routes, Tool Context, Client Context

Date: 2026-06-24
Status: Approved (design)
Supersedes the API-gap portions of `2026-06-23-test-runner-extension-and-api-gaps-design.md` and its plan (both ON HOLD), now rebased onto the landed split (`2026-06-23-extension-split-design.md`).

## Goal

Grow the generic `@mandarax/extension` contract by the four abilities a real, full-featured extension needs but cannot express today: typed per-extension config, a server factory that owns namespaced HTTP routes and a cleanup, injected context into tool `execute`, and an argument into the client factory. Prove all four end to end against one throwaway fixture extension.

**In scope:** the generic API only. No test-runner file is touched.

**Deferred to the migration spec:** moving the test-runner into `@mandarax/extension-test-runner`, relocating runner-domain types out of `@mandarax/protocol` (the cycle break only earns its keep once the extension imports them), and deleting test-runner code from core/widget. Slice 0 (consolidate onto the singular `@mandarax/extension`) and the catalog rewrite already landed.

## Current state (verified against shipped source)

```ts
// define-extension.ts — no configSchema; both factories take NO argument
defineExtension({name, Component?, systemPrompt?, theme?, tools?})
  .client(() => ({value, dispose?}))
  .server(() => ({tools?, systemPrompt?}))

// define-tool.ts — execute takes ONE argument
defineTool({name, description, inputSchema}).server((input) => ...)
```

`collect-server.ts` runs each `.server()` at boot via `collectServerContributions(builders)`, returning a flat `{tools, systemPrompt}`. The engine assembles the prompt at `engine.ts:34` and passes `extensionTools` into `makeApp`. At that boot moment the h3 `app` and `cwd` do not exist yet, so a `.server()` factory cannot be handed a route handle or share a stateful object with a per-request tool handler.

Consequence: an extension today cannot declare typed config, register an HTTP route, run an SSE stream, read `cwd`, return a `dispose`, or inject a value into its tool's `execute`. Those are the four gaps.

## The mechanism (one idea, applied four times)

Each gap is "a factory that gets no argument today gets one." Closing them is three changes:

1. **Pass the missing argument** at each internal call site (`__execute`, `__server`, `__client`).
2. **Build what those arguments contain.** Only `route` is new (a small `makeServerRoute`); `config` is a zod parse; `cwd`/`apiBase`/`client` already exist in scope.
3. **Run `.server()` later** — inside `makeApp`, where `app` + `cwd` are live — instead of at boot, and capture the `dispose` it returns (today thrown away).

No new framework, no exotic types.

## Gap 1 — typed per-extension config

`defineExtension` accepts an optional `configSchema`; the builder exposes `parseConfig`.

```ts
defineExtension({
  name: 'test-runner',
  configSchema: z.object({runner: z.enum(['vitest', 'jest', 'node-test', 'playwright']).default('vitest')}),
  tools: [testTool],
})
// builder.parseConfig(raw) => meta.configSchema ? meta.configSchema.parse(raw ?? {}) : {}
```

User values live under `extensions['<name>']` in the mandarax config; the host parses them (defaults applied) and feeds the result into the server and client factories. Core routes the blob by name and never reads its contents. Deleting `cfg.testRunner` is migration-time work, not this pass.

## Gap 2 — server factory: context in, namespaced routes out, dispose

`.server()` changes from `() => ({tools, systemPrompt})` to `(server) => ({context, dispose?})`, where `server = {config, cwd, route}`. It runs in the App phase (below).

```ts
.server((server) => {
  const runner = makeRunner(server.config.runner, server.cwd)
  server.route.sse('/stream', (emit) => runner.subscribe(emit))   // mounted at /api/ext/test-runner/stream
  server.route.get('/status', () => runner.status())
  server.route.post('/run', (event) => runner.run(event))
  return {context: {runner}, dispose: () => runner.stop()}
})
```

`tools` and `systemPrompt` are no longer returned here — they are the declarative `tools: []` and `systemPrompt` fields already on `defineExtension`.

`server.route` is a narrowed `{get, post, sse}` surface, never the raw `H3`:

- **Namespacing.** Every path is auto-prefixed to `/api/ext/<slug(name)>/...`. An extension writes `/stream`; the host mounts `/api/ext/test-runner/stream`. Cross-extension collisions and shadowing a core route (`/api/chat`, `/api/mcp`, ...) are structurally impossible.
- **No raw handle.** A full `H3` would let an extension `app.use(...)` global middleware and observe every request. The narrowed surface forecloses that.
- **`sse` is core's `sseStream` injected in.** SSE responses bypass the global CORS middleware, so they must flow through this one helper, which carries the loopback CORS guard per response. `get`/`post` register after `registerCors`, inheriting the global origin guard.

`makeServerRoute(app, name, sse)` is the only new file (~20 lines): it returns `{get, post, sse}` that register on the live `app` under the slugged prefix.

## Gap 3 — tools receive injected context (typed)

`define-tool.ts` passes a second argument through `__execute`:

```ts
// before
server(execute) { builder.__execute = async (raw) => execute(definition.inputSchema.parse(raw)); return builder }
// after
server(execute) { builder.__execute = async (raw, ctx) => execute(definition.inputSchema.parse(raw), ctx); return builder }
```

so an author writes `defineTool<Schema, Ctx>(...).server((input, ctx) => ctx.runner.list())`. The App-phase binding closes each tool over its extension's returned `context`:

```ts
execute: (input) => tool.__execute(input, context)
```

Typing: `defineTool<Schema, Ctx = unknown>` carries `Ctx`; the extension's returned `context` is checked against the intersection of its tools' `Ctx` (a tool consumes a structural subset, so the extension must provide everything every tool needs). Tools stay pure and unit-testable — the runner is injected, never a module singleton; core never sees it.

## Gap 4 — client factory: argument in, dispose captured

`.client()` already returns `{value, dispose?}` but the factory receives nothing. It gains a `client = {apiBase, client, requestMeta}` argument so it can open its own transport and expose a subscription through `value`, read by the card via `useContext`.

```ts
.client((client) => {
  const source = new EventSource(`${client.apiBase}/api/ext/test-runner/stream`)
  return {value: {subscribe}, dispose: () => source.close()}
})
```

Two real fixes: pass the argument, and **capture the returned `dispose`** — today the widget drops it (a leak). The widget stores it and calls it on panel unmount / HMR. The per-extension `value` already merges into `useContext`.

## Server lifecycle — two phases (replaces `collectServerContributions`)

`collectServerContributions` is deleted. The engine receives `extensions: ExtensionBuilder[]` (not pre-drained contributions) and works them in two phases, both expressed as projections over the array — no `collect*` helper.

**Prompt phase** (boot, before the prompt file is written) — read declarative text without running `.server()`:

```ts
const systemPrompt = [
  cfg.systemPrompt,
  ...extensions.flatMap((ext) => [...(ext.tools ?? []).map((t) => t.promptSnippet), ext.systemPrompt]),
]
  .filter(Boolean)
  .join('\n\n')
```

**App phase** (inside `makeApp`, where `app` + `cwd` exist) — run each factory; the factory itself registers its routes, so our `.map` only runs it and binds its tools:

```ts
const mounted = extensions.map((ext) => {
  const {context, dispose} = ext.__server?.(serverApiFor(ext)) ?? {}
  const tools = (ext.tools ?? [])
    .filter((t) => t.__execute)
    .map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      execute: (input) => t.__execute(input, context),
    }))
  return {tools, dispose}
})
const extensionTools = mounted.flatMap((m) => m.tools)
const disposers = mounted.map((m) => m.dispose).filter(Boolean)
```

`serverApiFor(ext)` builds `{config: ext.parseConfig(userConfigFor(ext.name)), cwd, route: makeServerRoute(app, ext.name, sse)}`. Because `makeApp` runs once and the per-request MCP context closes over the same `context`, the route handler and the tool handler share one stateful object (the property that makes "agent runs the tool, the live card sees the stream" work). `engine.stop` awaits the disposers before `server.close()`. `mcp.ts` calls `execute(args)` — context is already closed over. A duplicate tool-name across extensions throws (a `Set` guard in the `.map`, not a ceremony function).

## Delivery — rides the landed split, no queue

The split already deleted `installExtensionGlobal` / `__MANDARAX__.queue` / `extensionsModuleSource()`. Built-ins and fixtures ride the existing arrays:

- **Server:** `start({extensions: [...builtinExtensions, ...userBuilders]})` (plugin-owned `builtinExtensions` array; `userBuilders` from the jiti glob).
- **Client:** `mountWidget([...builtinExtensions, ...userExtensions])` (`userExtensions` from `import.meta.glob`). The widget browser IT already mounts fixtures via `mountWidget([fixture])`, so Gap 4 needs no new delivery path.

## Builder generics

The builder becomes four-arg: `ExtensionBuilder<Config, Tools, ServerContext, ClientValue>`, with `.server` constrained so its returned `context` satisfies the intersection of `Tools`' `Ctx`, and `.client<V>` widening `ClientValue` by `V`. `defineExtension` is tuple-generic over `tools` so each tool's `Ctx` survives. The `as unknown as ExtensionBuilder<...>` cast at `define-extension.ts:64` is removed so `tsc --strict` actually verifies each chained method's re-parameterized return; otherwise the generics are decorative. `RequiredContext<Tools>` uses the `UnionToIntersection` idiom (a bare union is too weak a constraint).

## The fixture and testing (real server, real browser, no mocks)

One throwaway fixture extension exercises all four gaps: a fake stateful object built in `.server()` from typed `config` + `cwd`, a namespaced `get` route and an `sse` stream, a tool whose `execute` reads the injected context, a `dispose`, and a `.client()` that opens an `EventSource` and exposes a subscription through `value`.

- **Node IT:** load the fixture; `parseConfig` applies defaults; the route serves under `/api/ext/<name>/`; the tool executes over `/api/mcp` against the injected context; `engine.stop` calls `dispose`; a non-loopback `Origin` on an extension route is rejected 403.
- **Browser IT:** the card reads `useContext((c) => c.subscribe)` and renders the streamed value; the returned client `dispose` closes the `EventSource` on unmount/HMR; one panel rendering the card plus a slot Component opens exactly one transport.
- **Type tests:** `useContext(select)` narrows; the extension `context` is a compile error if it omits a key a tool's declared `Ctx` requires; `parseConfig` output is typed from the schema.

## Open points (resolve during planning, not blocking)

1. Exact config home: flat `extensions['<name>']` map vs a nested reserved key. Align with the plugin discovery config.
2. Slug rule for the route prefix (lowercase, non-alphanumerics to `-`) and how a name with odd characters maps.
3. Whether `serverApiFor`/`makeServerRoute` live in `@mandarax/extension` (with `sse` injected by core so the package stays node-light) or in core. Leaning: the route surface in `@mandarax/extension`, `sse` injected by core.
