# TanStack Router/Start Inspection Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@conciv/extension-tanstack` — a framework-inspection adapter that gives agents live, devtools-grade read + act access to a running TanStack Start app's router, loader data, query cache, server functions, and dev-server errors, implemented over the `FrameworkAdapter` contract from `@conciv/protocol/framework-types`.

**Architecture:** The adapter is an extension with the standard client/server split. Its **client half** runs in the page (widget context) and reads live state by walking the React fiber tree for the router instance (`memoizedProps.router`) and the TanStack Query `QueryClient` (`getQueryCache`), returning dehydrated snapshots. Server-side agent tools reach the client half over the **existing** page channel: `ctx.page({kind: 'framework', adapter: 'tanstack', method, argsJson})` → `PageBus.ask` → SSE → a new page-side `framework` handler that dispatches to a browser registry the extension client populates on mount. The adapter's **server half** reads the dev server through the conciv `BundlerBridge` (module graph, transform) plus additive vite hooks for build/HMR errors, and reads `routeTree.gen` and the server-functions manifest off disk. All facts below were verified live in the spike (`docs/superpowers/plans/2026-07-21-tanstack-adapter-spike-findings.md`).

**Tech Stack:** `@tanstack/react-router` 1.170 + `@tanstack/react-start` 1.168 + `@tanstack/react-query` 5.101 (workspace); `@conciv/extension` (`defineTool().render()`), `@conciv/protocol/framework-types` (Task-§1, shipped), `@conciv/page` (`dehydrate`, `react-bridge` fiber walk), the core `PageBus`, Playwright/Chromium for browser tests, vitest.

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments in TS/JS (the `conciv/no-comments` autofix DELETES them) — write self-explanatory code.
- TypeScript strict: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext. No `any`/`as`/`@ts-ignore`/non-null `!`.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- Widget/adapter browser behavior is tested in REAL Chromium (Playwright), never jsdom. Solid packages pin `test: {environment: 'node'}` in `vitest.config.ts`.
- Widget integration tests load the PREBUILT embed bundle — rebuild `@conciv/embed` before running them. Extension client entries resolve to `dist` in ITs, so rebuild the extension (`pnpm turbo run build --filter=@conciv/extension-tanstack`) after every client edit. Use `browser.newPage()`, never `newContext()`. Never wait on `networkidle` with the live widget.
- zod validates every HTTP boundary (`readValidatedBody`); new page-verb fields go through the existing `PageQuerySchema`.
- Payloads that cross to the agent (loader data, query data, route context) MUST pass through `@conciv/page` `dehydrate` (depth/size/redaction caps) — never return raw browser objects.
- New published package: add `@conciv/extension-tanstack` to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`, give it `homepage: https://conciv.dev` + a `repository` block with its `directory`. One `@conciv/*` changeset releases the whole set.
- Before finishing: `pnpm typecheck && pnpm build && pnpm test`, then `pnpm exec fallow audit --changed-since main --format json` and fix anything INTRODUCED.
- v0, no external users: reshape internal APIs freely, update all call sites, no back-compat shims.

## File Structure

- `packages/protocol/src/page-types.ts` (modify) — add the `framework` page-query kind + its fields.
- `packages/page/src/framework-registry.ts` (create) — browser-side registry: `registerFrameworkAdapterClient(name, client)` / `getFrameworkAdapterClient(name)`; single responsibility, no framework specifics.
- `packages/page/src/page-handlers.ts` (modify) — handle `kind: 'framework'` by dispatching to the registry.
- `packages/extensions/tanstack/` (create) — the extension package. Mirrors `packages/extensions/recorder` layout:
  - `src/client/router-adapter.ts` — the fiber-walk `FrameworkClientCore` + query-cache reads (browser).
  - `src/client/boot.ts` — registers the client adapter into `@conciv/page`'s registry on mount.
  - `src/server/bundler.ts` — server half: build/HMR error ring, `routeTree.gen` + server-fn manifest readers.
  - `src/server/serverfn-trace.ts` — `/_serverFn/*` trace ring.
  - `src/tool/*.ts` — one `defineTool(...).render(...)` per agent tool.
  - `src/tool/*-card.tsx` — co-located Solid render cards.
  - `src/index.ts` — `defineExtension` wiring client + server + tools.
