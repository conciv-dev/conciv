# Extension API Gaps — Server Routes, Tool Context, Client Context, Typed Config

Date: 2026-06-24
Status: Approved (design)
Supersedes the API-gap portions of `2026-06-23-test-runner-extension-and-api-gaps-design.md` and its plan (both ON HOLD), rebased onto the landed split (`2026-06-23-extension-split-design.md`).

## Hard invariant (read first)

mandarax is a **permanent dev-only plugin** (`apply:'serve'`). The consuming app's production bundle must contain **zero mandarax code** — no widget, no extensions, no built-ins. There is no production mount path and never will be. Nothing in this design may introduce an artifact that could be tree-shaken into a consumer's prod build; all extension delivery wires only through the dev-only plugin's serve path.

## Goal

Grow the generic `@mandarax/extension` contract by the abilities a real, full-featured extension needs but cannot express today: a server factory that owns namespaced HTTP routes and a cleanup, injected context into tool `execute`, an argument into the client factory, and typed per-extension config. Prove all of it end to end against one throwaway fixture extension.

**In scope:** the generic API only. No test-runner file is touched.

**Deferred to the migration spec:** moving the test-runner into its own extension, relocating runner-domain types out of `@mandarax/protocol`, deleting test-runner code from core/widget, and the runtime built-in manifest (there are zero built-ins until then). Slice 0 (consolidate onto the singular `@mandarax/extension`) and the catalog rewrite already landed.

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

Consequence: an extension today cannot register an HTTP route, run an SSE stream, read `cwd`, return a `dispose`, inject a value into its tool's `execute`, or declare typed config. Those are the gaps.

## The mechanism (one idea, applied three times)

Each runtime gap is "a factory that gets no argument today gets one." Closing them is three changes:

1. **Pass the missing argument** at each internal call site (`__server`, `__execute`, `__client`).
2. **Build what those arguments contain.** Only `route` is new (a small `makeServerRoute` in core); `cwd`/`apiBase`/`client` already exist in scope.
3. **Run `.server()` later** — inside `makeApp`, where `app` + `cwd` are live — instead of at boot, and capture the `dispose` it returns (today thrown away).

No new framework, no exotic runtime.

## Gap A — server factory: context in, namespaced routes out, dispose

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

- **Namespacing.** Every path is auto-prefixed to `/api/ext/<slug(name)>/...`. The extension writes `/stream`; the host mounts `/api/ext/test-runner/stream`. Cross-extension collisions and shadowing a core route (`/api/chat`, `/api/mcp`, ...) are structurally impossible.
- **No raw handle.** A full `H3` would let an extension `app.use(...)` global middleware and observe every request. The narrowed surface forecloses that.
- **`sse` is core's `sseStream` injected in.** SSE responses bypass the global CORS middleware, so they flow through this one helper, which carries the loopback CORS guard per response. `get`/`post` register after `registerCors`, inheriting the global origin guard.

`slug(name)`: lowercase, non-alphanumeric runs to `-`, trimmed. Extension-name uniqueness (we throw on duplicate tool _and_ extension names) prevents two names slugging to the same prefix.

## Gap B — tools receive injected context (typed)

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

Typing: `defineTool<Schema, Ctx = unknown>` carries `Ctx`; the extension's returned `context` is checked against the intersection of its tools' `Ctx`. Tools stay pure and unit-testable — the runner is injected, never a module singleton; core never sees it.

## Gap C — client factory: argument in, dispose captured

`.client()` already returns `{value, dispose?}` but the factory receives nothing. It gains `client = {apiBase, client, requestMeta}` so it can open its own transport and expose a subscription through `value`, read by the card via `useContext`.

```ts
.client((client) => {
  const source = new EventSource(`${client.apiBase}/api/ext/test-runner/stream`)
  return {value: {subscribe}, dispose: () => source.close()}
})
```

Two real fixes: pass the argument, and **capture the returned `dispose`** — today the widget drops it (a leak). The widget stores it and calls it on panel unmount / HMR. The per-extension `value` already merges into `useContext`.

## Gap D — typed config via module augmentation (open registry)

An extension declares a zod `configSchema`; the parsed value flows into the server and client factories. Users set values in their config with full type-checking. The type surface is **open** — each extension self-registers via declaration merging; core keeps no central list of config shapes.

The anchor interface lives in `@mandarax/protocol` (every extension depends on protocol; `MandaraxConfig` is here, so no cycle):

```ts
// @mandarax/protocol/config-types.ts
export interface ExtensionConfigRegistry {} // extensions merge into it
export interface MandaraxConfig {
  // …existing fields…
  extensions?: {[Name in keyof ExtensionConfigRegistry]?: ExtensionConfigRegistry[Name]}
}
```

`defineConfig` stays the plain function it is today; `extensions` types itself from whatever has merged in.

The author registers with one derived line — no `z.input`, no name retyping. `RegisterExtension` (from `@mandarax/extension`) pulls the name literal + `z.input` of the schema off the builder:

```ts
// @mandarax/extension
export type RegisterExtension<E extends {name: string; configSchema?: z.ZodType}> = E extends {
  name: infer Name extends string
  configSchema: infer Schema extends z.ZodType
}
  ? {[Key in Name]: z.input<Schema>}
  : {}
```

