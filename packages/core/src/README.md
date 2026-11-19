# core/src

## Overview

Top-level engine modules. `start` resolves config, binds a port (persisted, preferred or exact), builds the Hono app with `makeApp` and writes the endpoint files. `makeApp` starts the plugin host and mounts the tool registry, the chat plane, RPC, MCP, push and health routes. Supporting modules cover config resolution, the per-session page bus, the built-in tool registry, runtime re-exports and tool-card exports.

## Interface

- `start(opts: StartOpts): Promise<Engine>` (`start.ts`): `Engine` = {port, agentToken, trustBrowser, stop, cfg}
- `StartOpts`, `PortRequest` = {exact}|{preferred}, `composeSystemPrompt` (`start.ts`)
- `makeApp(opts): Promise<MadeApp>` (`makeApp` builds the plugin host's supervisor before it resolves, so activation is under way before any request; `MadeApp.awaitActivation` only waits for the first generation to be active); `MakeAppOpts.eventHeartbeatIntervalMs` (optional, milliseconds, default 15 000) sets how often `event.subscribe` sends its `server.heartbeat` frame; `MakeAppOpts.pageReplyTimeoutMs` (optional, milliseconds, default 5 000) sets how long a browser tab has to answer a page query that declares no timeout of its own, and to accept a page action queue; `MakeAppOpts.queuedActionTimeoutMs` (optional, milliseconds, default 7 000) sets how long each queued page action has to confirm once the tab reaches it; `MakeAppOpts.permissionSyncTimeoutMs` (optional, milliseconds, default 10 000) sets how long granting a tab's page permissions may take before its attach is refused; none is a config-file key nor a `start()` option / `slug` / `HealthSchema` / `AppType` (`app.ts`)
- Routes (`app.ts`): `GET /health` (`{ok, harness, engine: {stale}, id}`, `id` = the per-start `engineId`), `POST /api/shutdown`, chat-plane routes and WS, `GET RPC_WS_PATH` (`/rpc-ws`, the browser's one oRPC socket, gated per connection by `rpcSocketGate`), `${RPC_PREFIX}/*` (the HTTP oRPC handler for node callers: CLI, tests, `makeRpcClient`), `/api/mcp`, optional `NATIVE_PAGE_PATH`
- `resolveConfig(options, root)` / `ResolvedConcivConfig` / `defineConfig` (`config.ts`)
- `CoreRuntime`, `EngineScope`, `SessionScope`, `ScopedToolCall`, `session` (`runtime.ts`)
- `CodeRunCard`, `codeRunTool`, `EXECUTE_TOOL_NAME`, `coreToolCards` (`cards.tsx`)
- `makeBuiltinRegistry(deps)` / `toolFailureFromPage` (`tool-registry.ts`)
- `EventFeed` (`event-feed.ts`): opencode's `server/src/event-feed.ts` copied on `Bus.listen`: `layer`, `make(observe, {capacity?, encode?})`, `Service`, `subscribe(types?)` (a scoped stream of encoded events), `encode`, `SubscriberCapacity` (4096), `SubscriberOverflowError`, `EncodingError`. One edit from the source: it yields each encoded event object (the contract's `EventEnvelopeSchema`), not an SSE text frame, since the transport is oRPC; `encode` uses the host's own Effect definitions (`EventManifest.ServerDefinitions`, `Rpc.eventDefinition` for `rpc.*`)
- Subdirectories:
  - api: [./api/README.md](./api/README.md) - MCP, tabs, push and native-page routes
  - cards: [./cards/README.md](./cards/README.md) - execute_typescript tool card
  - editor: [./editor/README.md](./editor/README.md) - open source locations
  - lib: [./lib/README.md](./lib/README.md) - CORS, dev endpoint, staleness, state paths
  - page: [./page/README.md](./page/README.md) - page bus, change journal and page action queues
  - runtime: [./runtime/README.md](./runtime/README.md) - session and engine scopes
  - sessions: [./sessions/README.md](./sessions/README.md) - session rows and event bus

## Invariants

- `assertAccessToken` (`start.ts`): accessToken must be a UUID
- `reservePort` (`start.ts`): up to 4 attempts 300ms apart, retrying only on EADDRINUSE; `exact` binds or throws, `preferred` falls back to port 0 with a warning
- `start` (`start.ts`): with an accessToken the app is mounted under `/t/<token>`. Start order: refuse a harness id nothing registers (`requireHarness`, skipped when a `harness` adapter is passed), bind the port (and write `server.json`) with a handler that waits for the app, then `makeApp`, then the MCP endpoint file, the dev endpoint and the home-db row, then wait for the first plugin activation; `start` resolves only after it. `makeApp` runs only once the port is known. A request that arrives before the app is made (a CLI reads `server.json` as soon as it exists) waits for it and is then served by it; nothing runs on a half-made app. A failed bind fails start before anything is built; a failed `makeApp` fails every waiting request (hono answers 500), closes the listener and rethrows; a failed endpoint write closes the listener and disposes the app. Every failed start after the bind also puts `server.json` back as it found it (the previous record, or no file), but only while the file still holds this start's record, so an engine already running in the project stays reachable. A plugin whose `setup` throws is listed `failed` and does not stop the engine
- `makeEngineGate` (`engine-login.ts`): only `OPEN_PATHS` (`/health`, the three `/rpc/auth/*` procedures, `/native`) pass without a token; a token comes as `Authorization: Bearer` (browsers) or the `/t/<token>` path (agents, CLI, MCP), which is forwarded as a bearer header
- `trustingUpgrade` (`engine-login.ts`): every engine socket (chat, push, the session terminal) is admitted by a bearer header or by a first `{type: 'conciv:trust', token}` frame; anything else is closed with 1008, and a revoke closes every socket held by that token with 1008
- `rpcSocketGate` (`engine-login.ts`): the rpc socket opens untrusted and serves only the three `auth.*` procedures (anything else answers `UNAUTHORIZED`) until a bearer header, a `{type: 'conciv:trust', token}` frame, or a successful `auth.trust` / `auth.exchange` on that socket trusts it; a revoke closes it with 1008 like every other engine socket
- `makeAuthRouter` (`engine-login.ts`): `auth.exchange` answers `{refused: 'mismatch' | 'expired'}`; five wrong codes retire the printed code
- `auth.issueCode` (`engine-login.ts`): answers `{code, expiresAt}` only when the request's bearer token is the engine token (`ConnectionTrust.isEngine`), else `FORBIDDEN`, so a logged-in browser cannot invite another; it is not an `OPEN_PATHS` procedure, so the engine gate refuses it without a trusted token. `makeCodeStore.issue()` makes the code without printing it and `request()` prints the banner on top of the same path; one live code at a time, so issuing a link retires a code a human was about to type
- `assertUniqueCapabilityNames` (`app.ts`): throws on tool-name collisions
- `requireHarness` (`lib/require-harness.ts`): `start` calls it before it binds the port, unless the caller passed its own `harness` adapter, and `makeApp` calls it for a config with no adapter; a harness id nothing registers throws `conciv: unknown harness "<id>". Known harnesses: <registered ids>.`, with no fallback to claude (the id defaults to 'claude' only when none is given)
- `admitOutside` (`app.ts`): the per-session consent for an outside (hub-origin) call; with `hubAccess` `open` it admits every live session at once, but a deleted session (non-null `deletedAt`) still goes to the plane's `admitCall`, which refuses it with `session "<id>" does not exist` before anything of the call runs or is recorded in that session's chat
- `onRunEnd` (`app.ts`): publishes how the run ended to the plugin host, then, for a completed run with no page-queue result owed, the plugin `experimental.idle` trigger as a fiber kept per session (an Effect `FiberMap` keyed by session id) and waits for it to end before the run settles, so `hydrate` still waits for the hook; the session runtime's Stop and Compact and engine `dispose` interrupt that fiber; a hook that fails is recorded as the run's error and published as `conciv.idle-failed`, an interrupted one is not (the run stays completed with no error); the page-queue follow-up of that run end runs after it either way
- `detectedHarnesses` (`app.ts`): only harnesses whose binary is on `PATH` join the boot harness as switch targets; a config directory alone does not count
- `registryBackedTool` (`app.ts`): only `binding === 'server'` tools are exposed; mutating when approval is 'ask' or meta.mutating
- `onError` (`app.ts`): HTTPException keeps its status; anything else is 500 'internal error'
- `/api/shutdown` (`app.ts`): 404 without `onShutdown`
- `resolveConfig` (`config.ts`): session ids must pass `isSessionId` / `isHarnessSessionId`; harness defaults to 'claude'
- `runClientTool` (`tool-registry.ts`): mutating page tools append a journal entry after success
- `EventFeed` (`event-feed.ts`): only public events pass (`server.connected`, `EventManifest` server events, `rpc.*`), so internal events take no subscriber capacity; a subscriber with `types` gets only those types (filtered on the server); each event is encoded once and the same object goes to every subscriber; a subscriber whose queue holds 4096 undelivered events is removed and its stream fails with `SubscriberOverflowError`, the others go on; an encoding failure is logged and fails every current subscriber with `EncodingError`, later subscribers are served; a subscriber is removed and its queue shut down when its scope closes

## Side Effects

- `start` (`start.ts`): writes the system prompt file, the persisted-port file and the MCP connect endpoint file; binds 127.0.0.1
- `start` (`start.ts`): with nativePageDir writes the dev-endpoint file; `stop` removes it
- `start` (`start.ts`): registers `{id, pid, root, apiBase}` in the home db (`homeDir`, else `CONCIV_HOME`, else the platform folder) after the port is known, checks the other rows once in the background, and `stop` retires the row; every home db failure is logged and never stops the engine
- `stop` (`start.ts`): closes the listener first, then disposes the app; `dispose` (`app.ts`) first aborts the engine's one `AbortController` (the signal every model listing got) and waits for each harness's in-flight listing to settle, for at most `GROUP_EXIT_TIMEOUT_MS` (5 s, the grace `@conciv/ai/server` gives a stopping CLI) per harness, so a listing's child (`opencode models --verbose`) that exits on SIGTERM has exited before anything else closes and no later step can start one; a listing that has not settled by then (a `models` function that ignores the signal) is named once through `print` and the close goes on without it; then it closes the plugin RPC (pending calls fail `rpc.unavailable`), closes the plugin registry (cleanups run, later plugins first), interrupts every in-flight `experimental.idle` trigger and waits for it to end (so ending the live runs next finds them settled), closes permissions (pending asks are rejected), ends every live run, disposes the plugin host runtime, then closes the database; each step runs even when an earlier one fails and the failures are rethrown as one `AggregateError` (`lib/shutdown.ts:runInOrder`)
- `harnessEnv` (`start.ts`): reads process.env and adds CONCIV_SESSION_ID for child harness processes
- `makeApp` (`app.ts`): opens the SQLite DB, sweeps empty rows, records usage, titles and native ids; the chat plane spawns harness processes; a run a previous engine left running is marked `aborted` while the chat plane is created, and its turn-end hooks run then, before any page queue can exist, so no follow-up turn is started for it
- `resolveConfig` (`config.ts`): reads CONCIV_STATE_ROOT, CONCIV_HARNESS, CONCIV_HARNESS_BIN, CONCIV_CLAUDE_PATH, CONCIV_SESSION_ID, CONCIV_CLAUDE_SESSION_ID
- `storeCapture` (`tool-registry.ts`): writes captures to the DB

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