- `packages/extension-testkit/src/framework-fake.ts` (create) — `makeFakeFrameworkAdapter(overrides)` returning a full `FrameworkAdapter` for widget/tool tests.
- `e2e/tanstack-start/` (modify) — enrich the fixture with a loader, a `createServerFn`, and a `QueryClientProvider` + `useQuery` so every surface is exercised by tests.

---

### Task 1: The `framework` page-query bridge (protocol + page registry + dispatch)

Adds a single generic browser verb that routes to a per-framework client registered in the page. This is the load-bearing seam: every client-side read in later tasks rides it.

**Files:**
- Modify: `packages/protocol/src/page-types.ts`
- Create: `packages/page/src/framework-registry.ts`
- Modify: `packages/page/src/page-handlers.ts`
- Test: `packages/page/test/framework-registry.test.ts`

**Interfaces:**
- Produces: page verb `{kind: 'framework', adapter: string, method: string, argsJson?: string}` → reply `Record<string, unknown>`. Registry API: `registerFrameworkAdapterClient(name: string, client: FrameworkClientLike): void`, `getFrameworkAdapterClient(name: string): FrameworkClientLike | undefined`, where `FrameworkClientLike = Record<string, (args: unknown) => unknown | Promise<unknown>>`. Consumed by Task 2 (registration), Task 3+ (server tools call `ctx.page({kind:'framework', ...})`).

- [ ] **Step 1: Add the verb + fields to the page-query schema**

In `packages/protocol/src/page-types.ts`, add `'framework'` to the `PAGE_QUERY_KINDS` array (append before the closing `]`), and add three optional fields to `PageQuerySchema`:

```ts
  adapter: z.string().optional().describe('framework adapter name, e.g. tanstack'),
  method: z.string().optional().describe('framework adapter client method name'),
  argsJson: z.string().optional().describe('JSON-encoded args for the framework method'),
```

`framework` is a read verb: do NOT add it to `MUTATING_KINDS` or `MIRROR_KINDS`.

- [ ] **Step 2: Write the failing registry test**

```ts
import {describe, it, expect, beforeEach} from 'vitest'
import {registerFrameworkAdapterClient, getFrameworkAdapterClient, clearFrameworkAdapterClients} from '../src/framework-registry.js'

describe('framework adapter registry', () => {
  beforeEach(() => clearFrameworkAdapterClients())
  it('returns undefined for an unregistered adapter', () => {
    expect(getFrameworkAdapterClient('tanstack')).toBeUndefined()
  })
  it('stores and retrieves a registered client', () => {
    const client = {routerState: () => ({ok: true})}
    registerFrameworkAdapterClient('tanstack', client)
    expect(getFrameworkAdapterClient('tanstack')).toBe(client)
  })
})
```

- [ ] **Step 3: Run it, expect FAIL**

Run: `pnpm --filter @conciv/page test -- framework-registry`
Expected: FAIL (module `../src/framework-registry.js` not found).

- [ ] **Step 4: Implement the registry**

Create `packages/page/src/framework-registry.ts`:

```ts
export type FrameworkClientLike = Record<string, (args: unknown) => unknown | Promise<unknown>>

const registry = new Map<string, FrameworkClientLike>()

export function registerFrameworkAdapterClient(name: string, client: FrameworkClientLike): void {
  registry.set(name, client)
}

export function getFrameworkAdapterClient(name: string): FrameworkClientLike | undefined {
  return registry.get(name)
}

export function clearFrameworkAdapterClients(): void {
  registry.clear()
}
```

- [ ] **Step 5: Dispatch the verb in the page handler**

In `packages/page/src/page-handlers.ts`, add a branch that handles `query.kind === 'framework'`: look up the client, call `client[query.method]` with the parsed `argsJson`, and return the result wrapped as the reply `data`. Add near the other verb branches:

