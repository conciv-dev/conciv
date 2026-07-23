# Framework Inspection Extensions — Design

Date: 2026-07-19
Status: approved direction, pre-plan

## Goal

Give agents first-class visibility into the running host app's framework internals — the same
data each framework's devtools read — plus the actions to act on it and verify fixes. Two
extensions now (`nextjs`, `tanstack`), a shared adapter contract so Vue, Solid, SolidStart, and
Astro land later as thin adapter packages. Alongside this, replace per-tool prompt registration
with library-native lazy tool discovery (plus Code Mode) so the standing context stays near zero
no matter how many tools extensions ship.

## Decisions (settled during brainstorm)

1. Read **and** act: inspection tools plus navigation/invalidation actions.
2. Per-framework extension packages, all implemented over one shared adapter contract
   (replaceable, fakeable, contract-tested).
3. Full-depth access: browser globals **and** dev-server internals. Conciv already runs
   in-process with both hosts (`withConciv` + `instrumentation.ts` `register()` for Next,
   the unplugin for vite/TanStack), so no new integration point is needed.
4. Agent tools only — no human-facing devtools panels. Rich tool render cards in chat.
5. Pull tools plus push: build/runtime/server errors and HMR events stream into agent context.
6. Discovery is library-native, not hand-rolled: all extension tools are `lazy: true` in
   `@tanstack/ai` — lazy discovery as the baseline, Code Mode on top where the harness path
   supports it. (Supersedes the earlier custom `query_tools`/`run_tool` + MiniSearch draft.)
7. No injected registrar modules. The TanStack router instance is read from the React fiber tree
   (`RouterProvider` props) via the existing `packages/page` react-bridge.

## 1. Shared adapter contract

New `packages/protocol/src/framework-types.ts`, mirroring the `HarnessAdapter` capability-typing
pattern: capability flags make optional surfaces required at compile time.

```ts
type FrameworkAdapter = {
  name: 'nextjs' | 'tanstack-start' | 'vue' | 'solid-start' | 'astro'
  capabilities: {
    queryCache: boolean
    serverFunctions: boolean
    rscPayload: boolean
    isr: boolean
    middleware: boolean
  }
  client: {
    detect(): FrameworkInfo | null
    routes: {current(): RouteMatch[]; tree(): RouteNode}
    navigation: {navigate(to: NavigateInput): Promise<void>; back(): void; refresh(): Promise<void>}
    data: {
      entries(): CacheEntry[]
      get(key: string): unknown
      invalidate(key: string): Promise<void>
      refetch(key: string): Promise<void>
    }
    payload: {hydration(): HydrationSnapshot}
    errors: {snapshot(): AppError[]; subscribe(cb: (e: AppError) => void): () => void}
  }
  server: {
    manifest: {routes(): ServerRouteInfo[]; serverFunctions?(): ServerFnInfo[]}
    events: {subscribe(cb: (e: FrameworkEvent) => void): () => void}
    logs: {tail(n: number): LogEntry[]}
  }
}
```

- `client` runs in the widget's page context (it already lives inside the host app).
- `server` runs in-process with the host dev server (engine boots there today).
- Capability flags gate optional groups the way `transcriptHistory: true` forces `history` on
  harness adapters: `queryCache: true` requires the query-cache surface, etc.
- Serialization: loader data and cache entries can be huge. Reuse `packages/page` dehydrate
  (depth/size caps plus "fetch deeper" pointers) for every payload that crosses to the agent.

Tools are framework-named but implemented over the adapter, so:

- `@conciv/extension-testkit` ships a fake adapter; widget/tool tests run against it.
- One contract test suite runs against every real adapter through the e2e consumer apps.
- A new framework is an adapter package plus tool naming, not a new architecture.

## 2. TanStack Router/Start adapter

Browser:

- Router instance obtained from the fiber tree: `RouterProvider` props hold the live router.
  (Verified: TanStack sets only `window.$_TSR` — an SSR bootstrap buffer — and
  `globalThis.__TSR_CACHE__`; the router instance itself is never a global.) Fallback: subscribe
  to the TanStack devtools event bus when the host app mounts it.
- State exposed: matches (id, status, error), params, parsed search, location and history stack,
  `loaderData` per match, route context, pending matches, cache freshness (staleTime/gc),
  preload state, full route tree.
- TanStack Query cache when present: queries and mutations with key, state, observers, errors.
- Server-function client calls intercepted for timing and payloads.

Server (vite plugin):

- Parsed `routeTree.gen`, server-function registry, vite module graph, transform/build errors,
  HMR events, SSR request traces.

Actions: `router.navigate`, `router.invalidate`, query invalidate/refetch, preload route, reset
error boundaries.

## 3. Next.js adapter

Browser:

- `window.next` (version, App Router push/replace/refresh/prefetch), pages-router
  `__NEXT_DATA__`, App Router `__next_f` flight payload parsed into an RSC tree snapshot.
- Router segment/cache state via the existing react-bridge fiber walk.
- Dev-overlay and HMR websocket build/runtime errors; web vitals and performance entries.

Server (in-process via `register()`):

- `.next` manifests (app-paths, routes, middleware, prerender) mapped into a route tree with
  static/dynamic/middleware annotations.
- Fetch-cache/ISR entries; `onRequestError` instrumentation hook for server errors with digests;
  console/stdout capture; request traces.

Actions: navigate/refresh, `revalidatePath`/`revalidateTag` (research task: confirm callable
in-process in dev), clear client router cache.

## 4. Tools

Framework vocabulary, thin over the adapter. Illustrative set:

- Next: `nextjs_route_tree`, `nextjs_route_info`, `nextjs_rsc_payload`, `nextjs_navigate`,
  `nextjs_revalidate`, `nextjs_request_errors`, `nextjs_build_errors`, `nextjs_logs`.
- TanStack: `tanstack_router_state`, `tanstack_route_tree`, `tanstack_loader_data`,
  `tanstack_query_cache`, `tanstack_navigate`, `tanstack_invalidate`, `tanstack_server_fn_trace`,
  `tanstack_build_errors`.

Each tool ships a rich render card (route tree, cache table, error list). Each extension's system
prompt teaches the loop: inspect, act, verify — but rides the discovery surface (section 6), not
the standing prompt.

## 5. Push events

Unified `FrameworkEvent` (`buildError`, `runtimeError`, `serverError`, `hmrUpdate`, `navigation`,
`requestTrace`) flowing into a server-side ring buffer. Build/runtime/server errors auto-surface
to the agent: digest at turn start plus live delivery while a run is active (exact plumbing —
likely the existing server-stream — is a plan-phase decision). Deduped, throttled, category
opt-outs so the context never floods. Push events are not tools and are unaffected by the lazy
discovery surface.

Reuse note: `@tanstack/devtools-vite` already ships console piping (client <-> server via
`/__tsd/console-pipe` endpoints) and a ServerEventBus, and `@tanstack/devtools-event-client`
provides the typed, pluginId-namespaced bus API (emit/on, queuing, retry lifecycle). For the
TanStack adapter, prefer subscribing to these over reinventing transport; evaluate at plan phase
how much carries over to the Next adapter.

## 6. Discovery surface: library-native lazy discovery + Code Mode

Today `packages/core/src/start.ts` concatenates every tool's `promptSnippet` and every
extension's `systemPrompt` into one always-loaded system prompt. This PR replaces that.

An earlier draft of this design hand-rolled a two-tool surface (`query_tools` backed by
MiniSearch plus a `run_tool` dispatcher). That is superseded: the installed `@tanstack/ai`
(0.41.0, the library conciv turns already run through) ships both halves natively, and
hand-rolling would have broken render-by-part-name, native approval gating, and typed args.

Two composing mechanisms, both driven by marking extension tools `lazy: true`:

