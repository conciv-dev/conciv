# core/src

## Overview

Top-level engine modules. `start` resolves config, builds the Hono app with `makeApp`, binds a port (persisted, preferred or exact) and writes the endpoint files. `makeApp` mounts extensions, the tool registry, the chat plane, RPC, MCP, push and health routes. Supporting modules cover config resolution, the per-session page bus, the built-in tool registry, runtime re-exports and tool-card exports.

## Interface

- `start(opts: StartOpts): Promise<Engine>` (`start.ts`): `Engine` = {port, stop, cfg, extensionContexts}
- `StartOpts`, `PortRequest` = {exact}|{preferred}, `composeSystemPrompt` (`start.ts`)
- `makeApp(opts): Promise<MadeApp>` (`MadeApp.startPlugins` starts the plugin host's supervisor once and resolves when the first generation is active) / `withBuiltinExtensions` / `slug` / `HealthSchema` / `AppType` (`app.ts`)
- Routes (`app.ts`): `GET /health` (`{ok, harness, engine: {stale}, id}`, `id` = the per-start `engineId`), `POST /api/shutdown`, chat-plane routes and WS, push routes and WS, `GET RPC_WS_PATH` (`/rpc-ws`, the browser's one oRPC socket, gated per connection by `rpcSocketGate`), `${RPC_PREFIX}/*` (the HTTP oRPC handler for node callers: CLI, tests, `makeRpcClient`), `/api/mcp`, optional `NATIVE_PAGE_PATH`, `/api/ext/<slug>` per extension
- `resolveConfig(options, root)` / `ResolvedConcivConfig` / `defineConfig` (`config.ts`)
- `CoreRuntime`, `EngineScope`, `SessionScope`, `ScopedToolCall`, `session` (`runtime.ts`)
- `CodeRunCard`, `codeRunTool`, `EXECUTE_TOOL_NAME`, `coreToolCards` (`cards.tsx`)
- `makeBuiltinRegistry(deps)` / `toolFailureFromPage` (`tool-registry.ts`)
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
- `start` (`start.ts`): with an accessToken the app is mounted under `/t/<token>`; a failed bind or endpoint write disposes the app; plugins start after the port is bound (so `ctx.harness.mcpUrl` is set before any `setup` runs) and `start` resolves only after their first activation; a plugin whose `setup` throws is listed `failed` and does not stop the engine
- `makeEngineGate` (`engine-login.ts`): only `OPEN_PATHS` (`/health`, the three `/rpc/auth/*` procedures, `/native`) pass without a token; a token comes as `Authorization: Bearer` (browsers) or the `/t/<token>` path (agents, CLI, MCP), which is forwarded as a bearer header
- `trustingUpgrade` (`engine-login.ts`): every engine socket (chat, push, extension sockets through `ServerApi.upgradeWebSocket`) is admitted by a bearer header or by a first `{type: 'conciv:trust', token}` frame; anything else is closed with 1008, and a revoke closes every socket held by that token with 1008
- `rpcSocketGate` (`engine-login.ts`): the rpc socket opens untrusted and serves only the three `auth.*` procedures (anything else answers `UNAUTHORIZED`) until a bearer header, a `{type: 'conciv:trust', token}` frame, or a successful `auth.trust` / `auth.exchange` on that socket trusts it; a revoke closes it with 1008 like every other engine socket
- `makeAuthRouter` (`engine-login.ts`): `auth.exchange` answers `{refused: 'mismatch' | 'expired'}`; five wrong codes retire the printed code
- `auth.issueCode` (`engine-login.ts`): answers `{code, expiresAt}` only when the request's bearer token is the engine token (`ConnectionTrust.isEngine`), else `FORBIDDEN`, so a logged-in browser cannot invite another; it is not an `OPEN_PATHS` procedure, so the engine gate refuses it without a trusted token. `makeCodeStore.issue()` makes the code without printing it and `request()` prints the banner on top of the same path; one live code at a time, so issuing a link retires a code a human was about to type
- `assertUniqueExtensionSlugs` / `assertUniqueCapabilityNames` (`app.ts`): throw on slug or tool-name collisions
- `requireHarness` (`app.ts`): defaults to 'claude' and throws if none is registered
- `onRunEnd` (`app.ts`): runs the extensions' `turnEnd` hooks, then, for a completed run with no page-queue result owed, the plugin `experimental.idle` trigger as a fiber kept per session (an Effect `FiberMap` keyed by session id) and waits for it to end before the run settles, so `hydrate` still waits for the hook; the session runtime's Stop and Compact and engine `dispose` interrupt that fiber; a hook that fails is recorded as the run's error and published as `conciv.idle-failed`, an interrupted one is not (the run stays completed with no error); the page-queue follow-up of that run end runs after it either way
- `detectedHarnesses` (`app.ts`): only harnesses whose binary is on `PATH` join the boot harness as switch targets; a config directory alone does not count
- `mountExtension` (`app.ts`): a failing extension `__server` is logged and skipped
- `registryBackedTool` (`app.ts`): only `binding === 'server'` tools are exposed; mutating when approval is 'ask' or meta.mutating
- `onError` (`app.ts`): HTTPException keeps its status; anything else is 500 'internal error'
- `/api/shutdown` (`app.ts`): 404 without `onShutdown`
- `resolveConfig` (`config.ts`): session ids must pass `isSessionId` / `isHarnessSessionId`; harness defaults to 'claude'
- `runClientTool` (`tool-registry.ts`): mutating page tools append a journal entry after success

## Side Effects

- `start` (`start.ts`): writes the system prompt file, the persisted-port file and the MCP connect endpoint file; binds 127.0.0.1
- `start` (`start.ts`): with nativePageDir writes the dev-endpoint file; `stop` removes it
- `start` (`start.ts`): registers `{id, pid, root, apiBase}` in the home db (`homeDir`, else `CONCIV_HOME`, else the platform folder) after the port is known, checks the other rows once in the background, and `stop` retires the row; every home db failure is logged and never stops the engine
- `stop` (`start.ts`): closes the listener first, then disposes the app; `dispose` (`app.ts`) closes the plugin RPC (pending calls fail `rpc.unavailable`), closes the plugin registry (cleanups run, later plugins first), interrupts every in-flight `experimental.idle` trigger and waits for it to end (so ending the live runs next finds them settled), closes permissions (pending asks are rejected), ends every live run, runs the extension disposers, disposes the plugin host runtime, then closes the database; each step runs even when an earlier one fails and the failures are rethrown as one `AggregateError` (`lib/shutdown.ts:runInOrder`)
- `harnessEnv` (`start.ts`): reads process.env and adds CONCIV_SESSION_ID for child harness processes
- `makeApp` (`app.ts`): opens the SQLite DB, sweeps empty rows, records usage, titles and native ids; runs extension `__server` factories; the chat plane spawns harness processes
- `resolveConfig` (`config.ts`): reads CONCIV_WIDGET_URL, CONCIV_STATE_ROOT, CONCIV_HARNESS, CONCIV_HARNESS_BIN, CONCIV_CLAUDE_PATH, CONCIV_SESSION_ID, CONCIV_CLAUDE_SESSION_ID
- `storeCapture` (`tool-registry.ts`): writes captures to the DB

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