```ts
import {getFrameworkAdapterClient} from './framework-registry.js'

async function handleFramework(query: {adapter?: string; method?: string; argsJson?: string}): Promise<Record<string, unknown>> {
  const client = query.adapter ? getFrameworkAdapterClient(query.adapter) : undefined
  if (!client) return {error: `no framework adapter registered: ${query.adapter ?? '(none)'}`}
  const fn = query.method ? client[query.method] : undefined
  if (typeof fn !== 'function') return {error: `unknown framework method: ${query.method ?? '(none)'}`}
  const args = query.argsJson ? (JSON.parse(query.argsJson) as unknown) : undefined
  const result = await fn(args)
  return {result: result ?? null}
}
```

Wire `handleFramework(query)` into the handler's kind switch so `kind: 'framework'` returns its value.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @conciv/page test -- framework-registry` → PASS.
Run: `pnpm --filter @conciv/protocol typecheck && pnpm --filter @conciv/page typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol/src/page-types.ts packages/page/src/framework-registry.ts packages/page/src/page-handlers.ts packages/page/test/framework-registry.test.ts
git commit -m "feat(page): generic framework page-query verb + adapter client registry"
```

---

### Task 2: `@conciv/extension-tanstack` scaffold + client router adapter (fiber walk)

Creates the package and its browser router reader, registered into Task 1's registry. Proven live in the spike.

