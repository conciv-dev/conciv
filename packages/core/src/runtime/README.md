# core/src/runtime

## Overview

Builds the per-session and engine-wide scope objects that join the tool registry, page bus, session event bus, chat plane and DB, and an AsyncLocalStorage session scope so effectful calls run inside `runWithSession`.

## Interface

- `makeCoreRuntime(deps)` / `CoreRuntimeDeps` (`core-runtime.ts`): `CoreRuntime` with `forSession(id)` and `engine`
- `makeSessionPrimitives` / `SessionPrimitives` (`primitives.ts`): {stream, page, registry}
- `SessionScope` (`scope-types.ts`): {id, model, tools, page, stream, asks, captures, history, run}
- `EngineScope` (`scope-types.ts`): {catalog, staleness, symbolicate, navigation: {get, set}}
- `CoreRuntime`, `ToolCatalog`, `ScopedToolCall` (`scope-types.ts`)
- `runWithSession` / `session` (`session-context.ts`)
- `provideInstructionEntries` / `loadInstructionEntries` (`instruction-entries.ts`): the plugin `InstructionEntry` key on the plugin host's `KV` store, one row per session and key under the reserved prefix `conciv.instruction-entry:<sessionId>:`, a removed entry kept as `{value: null, removed: true}`; `loadInstructionEntries` turns a session's rows into one instruction source each (`api/<key>`), which `pluginInstructions` (`permission-cards.ts`) combines with code mode and skills
- `provideHarnessSource` / `provideBundlerSource` / `provideExtensionSlugs` / `provideApp` / `provideConfiguredPolicies` / `provideGlobalRoots` (`plugin-sources.ts`): the plugin host's `HarnessSource` (with `mcpUrl` read on each access from the token-scoped base), `BundlerSource`, `ExtensionSlugs`, `App` (core's package version) and `ManagedPolicy.ConfiguredPolicies` (the config's `policies` decoded with `ConfigPolicy.Info`) and `Global` (`cache` and `state` under conciv's home, made when the layer is built) as layers
- `provideServersSource({home, engineId})` (`servers-source.ts`): the plugin host's `ServersSource`, every running conciv engine on the machine: the home database's live engine rows after `checkEngines` (`@conciv/db`), so a dead row is retired first and an unreachable one is listed with `connected: false`. One ref per id, built once; `name` is the folder name of the row's `root`, `url` the row's `apiBase`, no `password`, `local` true, `builtin` when the id is this engine's, `compatible` true, `connected` when the last check reached it, `client` the contract client over `apiBase` (`makeRpcClient`) plus `rpc: makeRpc(plugin.call, plugin.events)`, one per `apiBase`, no origin header (an engine-to-engine call is trusted, no consent prompt). `list()` and `get()` are synchronous over the last snapshot, empty until the first check after the first read
- `provideHarnessModels(harness)` (`harness-models.ts`): the plugin host's `Model` key from the harness's model list as `buildHarnessMenuEntry` (`api/rpc/sessions.ts`) resolves it, each model `Model.Info.default(harness id, model id)` with the harness's `name`, `contextWindow` (as `limit.context`) and `disabled` (as `enabled: false`) laid over it; `available` lists the enabled models of the asked types (chat when none are asked), `default` is the harness's default model when it is listed and enabled, else the first enabled one
- `provideSessions(started)` (`plugin-sessions.ts`): the plugin host's `Session` key on conciv's own session rows. `started()` hands it core's chat context, runtime, session search and plugin host, read at each call because they exist only later in `makeApp`. `get` is the row (`rowById`; missing or deleted fails `Session.NotFoundError`); `list` pages this project's sessions through `listedSessionPage`, or `searchedSessionPage` for a `search` term (`api/rpc/sessions.ts`), limit 30 by default and 1 to 100, its `next` cursor the JSON of conciv's own list cursor (a cursor that does not parse fails `Session.InvalidListCursorError`), no `previous`; `create` is `createChatSession` on the default harness, then `renameSession`, `setMetadata`, `setPermissions` and the model switch for the inputs given (`null` is not given); `agent` other than `build` and a model the default harness does not list are refused before anything is written, as a defect (the key's `create` has no error for them); `remove` is `deleteSession`; `rename` is `renameSession`; `setMetadata` / `setPermissions` copy the input through the row schema's field and write the row; `switchAgent` accepts `build` and fails `Session.AgentNotFoundError` for any other agent; `switchModel` fails `Session.NotFoundError` unless `providerId` is the session's harness id and the harness lists the model enabled (and, with a `variant`, lists it among that model's efforts), then is `switchSessionModel` and, for a `variant`, `switchSessionEffort`; `compact` is the session runtime's `run.compact` (native `/compact` or the fallback summary turn), answering a `compaction` dated when it was asked, with no `id` or `delivery`; `wait` is the plane's `settled`; `interrupt` is the plane's `stop` and answers its `stopped`, `resume` changing nothing (no steering inbox). `SessionInfo`: `model` `{id: row model, providerId: harness id, variant: row effort}` when the row has a model, `agent` `build`, `cost` and `tokens` from the row's usage (0 when unknown), `time.updated` the row's, `title`, `metadata` and `permissions` the row's, `location.directory` the row's cwd; `projectId` and `time.created` undefined, the rest absent

## Invariants

- `session` (`session-context.ts`): throws `MISSING_SESSION` when no scope is set on the async call path
- `established` (`core-runtime.ts`): every effectful scope method except tools.has, tools.catalog, page.connected and run.live runs inside `runWithSession`
- `navigation.set` (`core-runtime.ts`): a write dated more than 24h ahead is not applied; the upsert is last-writer-wins on `updatedAt` in a single row with id 'navigation'
- `makeSessionScope` (`core-runtime.ts`): the catalog view is gated by `registry.whenPageConnected`; `model` is read once at scope creation

## Side Effects

- `provideInstructionEntries` (`instruction-entries.ts`): `KV` reads and writes on the project database
- `provideGlobalRoots` (`plugin-sources.ts`): makes the `cache` and `state` directories and sets the host's `Flock` state root when the layer is built
- `provideServersSource` (`servers-source.ts`): nothing runs until a plugin first reads `servers`; then, inside the layer's scope, a watch of the home folder (`homeDbReads`, `lib/home-db-watch.ts`) re-checks on every change of the engine rows, and a health re-check runs every 10 s (opencode's `SERVER_HEALTH_POLL_MS`); checks run one at a time; closing the scope aborts the watch and stops the poll; a failed check is logged and keeps the last snapshot
- `provideHarnessModels` (`harness-models.ts`): each call lists the harness's models (a failed listing is logged and answers no models)
- `navigation` get/set (`core-runtime.ts`): SQLite select and upsert on the `navigation` table
- `captures.store` (`core-runtime.ts`): `writeToolCapture` to the DB
- `session-context.ts`: module-level AsyncLocalStorage

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