```ts
// an extension package
export const testRunnerConfig = z.object({
  runner: z.enum(['vitest', 'jest', 'node-test', 'playwright']).default('vitest'),
})
export const testRunnerExtension = defineExtension({name: 'test-runner', configSchema: testRunnerConfig /* … */})

declare module '@mandarax/protocol/config-types' {
  interface ExtensionConfigRegistry extends RegisterExtension<typeof testRunnerExtension> {}
}
```

The user gets autocomplete + checking (`z.input` → defaults optional; the factory receives `z.output` with defaults applied):

```ts
export default defineConfig({
  extensions: {'test-runner': {runner: 'jest'}}, // ✅ key + value typed; unknown key errors
})
```

This requires `defineExtension<Name extends string, Schema extends z.ZodType>` to carry the name literal + schema on the builder type (also needed for the typed factories), and `builder.parseConfig(raw) => configSchema ? configSchema.parse(raw ?? {}) : {}`.

## Server lifecycle — two phases (replaces `collectServerContributions`)

`collectServerContributions` is deleted. The engine receives `extensions: ExtensionBuilder[]` and works them in two phases, both plain projections over the array — no `collect*` helper.

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

`serverApiFor(ext)` builds `{config: ext.parseConfig(userConfig.extensions?.[ext.name]), cwd, route: makeServerRoute(app, ext.name, sse)}`. Because `makeApp` runs once and the per-request MCP context closes over the same `context`, the route handler and the tool handler share one stateful object (the property that makes "agent runs the tool, the live card sees the stream" work). `engine.stop` awaits the disposers before `server.close()`. `mcp.ts` calls `execute(args)` — context is already closed over. A duplicate tool-name across extensions throws (a `Set` guard in the `.map`).

## Where the new code lives

- `@mandarax/extension`: the `ServerApi`/`ServerRoute`/`ServerResult` **types** (pure, no h3), `RegisterExtension`, the generic `defineExtension`/`defineTool` changes, `parseConfig`, the 4-arg builder.
- `@mandarax/core`: the runtime `makeServerRoute(app, name, sse)` (h3 + `sseStream` already in scope) and the two-phase wiring in `engine`/`makeApp`/`mcp.ts`. h3 stays out of `@mandarax/extension`.
- `@mandarax/protocol`: `ExtensionConfigRegistry` + `MandaraxConfig.extensions`.
- **No new package.** Built-ins do not exist in this pass; when they do (migration), their manifest array lives in the dev-only plugin layer, never anywhere a consumer prod bundle could reach.

### Package layout (convention, applied at migration)

- `packages/extension/` → `@mandarax/extension` — the contract (singular). Stays.
- `packages/extensions/` → a **grouping folder, not a package** (the legacy plural package was deleted in Workstream C, freeing the name). It holds every built-in extension, one package each.
- `packages/extensions/<name>/` → `@mandarax/extension-<name>` (e.g. `packages/extensions/test-runner/` → `@mandarax/extension-test-runner`). npm scopes are flat, so the nesting is filesystem-only; the package name is `@mandarax/extension-<name>`.
- `pnpm-workspace.yaml` gains `packages/extensions/*` (today's `packages/*` harmlessly ignores the folder, which has no `package.json`).

None of this lands in this pass — recorded so the migration follows it.

## Delivery — rides the landed split, no queue

The split already deleted `installExtensionGlobal` / `__MANDARAX__.queue`. The fixture rides the existing arrays: server `start({extensions: [...]})`, client `mountWidget([fixture])` (the widget browser IT already mounts fixtures this way). Gap C needs no new delivery path.

## Builder generics

`ExtensionBuilder<Name, Config, Tools, ServerContext, ClientValue>`: `.server` constrained so its returned `context` satisfies the intersection of `Tools`' `Ctx` (`UnionToIntersection`, not a bare union); `.client<V>` widens `ClientValue` by `V`; `defineExtension` tuple-generic over `tools` so each `Ctx` survives; `name`/`configSchema` carried for `RegisterExtension`. The `as unknown as ExtensionBuilder<...>` cast at `define-extension.ts:64` is removed so `tsc --strict` verifies each chained method's re-parameterized return.

## The fixture and testing (real server, real browser, no mocks)

One throwaway fixture extension exercises everything: a fake stateful object built in `.server()` from typed `config` + `cwd`, a namespaced `get` route and an `sse` stream, a tool whose `execute` reads the injected context, a `dispose`, and a `.client()` that opens an `EventSource` and exposes a subscription through `value`.

- **Node IT:** load the fixture; `parseConfig` applies defaults; the route serves under `/api/ext/<name>/`; the tool executes over `/api/mcp` against the injected context; `engine.stop` calls `dispose`; a non-loopback `Origin` on an extension route is rejected 403.
- **Browser IT:** the card reads `useContext((c) => c.subscribe)` and renders the streamed value; the returned client `dispose` closes the `EventSource` on unmount/HMR; one panel rendering the card plus a slot Component opens exactly one transport.
- **Type tests:** `useContext(select)` narrows; the extension `context` is a compile error if it omits a key a tool's declared `Ctx` requires; `defineConfig` autocompletes a registered extension's key, errors an unknown key and a wrong value.

## Open points (resolve during planning, not blocking)

1. Slug edge cases (a name with no alphanumerics) and whether to validate extension names up front.
2. Whether `RegisterExtension` + the `declare module` target are smooth enough in practice (two import sources in the augmentation file), or worth a tiny codegen later.