**Files:**
- Create: `packages/extensions/tanstack/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Create: `packages/extensions/tanstack/src/client/router-adapter.ts`
- Create: `packages/extensions/tanstack/src/client/boot.ts`
- Modify: `packages/publish/src/guards.ts` (add to `PUBLIC_PACKAGES`)
- Modify: `e2e/tanstack-start/src/routes/about.tsx`, `src/routes/__root.tsx`, `src/lib/server-fns.ts` (create) — committed fixture
- Test: `packages/extensions/tanstack/test/router-adapter.browser.test.ts`

**Interfaces:**
- Consumes: `registerFrameworkAdapterClient` (Task 1), `FrameworkClientCore` / `RouteMatch` / `RouteNode` (`@conciv/protocol/framework-types`), `dehydrate` (`@conciv/page`).
- Produces: `makeTanstackRouterClient(): {routerState(): {matches: RouteMatch[]; location: {...}}, routeTree(): RouteNode, ...}` registered under the name `'tanstack'`.

- [ ] **Step 1: Scaffold the package**

Copy the shape of `packages/extensions/recorder`. `package.json` (fill deps from the recorder's for build tooling):

```json
{
  "name": "@conciv/extension-tanstack",
  "version": "0.0.13",
  "type": "module",
  "homepage": "https://conciv.dev",
  "repository": {"type": "git", "url": "git+https://github.com/conciv-dev/conciv.git", "directory": "packages/extensions/tanstack"},
  "exports": {".": {"types": "./dist/index.d.ts", "import": "./dist/index.js"}},
  "scripts": {"build": "tsdown", "typecheck": "tsc -p tsconfig.json --noEmit", "lint": "oxlint", "test": "vitest run"},
  "dependencies": {"@conciv/extension": "workspace:*", "@conciv/protocol": "workspace:*", "@conciv/page": "workspace:*"},
  "peerDependencies": {"@tanstack/react-router": ">=1.170.0"}
}
```

`vitest.config.ts` must pin `test: {environment: 'node'}` (browser tests opt into Chromium per-file via the workspace browser config — copy recorder's exact config).

- [ ] **Step 2: Write the failing browser test against the fixture**

First enrich the committed fixture `e2e/tanstack-start`:
- Create `src/lib/server-fns.ts`:
```ts
import {createServerFn} from '@tanstack/react-start'
export const getGreeting = createServerFn({method: 'GET'}).handler(async () => ({greeting: 'hello', at: 1}))
```
- In `src/routes/about.tsx` add a loader calling it and a `useQuery`:
```ts
import {createFileRoute} from '@tanstack/react-router'
import {useQuery} from '@tanstack/react-query'
import {getGreeting} from '../lib/server-fns'
export const Route = createFileRoute('/about')({
  loader: async () => ({server: await getGreeting(), local: {n: 42, tags: ['a', 'b']}}),
  component: About,
})
function About() {
  const data = Route.useLoaderData()
  useQuery({queryKey: ['spike', 'demo'], queryFn: async () => ({fetched: true})})
  return <main>{data.server.greeting}</main>
}
```
- In `src/routes/__root.tsx` wrap the app body in `QueryClientProvider` with a module `QueryClient` (add `@tanstack/react-query` to the fixture's `package.json` deps).

Then the test (`test/router-adapter.browser.test.ts`) loads the running fixture, evaluates the registered client, and asserts extraction. Use the same page-eval fiber walk the spike proved. Assert: `routerState().location.pathname === '/about'`, a match with `routeId === '/about'` and `loaderData` truthy, and `routeTree()` has ≥4 route ids.

- [ ] **Step 3: Run it, expect FAIL** (client module not implemented). Run: `pnpm --filter @conciv/extension-tanstack test`.

- [ ] **Step 4: Implement the router client**

`src/client/router-adapter.ts` — port the proven spike extraction. Find the router via fiber walk (`memoizedProps.router` duck-typed by `state.matches` + `navigate`), map `state.matches` → `RouteMatch[]` (`id`, `routeId`, `fullPath`→`path`, `params`, `search`, `status`, `error`→`error?message`, `loaderData` via `dehydrate`, `isFetching`, `staleAt`←`updatedAt`), `routesById` → `RouteNode` tree, `state.location` → location. Reuse `packages/page/src/react-bridge.ts` root-fiber discovery (`scannedRootFibers`) rather than re-rolling the DOM-key walk. Every returned payload with user data goes through `dehydrate`.

```ts
import {dehydrate} from '@conciv/page'
import type {RouteMatch, RouteNode} from '@conciv/protocol/framework-types'
// find router via fiber walk; then:
export function makeTanstackRouterClient() {
  function router() { /* fiber-walk lookup, throw a typed 'router not found' if absent */ }
  return {
    detect: () => ({name: 'tanstack-start', version: null, router: 'file-based', dev: true}),
    routerState: () => ({matches: mapMatches(router().state.matches), location: mapLocation(router().state.location)}),
    routeTree: () => mapTree(router()),
    navigate: (args: {to: string; replace?: boolean}) => router().navigate({to: args.to, replace: args.replace}),
    invalidate: () => router().invalidate(),
    // back/refresh added in Task 6
  }
}
```

- [ ] **Step 5: Register on boot**

`src/client/boot.ts`:
```ts
import {registerFrameworkAdapterClient} from '@conciv/page'
import {makeTanstackRouterClient} from './router-adapter.js'
registerFrameworkAdapterClient('tanstack', makeTanstackRouterClient())
```
Export `registerFrameworkAdapterClient`/`getFrameworkAdapterClient` from `@conciv/page`'s entry so the extension can import it (add to `packages/page/src/index.ts`).

- [ ] **Step 6: Build the extension + fixture, run the browser test** → PASS. Run: `pnpm turbo run build --filter=@conciv/extension-tanstack` then `pnpm --filter @conciv/extension-tanstack test`.

- [ ] **Step 7: Register the package as public + commit**

Add `@conciv/extension-tanstack` to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`.

```bash
git add packages/extensions/tanstack packages/page/src/index.ts packages/publish/src/guards.ts e2e/tanstack-start
git commit -m "feat(extension-tanstack): package scaffold + fiber-walk router client, committed fixture"
```

---

### Task 3: `tanstack_router_state` + `tanstack_route_tree` tools + cards

First agent-facing slice: server tools that call the client over `ctx.page`, with render cards. Proves the whole vertical (agent → tool → page bus → browser → card).

**Files:**
- Create: `packages/extensions/tanstack/src/tool/router-state.ts`, `route-tree.ts`, and `*-card.tsx`
- Modify: `packages/extensions/tanstack/src/index.ts` (register tools)
- Test: `packages/extensions/tanstack/test/router-tools.browser.test.tsx` (widget IT)

**Interfaces:**
- Consumes: `ctx.page` (extension tool context — same `ConcivToolContext.page` shipped in `packages/core/src/app.ts`), the `'tanstack'` client (Task 2).
- Produces: tools `tanstack_router_state`, `tanstack_route_tree`.

