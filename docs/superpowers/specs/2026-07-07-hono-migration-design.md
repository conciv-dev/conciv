# Migration: h3 + srvx → Hono

Date: 2026-07-07
Status: Approved (design), pending implementation plan

## Goal

Remove `h3`, `srvx`, and `crossws` from every package under `packages/*`. Replace with a full
Hono stack:

- Hono as the HTTP framework.
- `@hono/node-server` as the server runtime (also provides native WebSocket).
- `ws` for the Node WebSocket server.
- `hono/streaming` (`streamSSE`) for Server-Sent Events.
- End-to-end typed RPC (`hc<AppType>()`) for the only HTTP boundary that exists: widget → core.

Example apps under `apps/*` are out of scope and untouched.

### Success criteria

- `grep -rn "h3\|srvx\|crossws" packages --include=*.ts --include=*.json | grep -v node_modules`
  returns nothing.
- `pnpm typecheck && pnpm build && pnpm test` pass.
- `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
  (removed deps and deleted files should appear only as cleanups).

## Non-goals

- No change to the MCP protocol. The agent (claude CLI) reaches core via MCP-over-HTTP at
  `/api/mcp`; that transport speaks MCP, not Hono's `hc` client, and stays as-is.
- No server-to-server RPC. There is no server-to-server HTTP in this repo. The only HTTP client is
  the browser widget; extensions mount in-process on the same app and already communicate by direct
  function calls.
- No example-app changes.
- No back-compat shims (pre-release v0).

## Context: what uses h3/srvx today

- Runtime deps: `h3@2.0.1-rc.22` (an unreleased RC — a primary motivation to move), `srvx`
  (server), `crossws` (WebSocket).
- h3 API surface actually used is small: `new H3()` + `app.get/post/use`, `H3Event`,
  `readValidatedBody` (24×), `handleCors` (2×), `withBase` (4×), `defineWebSocketHandler` (2×).
- h3 v2 is already Web-standard fetch: handlers read `event.req.headers.get(...)` and return
  `new Response(...)`. The migration to Hono is therefore mechanical, not architectural.
- `srvx` is used by: `core` (`engine.ts` `serve`, `ws.ts` type), `harness-testkit`
  (`create-testkit.ts`), several `core` tests, `plugin` test, and terminal test helpers. All call
  `serve({fetch: app.fetch, ...})`, so `@hono/node-server`'s `serve()` is a near drop-in.

## Package dependency graph (verified)

Today:

- `@conciv/api-client` → `@conciv/protocol` only.
- `@conciv/extension` → `@conciv/api-client` (imports `SessionClient`, `RequestMeta` types — nothing
  else).
- `@conciv/core` → `@conciv/extension`.
- `@conciv/widget` → `@conciv/api-client` + `@conciv/protocol` (dependencies), `@conciv/core`
  (devDependency, types only — core is a server package and must never enter the widget bundle).
- `defineClient` is called by the widget, `extensions/terminal` (`terminal-actions.tsx`),
  `extension-testkit` (host-runtime), and widget/api-client tests.

Constraint this creates: extensions can never name `Client<AppType>` (needs core;
`extension → core → extension` is a hard cycle). So the client type extensions receive must be a
flat, hand-declared interface living below core.

Target graph:

- `SessionClient` and `RequestMeta` become explicit interfaces in `@conciv/protocol` (plain function
  types, no solid-js import). `@conciv/extension` drops its `@conciv/api-client` dependency.
- `@conciv/api-client` gains a **devDependency (type-only import)** on `@conciv/core` for `AppType`.
  Acyclic: `api-client → core → extension → protocol`.
- `defineClient`'s declared return type is the protocol `SessionClient` interface, so `AppType`
  never appears in api-client's published `.d.ts` — hc types are compiled away at build time
  (Hono's own recommended perf pattern for large apps).

Full deletion of api-client was considered and rejected: it is the only package sitting above core
(can see `AppType`) yet below widget/terminal/testkit; deleting it would duplicate the hc binding +
session header + response validation in three places and force an hc-shaped hand-written type into
protocol.

## Design

### 1. Dependency changes

Remove `h3`, `srvx`, `crossws`. Add `hono`, `@hono/node-server`, `@hono/zod-validator`, `ws`,
`@types/ws`. Manifests touched: `core`, `extension`, `extensions/terminal`, `extensions/test-runner`,
`harness-testkit`.

### 2. Framework mapping (mechanical)

| h3                                 | Hono                                                            |
| ---------------------------------- | --------------------------------------------------------------- |
| `new H3()` / `app.get/post/use`    | `new Hono()` / same                                             |
| `H3Event`, `event.req`             | `Context c`, `c.req.raw` / `c.req.header()`                     |
| `readValidatedBody(event, schema)` | `zValidator('json', schema)` middleware + `c.req.valid('json')` |
| `handleCors`                       | `hono/cors`                                                     |
| `withBase(prefix, sub.handler)`    | `app.route(prefix, sub)`                                        |
| return `new Response()`            | same                                                            |

`zValidator` validates **inputs only** (`json`/`query`/`param`/`header`/`form`). Hono never
schema-validates responses; response _types_ are inferred from `c.json(x, status)`.

### 3. WebSocket (crossws → Hono native)

- Delete `packages/core/src/api/ws.ts` entirely. This removes the `declare global { interface
Response { crossws } }` augmentation and the manual `server.node.server.on('upgrade')` wiring.
- Terminal `/tty` handler:
  `defineWebSocketHandler({ open, message, close })` →
  `upgradeWebSocket((c) => ({ onOpen, onMessage, onClose }))`.
  `peer.send` → `ws.send`; `message.text()` → `event.data`;
  `peer.request` / query parsing → `c.req` / `c.req.query()`.
- WS is injected via `serve({ fetch, websocket })` using `ws`'s `WebSocketServer({ noServer: true })`.
  The origin guard becomes normal Hono middleware on the WS route (no separate crossws `upgrade`
  hook).

### 4. Streaming / SSE (hand-rolled → `hono/streaming`)

- Delete `packages/core/src/api/sse.ts` (manual `ReadableStream` + `TextEncoder` + headers).
- Long-lived streams (chat stream, tty SSE) become:

  ```ts
  app.get('/path', (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = start((data) => stream.writeSSE({data: JSON.stringify(data)}))
      stream.onAbort(unsubscribe)
      await new Promise<void>(() => {})
    }),
  )
  ```

- Caveat honored: if a `streamSSE` callback throws after the stream has started, Hono's `onError`
  will not fire. Stream callbacks must resolve/close on error paths, never throw mid-stream.

### 5. Server runtime (srvx → @hono/node-server)

- `packages/core/src/engine.ts`: `serve({fetch})` (srvx) → `@hono/node-server` `serve()`. Adapt the
  post-listen accessors: srvx `server.ready()` / `server.url` / `server.close(true)` → Node
  `http.Server` equivalents (`serve`'s callback / `.address()` for port / `.close()`).
- Same swap in `packages/harness-testkit/src/create-testkit.ts`, the `core` tests that spin up srvx
  servers, the `plugin` widget-inject test, and terminal test helpers.

### 6. RPC (widget → core)

- **Route restructuring**: each `registerXRoutes(app): void` becomes a factory that returns a
  **chained** Hono app so types can be inferred:

  ```ts
  export const makeChatRoutes = (deps: ChatDeps) =>
    new Hono()
      .post('/session/resolve', zValidator('json', ResolveRequestSchema), (c) => c.json(...))
      .get('/sessions', (c) => c.json(...))
  ```

  Core composes them and exports the union type:

  ```ts
  const routes = app.route('/api/chat', makeChatRoutes(deps)).route('/api/editor', makeEditorRoutes(deps)) // ...
  export type AppType = typeof routes
  ```

- **`AppType` must be static**, which imposes two rules:
  - The bridge routes (`/api/server/*`, today mounted only `if (opts.bridge)`) are always chained;
    handlers guard on bridge presence and return 503 when absent.
  - Extension sub-apps (mounted dynamically at `/api/ext/<slug>`) are excluded from `AppType`.
    Extensions talk to their own routes with their own fetch/EventSource, as today.

- **Client**: delete `packages/api-client/src/transport.ts` (hand-rolled route table).
  `defineClient` stays in `@conciv/api-client` as the single client factory, reimplemented over
  `hc<AppType>()` internally (`AppType` via type-only import from core). It keeps the session-header
  signal and the SSE `EventSource` helper, exposes the same flat methods, and its return type is
  pinned to the protocol `SessionClient` interface. All existing `defineClient({apiBase})` call
  sites (widget, extensions/terminal, extension-testkit, tests) keep working unchanged.
- **Response validation kept**: a thin wrapper re-parses `res.json()` through the existing
  `@conciv/protocol` zod schemas. `expectTypeOf` pins the hc-inferred response type equal to the zod
  output type so the two cannot drift. This preserves the production-grade guarantee that a malformed
  server response is caught, while still deleting the hand-rolled transport.
- **Perf mitigation** (Hono docs warn IDE slows as route count grows): the widget consumes core's
  **built** `.d.ts` (turbo already builds core before the widget), and the exported type is split per
  route-group rather than a single mega-union if `tsserver` drags.

### 7. Extension public API (breaking, v0-acceptable)

- `ServerApi.app: H3` → `ServerApi.app: Hono`.
- Extension route handlers migrate `readValidatedBody` → `zValidator` + `c.req.valid`.
- `SessionClient` and `RequestMeta` move to `@conciv/protocol` as explicit interfaces;
  `@conciv/extension` imports them from there and drops its `@conciv/api-client` dependency.
- Consumers to update: `extensions/terminal` (server `/tty` + SSE, client `defineClient` usage),
  `extensions/test-runner` (server routes + SSE), `extension-testkit` host-runtime.

### 8. MCP endpoint

`/api/mcp` uses `WebStandardStreamableHTTPServerTransport`, which already returns a `Response`. Keep
it. Only the `event` → `c` accessor changes. It is not part of the RPC surface.

## Testing & verification

- Widget integration tests run in a real browser and load the prebuilt bundle; rebuild `core` +
  `widget` via turbo before running. WS and SSE ITs updated for the new server type and handler
  shapes.
- Gate sequence: `pnpm typecheck && pnpm build && pnpm test`, then
  `pnpm exec fallow audit --changed-since main --format json` (fix anything INTRODUCED).
- Final grep gate must return nothing:
  `grep -rn "h3\|srvx\|crossws" packages --include=*.ts --include=*.json | grep -v node_modules`.

## Blast radius (files)

- `packages/core/src`: `app.ts`, `extension-app.ts`, `engine.ts`, and all of
  `api/**` (`cors.ts`, `ws.ts` [delete], `sse.ts` [delete], `chat/*`, `mcp/mcp.ts`, `page/*`,
  `server/server.ts`, `editor/editor.ts`).
- `packages/api-client/src`: `transport.ts` deleted, `api-client.ts` rewritten over `hc`.
- `packages/protocol/src`: new `SessionClient` / `RequestMeta` interfaces.
- `packages/extension/src/types.ts`: `app` type swap + client types imported from protocol;
  api-client dependency removed from its manifest.
- `packages/extensions/terminal/src`: `server.ts`, `runner`/client SSE + WS.
- `packages/extensions/test-runner/src`: `server.ts`, `runner/sse.ts`.
- `packages/harness-testkit/src/create-testkit.ts`.
- `packages/widget/src`: client binding of `hc<AppType>()`.
- Tests across `core`, `plugin`, `extensions/terminal` that spin up srvx servers.
- `package.json` in `core`, `extension`, `extensions/terminal`, `extensions/test-runner`,
  `harness-testkit`.
