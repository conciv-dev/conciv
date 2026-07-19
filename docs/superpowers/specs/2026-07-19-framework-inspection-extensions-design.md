# Framework Inspection Extensions — Design

Date: 2026-07-19
Status: approved direction, pre-plan

## Goal

Give agents first-class visibility into the running host app's framework internals — the same
data each framework's devtools read — plus the actions to act on it and verify fixes. Two
extensions now (`nextjs`, `tanstack`), a shared adapter contract so Vue, Solid, SolidStart, and
Astro land later as thin adapter packages. Alongside this, replace per-tool prompt registration
with a two-meta-tool discovery surface so the standing context stays near zero no matter how many
tools extensions ship.

## Decisions (settled during brainstorm)

1. Read **and** act: inspection tools plus navigation/invalidation actions.
2. Per-framework extension packages, all implemented over one shared adapter contract
   (replaceable, fakeable, contract-tested).
3. Full-depth access: browser globals **and** dev-server internals. Conciv already runs
   in-process with both hosts (`withConciv` + `instrumentation.ts` `register()` for Next,
   the unplugin for vite/TanStack), so no new integration point is needed.
4. Agent tools only — no human-facing devtools panels. Rich tool render cards in chat.
5. Pull tools plus push: build/runtime/server errors and HMR events stream into agent context.
6. Exactly two tools registered with the harness: `query_tools` and `run_tool`. Everything else
   is virtual, discovered via fuzzy search. No list-all escape hatch.
7. No injected registrar modules. The TanStack router instance is read from the React fiber tree
   (`RouterProvider` props) via the existing `packages/page` react-bridge.
8. Search engine: MiniSearch. Top-5 result cap, min-score cutoff, query required (>= 3 chars).
9. `keywords` becomes an optional field on `defineTool` (curated for all framework tools).

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
opt-outs so the context never floods. Push events are not tools and are unaffected by the
two-tool discovery surface.

## 6. Discovery surface: two tools, everything else virtual

Today `packages/core/src/start.ts` concatenates every tool's `promptSnippet` and every
extension's `systemPrompt` into one always-loaded system prompt. This PR replaces that.

Registered with the harness, always and only:

1. `query_tools` — input: an intent string. Returns up to 5 matches: name, one-liner, full input
   JSON schema, guidelines. The agent can execute immediately; no second discovery hop.
2. `run_tool` — input `{name, args}`. Dispatches through the extension tool registry: zod-parses
   args against the inner schema, preserves the inner tool's `approval: 'ask'` gate, executes,
   streams as today.

The standing system prompt shrinks to one short snippet describing these two tools. Per-tool
`promptSnippet`/`promptGuidelines` become the `query_tools` result payload. All existing
extensions (recorder, terminal, test-runner, try-it, whiteboard) migrate onto the same surface.

Render cards: the widget renders tool parts by name; `run_tool` parts dispatch the renderer by
`args.name` so each inner tool's card renders unchanged.

### Search engine

- **MiniSearch** (~7 kB minzip, zero deps, TypeScript, actively maintained). Token-based
  field-boosted search fits intent queries ("invalidate query cache"); fuzzy 0.2 covers typos;
  prefix search covers partial tool names. Evaluated against uFuzzy (label-matching oriented),
  FlexSearch (speed we do not need, memory we do not want), Fuse.js (weaker result ordering).
- Catalog built once at engine boot from loaded extensions, immutable after (rebuilt on
  extension reload). Corpus is small (tens to low hundreds of tools) so index cost is negligible;
  the design still avoids waste on principle.
- Index holds only searchable text (name boosted x3, keywords x2, description x1) keyed by
  integer id. Zod schemas are never indexed or duplicated: a side `Map<name, tool>` points at the
  already-loaded tool builders, and JSON schema is serialized lazily per returned result and
  cached after first serialization.

### No escape hatch

- Query is required, minimum 3 characters; wildcard and stopword-only queries are rejected with
  guidance to state the intended action.
- Hard cap of 5 results with a min-score cutoff. No pagination, no list mode, no input value that
  reaches an all-tools dump.
- Zero results return a capped `autoSuggest` nearest-terms hint so the agent refines rather than
  broadens.

## 7. Testing

- Contract test suite runs once against the testkit fake adapter and against each real adapter
  via the existing e2e consumer apps (`nextjs-app`, `tanstack-start`).
- Widget integration tests: prebuilt embed bundle, real Chromium, `browser.newPage()`, no jsdom,
  no framework mocks — real apps only. Never wait on `networkidle` with the live widget.
- Discovery surface: unit tests for ranking quality (intent phrase to expected tool), rejection
  policy, and schema laziness; an IT proving the agent loop query -> run -> render card.

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