- [ ] **Step 1: Write the failing widget IT** asserting a turn that calls `tanstack_router_state` renders a card listing the current route path and match count (real Chromium, prebuilt embed).

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement `router-state.ts`**

```ts
import {defineTool} from '@conciv/extension'
import {z} from 'zod'
import {RouterStateCard} from './router-state-card.js'

export const routerState = defineTool({
  name: 'tanstack_router_state',
  description: 'Read the running app\'s current TanStack Router state: matched routes, params, search, loader status. Use it to see what the user is looking at before acting.',
  inputSchema: z.object({}),
})
  .server(async (_input, ctx) => {
    const reply = await ctx.page({kind: 'framework', adapter: 'tanstack', method: 'routerState', argsJson: '{}'})
    return reply.result
  })
  .render(RouterStateCard)
```

`route-tree.ts` follows the identical shape with `method: 'routeTree'` and `RouteTreeCard`.

- [ ] **Step 4: Implement the cards** (`*-card.tsx`) — Solid components rendering the dehydrated result (route path, match list; tree as a nested list). Follow `packages/extensions/recorder/src/tool/card.tsx` for structure and the ui-kit-system primitives. No approval strip (reads).

- [ ] **Step 5: Register in `src/index.ts`** via `defineExtension` (client entry = `boot.ts`, tools = `[routerState, routeTree, ...]`, server extension for later tasks).

- [ ] **Step 6: Rebuild embed + extension, run the IT** → PASS. Run: `pnpm turbo run build --filter=@conciv/embed --filter=@conciv/extension-tanstack` then the IT.

- [ ] **Step 7: Commit** (`feat(extension-tanstack): router_state + route_tree tools and cards`).

---

### Task 4: `tanstack_loader_data` tool + card (dehydrate proof)

**Files:** Create `src/tool/loader-data.ts` + `loader-data-card.tsx`; add a `loaderData(args: {routeId?: string})` method to the client; modify `src/index.ts`. Test: extend the browser test.

- [ ] **Step 1:** Failing browser test — navigate to `/about`, call `tanstack_loader_data`, assert the reply contains the loader keys (`server`, `local`) and that a deeply nested value beyond the dehydrate depth cap is truncated (proves dehydrate ran).
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Add client method `loaderData: (a: {routeId?: string}) => dehydrate(pickMatch(router(), a.routeId)?.loaderData)`; add the tool (shape of Task 3, `method: 'loaderData'`, input `z.object({routeId: z.string().optional()})`).
- [ ] **Step 4:** Card renders the dehydrated tree (reuse the page dehydrated-value renderer if one exists; else a keyed list).
- [ ] **Step 5:** Rebuild, run → PASS.
- [ ] **Step 6:** Commit (`feat(extension-tanstack): loader_data tool with dehydrate`).

---

### Task 5: queryCache surface + `tanstack_query_cache` tool + card

**Files:** Create `src/client/query-adapter.ts` (find `QueryClient` via fiber walk, `getQueryCache().getAll()` → `CacheEntry[]`), `src/tool/query-cache.ts` + card; modify client registration + `src/index.ts`. Capability `queryCache: true`.

- [ ] **Step 1:** Failing browser test — on `/about`, `tanstack_query_cache` returns the `["spike","demo"]` entry with `status: 'success'`, `observers: 1`.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement `query-adapter.ts`: fiber-walk for `typeof v.getQueryCache === 'function'` (on `memoizedProps.client`/`.value`), map each query to `CacheEntry` (`key`←`JSON.stringify(queryKey)`, `state`←`isStale()? 'stale':'fresh'` / `fetchStatus`, `status`, `value`←`dehydrate(state.data)`, `updatedAt`←`dataUpdatedAt`, `error`, `observers`←`getObserversCount()`); `mutations()`←`getMutationCache().getAll()`; `invalidate`/`refetch`←`queryClient.invalidateQueries`/`refetchQueries`. Register these methods on the `'tanstack'` client. Add the tool.
- [ ] **Step 4:** Card — a table of queries (key, status, observers, age).
- [ ] **Step 5:** Rebuild, run → PASS.
- [ ] **Step 6:** Commit (`feat(extension-tanstack): query_cache surface, tool, card`).

---