1. **Lazy tool discovery** (classic tool calls). The LLM sees a synthetic
   `__lazy__tool__discovery__` tool plus a names-only catalog of lazy tools
   (`lazyToolsConfig: {includeDescription: 'first-sentence'}` adds a one-liner each). It
   discovers full schemas on demand; a discovered tool becomes a real tool call — approval flow,
   arg typing, and widget render-by-part-name all unchanged. The discovery tool auto-removes
   once everything is discovered.
2. **Code Mode** (the Cloudflare-pioneered execute-code pattern, native in `@tanstack/ai`).
   Tools are projected as a typed TypeScript API; the agent writes code against it, executed in
   the conciv sandbox; chained inspect -> act -> verify runs without an LLM round-trip per step.
   Lazy tools stay out of the system prompt and surface via `discover_tools`. Code Mode emits
   dedicated events (`CodeModeExecutionStarted`, `CodeModeConsole`, `CodeModeExternalCall`, ...)
   the widget can render.

Both are configuration of the same tool definitions, not separate architectures. Ship with lazy
discovery as the guaranteed baseline and Code Mode enabled where the harness path supports it
(verification task below).

Context posture:

- The standing system prompt keeps one short snippet describing discovery; per-tool
  `promptSnippet`/`promptGuidelines` become discovery payload, returned only when a tool is
  discovered.
- All existing extensions (recorder, terminal, test-runner, try-it, whiteboard) migrate onto the
  same lazy surface.
- Accepted trade-off: the pre-discovery catalog lists all lazy tool names (plus first sentence).
  That is a few hundred tokens; the pollution this design eliminates is the schemas, snippets,
  and guidelines. No custom search index is needed — MiniSearch is dropped; if name-based
  discovery recall proves weak in practice, revisit with an upstream `lazyToolsConfig`
  contribution rather than a parallel mechanism.

## 7. Testing

- Contract test suite runs once against the testkit fake adapter and against each real adapter
  via the existing e2e consumer apps (`nextjs-app`, `tanstack-start`).
- Widget integration tests: prebuilt embed bundle, real Chromium, `browser.newPage()`, no jsdom,
  no framework mocks — real apps only. Never wait on `networkidle` with the live widget.
- Discovery surface: unit tests that every extension tool is registered lazy, that the standing
  system prompt contains only the single discovery snippet (anti-pattern grep: no
  `promptSnippet` concatenation left in `start.ts`), and that discovered tools keep their
  approval gates; an IT proving the loop discover -> call -> render card; a Code Mode IT
  proving a chained inspect -> act -> verify script executes in the sandbox and its events
  render.

## 8. Future frameworks

The contract is designed against these now, implemented later:

- Vue/Nuxt: `__VUE_DEVTOOLS_GLOBAL_HOOK__`, Nuxt payload/`useState`.
- Solid/SolidStart: solid devtools hook plus the vite plugin surface (same server half as
  TanStack).
- Astro: dev toolbar app API, islands inventory, content collections.

Capability flags absorb the mismatches (no query cache in Astro, no RSC outside Next, etc.).

## Open research tasks (plan phase)

1. Confirm `revalidatePath`/`revalidateTag` callable in-process in Next dev outside a request
   context; otherwise route the action through a dev-only handler.
2. Locate the stable HMR/error event source per bundler (webpack vs Turbopack) for Next and pin
   the message shapes.
3. Decide push-event delivery plumbing (server-stream vs turn-start digest attachment) and the
   dedupe window.
4. Verify fiber-walk router extraction against the TanStack Start example app (React 19).
5. Verify `lazy: true` and Code Mode pass through each harness adapter's tool path (tools ride
   MCP to the CLI harnesses); pin which harnesses get Code Mode at launch.
6. Confirm the exact event names/pluginIds the TanStack router and query devtools plugins emit
   on the devtools event bus, for the bus-subscription fallback and push events.
