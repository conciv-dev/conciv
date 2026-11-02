# core/src

## Overview

Top-level engine modules. `start` resolves config, builds the Hono app with `makeApp`, binds a port (persisted, preferred or exact) and writes the endpoint files. `makeApp` mounts extensions, the tool registry, the chat plane, RPC, MCP, push and health routes. Supporting modules cover config resolution, the per-session page bus, the built-in tool registry, runtime re-exports and tool-card exports.

## Interface

- `start(opts: StartOpts): Promise<Engine>` (`start.ts`): `Engine` = {port, apiBase, agentBase, loginToken, hub, stop, cfg, extensionContexts}
- `StartOpts`, `PortRequest` = {exact}|{preferred}, `composeSystemPrompt` (`start.ts`)
- `makeEngineGate` / `agentPathFor` (`engine-gate.ts`): the `/t/<token>` fetch gate `makeApp` returns as `MadeApp.fetch`
- `makeApp(opts): Promise<MadeApp>` / `withBuiltinExtensions` / `slug` / `HealthSchema` / `AppType` (`app.ts`)
- Routes (`app.ts`): `GET /health`, `POST /api/shutdown`, chat-plane routes and WS, push routes and WS, `${RPC_PREFIX}/*`, `/api/mcp`, optional `NATIVE_PAGE_PATH`, `/api/ext/<slug>` per extension
- `resolveConfig(options, root)` / `ResolvedConcivConfig` / `defineConfig` (`config.ts`)
- `CoreRuntime`, `EngineScope`, `SessionScope`, `ScopedToolCall`, `session` (`runtime.ts`)
- `CodeRunCard`, `codeRunTool`, `EXECUTE_TOOL_NAME`, `coreToolCards` (`cards.tsx`)
- `makePageBus(timeoutMs=5000)` / `pageQueryStream` / `makeJournal` / `PageEnv` (`page-bus.ts`)
- `makeBuiltinRegistry(deps)` / `toolFailureFromPage` (`tool-registry.ts`)
- Subdirectories:
  - api: [./api/README.md](./api/README.md) - MCP, push and native-page routes
  - cards: [./cards/README.md](./cards/README.md) - execute_typescript tool card
  - editor: [./editor/README.md](./editor/README.md) - open source locations
  - lib: [./lib/README.md](./lib/README.md) - CORS, dev endpoint, staleness, state paths
  - runtime: [./runtime/README.md](./runtime/README.md) - session and engine scopes
  - sessions: [./sessions/README.md](./sessions/README.md) - session rows and event bus

## Invariants

- `assertAccessToken` (`start.ts`): accessToken must be a UUID
- `reservePort` (`start.ts`): up to 4 attempts 300ms apart, retrying only on EADDRINUSE; `exact` binds or throws, `preferred` falls back to port 0 with a warning
- `makeEngineGate` (`engine-gate.ts`): every route except the hub base, `/health` and `/native*` needs `/t/<token>` with the engine token or (unless `browserLogins: false`) a trusted browser login; anything else gets a 401 with CORS headers
- `start` (`start.ts`): the engine token is `accessToken` or a fresh UUID; with an accessToken browser logins are refused; `agentBase` carries the token and is written to `mcp-endpoint.json` and `CONCIV_TOKEN`; a failed bind or endpoint write disposes the app
- `logError` (`lib/debug.ts`): strips `/t/<token>` and `devframe_auth_token` from every engine log line
- `assertUniqueExtensionSlugs` / `assertUniqueCapabilityNames` (`app.ts`): throw on slug or tool-name collisions
- `requireHarness` (`app.ts`): defaults to 'claude' and throws if none is registered
- `mountExtension` (`app.ts`): a failing extension `__server` is logged and skipped
- `registryBackedTool` (`app.ts`): only `binding === 'server'` tools are exposed; mutating when approval is 'ask' or meta.mutating
- `onError` (`app.ts`): HTTPException keeps its status; anything else is 500 'internal error'
- `/api/shutdown` (`app.ts`): 404 without `onShutdown`
- `resolveConfig` (`config.ts`): session ids must pass `isSessionId` / `isHarnessSessionId`; harness defaults to 'claude'
- `ask` (`page-bus.ts`): 'no-widget' without a subscriber, 'timeout' on expiry
- `runClientTool` (`tool-registry.ts`): mutating page tools append a journal entry after success

## Side Effects

- `start` (`start.ts`): writes the system prompt file, the persisted-port file and the MCP connect endpoint file; binds 127.0.0.1
- `start` (`start.ts`): with nativePageDir writes the dev-endpoint file; `stop` removes it
- `harnessEnv` (`start.ts`): reads process.env and adds CONCIV_SESSION_ID for child harness processes
- `makeApp` (`app.ts`): opens the SQLite DB, sweeps empty rows, records usage, titles and native ids; runs extension `__server` factories; the chat plane spawns harness processes
- `resolveConfig` (`config.ts`): reads CONCIV_WIDGET_URL, CONCIV_STATE_ROOT, CONCIV_HARNESS, CONCIV_HARNESS_BIN, CONCIV_CLAUDE_PATH, CONCIV_SESSION_ID, CONCIV_CLAUDE_SESSION_ID
- `makeJournal` (`page-bus.ts`), `storeCapture` (`tool-registry.ts`): write page changes and captures to the DB

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