### Task 6: Actions — `tanstack_navigate`, `tanstack_invalidate` (+ back/refresh)

**Files:** Create `src/tool/navigate.ts`, `invalidate.ts` + cards; add client methods `back`/`refresh`; modify `src/index.ts`.

- [ ] **Step 1:** Failing browser test — `tanstack_navigate` with `{to: '/form'}` changes `routerState().location.pathname` to `/form`.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement tools. `navigate` input `z.object({to: z.string(), replace: z.boolean().optional()})` → `method: 'navigate'`. `invalidate` input `z.object({})` → `method: 'invalidate'`. Add client `back: () => router().history.back()`, `refresh: () => router().invalidate()`. These are additive/navigational — leave unguarded (consistent with the approval audit: navigation is not destructive).
- [ ] **Step 4:** Cards — a compact confirmation chip (target route / invalidated). No approval strip.
- [ ] **Step 5:** Rebuild, run → PASS.
- [ ] **Step 6:** Commit (`feat(extension-tanstack): navigate + invalidate action tools`).

---

### Task 7: Server half — build/HMR errors + route manifest → `tanstack_build_errors`, `tanstack_route_manifest`

The server half reads the dev server. Transport already exists (conciv boots the engine in `configureServer` and hands it a `BundlerBridge`, `packages/plugin/src/core/vite.ts`); this task adds error/HMR capture + on-disk readers.

**Files:**
- Create: `packages/extensions/tanstack/src/server/bundler.ts` (error ring + readers), `src/tool/build-errors.ts`, `route-manifest.ts` + cards.
- Modify: `packages/plugin/src/core/vite.ts` or add a sibling vite plugin the extension contributes, to capture transform/build errors and HMR events into the ring. (Confirm at implementation whether the extension server-context exposes the `BundlerBridge`; if not, thread it through the extension server registration — new wiring, note it in the commit.)

**Interfaces:**
- Consumes: `BundlerBridge` (`@conciv/protocol/bundler-types`: `moduleGraph`, `transform`, `config`), the vite dev server error/HMR stream.
- Produces: tools `tanstack_build_errors` (recent transform/build errors), `tanstack_route_manifest` (parsed `routeTree.gen`).

- [ ] **Step 1:** Failing node test — feed the error ring a synthetic transform error and assert `tanstack_build_errors` returns it as an `AppError` (`kind: 'build'`, message, source loc).
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement `bundler.ts`: a bounded ring buffer (reuse the recorder's ring pattern, `packages/extensions/recorder/src/server/ring.ts`) fed by a vite plugin hook (`transform` try/catch → push `AppError`; `hotUpdate`/`handleHotUpdate` → push `FrameworkEvent{kind:'hmrUpdate'}`). `routeManifest()` reads `<root>/src/routeTree.gen.ts` and extracts route ids/paths (regex or the exported `routeTree` shape) → `ServerRouteInfo[]` / `RouteNode`.
- [ ] **Step 4:** Tools + cards (error list; route manifest tree). Wire the vite hook via the extension's server registration.
- [ ] **Step 5:** Run node test → PASS; manual: trigger a syntax error in the fixture and confirm `tanstack_build_errors` surfaces it.
- [ ] **Step 6:** Commit (`feat(extension-tanstack): server-half build errors + route manifest`).

---

### Task 8: serverFunctions — manifest list + `/_serverFn/*` trace ring → `tanstack_server_fn_trace`

**Files:** Create `src/server/serverfn-trace.ts`, `src/tool/server-fn-trace.ts` + card. Capability `serverFunctions: true`.

Spike facts: each server fn's client call is `GET /_serverFn/<base64({file,export})>`; a trace carries method, decoded `{file, export}`, status, duration. The build manifest (`@tanstack/server-functions-plugin`) lists functions.

- [ ] **Step 1:** Failing node test — feed the trace ring a synthetic `/_serverFn/<id>` request/response pair and assert `tanstack_server_fn_trace` returns a `ServerFnTrace` with the decoded name (`export`), `durationMs`, `status`.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement `serverfn-trace.ts`: a ring fed by a vite middleware that matches `/_serverFn/*` (decode the base64 path segment → `{file, export}`, time request→response). `list()` reads the server-functions manifest (or derives from observed ids). Add the tool + `traces(count)` client-less server method.
- [ ] **Step 4:** Card — trace table (name, file, ms, status).
- [ ] **Step 5:** Run node test → PASS; manual: client-navigate the fixture to `/about` and confirm a trace appears.
- [ ] **Step 6:** Commit (`feat(extension-tanstack): server-fn trace ring + tool`).

---

### Task 9: Testkit fake adapter, contract wiring, capabilities, discovery, gates

Ties the adapter to the `FrameworkAdapter` contract, ships the testkit fake the spec calls for, and runs all gates.

**Files:**
- Create: `packages/extension-testkit/src/framework-fake.ts` + export it.
- Modify: `packages/extensions/tanstack/src/index.ts` — assemble the full `FrameworkAdapter` via `defineFrameworkAdapter` with `capabilities: {queryCache: true, serverFunctions: true, rscPayload: false, isr: false, middleware: false}` and the client/server surfaces; confirm it type-checks against the contract.
- Create: `.changeset/tanstack-inspection-adapter.md`.

- [ ] **Step 1:** Write `makeFakeFrameworkAdapter(overrides)` returning a complete `FrameworkAdapter` (all core surfaces + `queryCache`/`serverFunctions` since a fake advertises them) with canned data; a unit test asserts it satisfies `defineFrameworkAdapter` and every method returns well-formed shapes.
- [ ] **Step 2:** Run → PASS.
- [ ] **Step 3:** In `src/index.ts`, construct the real `FrameworkAdapter` object (server-side surfaces from Tasks 7-8; client-side surfaces are reached over `ctx.page`, so the adapter's `client` methods on the server are thin `ctx.page` wrappers used by the tools). Assert `pnpm --filter @conciv/extension-tanstack typecheck` passes against the contract.
- [ ] **Step 4:** Ensure the extension's tools carry their prose in `description` (lazy discovery reveals them) and register through the standard extension path so they ride lazy discovery + Code Mode (no per-tool `codeMode` flag needed — all extension tools are bound). No `approval: 'ask'` on any TanStack tool (reads + navigation only; confirm none destroy user content).
- [ ] **Step 5:** Add the changeset:
```md
---
'@conciv/extension-tanstack': patch
---
Add the TanStack Router/Start inspection adapter: agent tools for router state, route tree, loader data, query cache, navigation/invalidation, dev-server build errors, route manifest, and server-function traces, each with a render card.
```
- [ ] **Step 6: Full gates.**
Run: `pnpm typecheck && pnpm build && pnpm test`.
Run: `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED.
- [ ] **Step 7: Commit** (`feat(extension-tanstack): framework-adapter contract wiring, testkit fake, changeset`).

---

## Self-Review

- **Spec coverage (design §2):** router state/tree/loader/query-cache reads (Tasks 3-5), navigate/invalidate/preload/reset actions (Task 6 — preload/reset-error can fold into Task 6 as extra client methods if wanted), server vite-plugin surface: routeTree.gen + build/HMR errors (Task 7), server-fn traces (Task 8). Contract + capabilities + fake (Tasks 1, 2, 9). Push events (design §5) are cross-framework and out of this plan — the HMR/error ring in Task 7 is the TanStack feeder; the unified `FrameworkEvent` delivery pipeline is a separate plan.
- **Bridge:** every client read rides `ctx.page({kind:'framework',...})` (Task 1) — no undefined mechanism.
- **Type consistency:** client method names (`routerState`, `routeTree`, `loaderData`, `navigate`, `invalidate`, query methods) are used identically in the client (Tasks 2,4,5,6) and the `method:` field of each tool. `CacheEntry`/`RouteMatch`/`RouteNode`/`AppError`/`ServerFnInfo`/`ServerFnTrace` come from `@conciv/protocol/framework-types` (§1, shipped).
- **Open item flagged for implementation:** whether the extension server context exposes the `BundlerBridge` / vite server (Task 7 Step 3) — if not, that's new wiring to thread through extension server registration, called out rather than assumed.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-21-tanstack-inspection-adapter.md`.
