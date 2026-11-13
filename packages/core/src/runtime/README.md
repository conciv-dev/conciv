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
- `provideHarnessModels(harness)` (`harness-models.ts`): the plugin host's `Model` key from the harness's model list as `buildHarnessMenuEntry` (`api/rpc/sessions.ts`) resolves it, each model `Model.Info.default(harness id, model id)` with the harness's `name`, `contextWindow` (as `limit.context`) and `disabled` (as `enabled: false`) laid over it; `available` lists the enabled models of the asked types (chat when none are asked), `default` is the harness's default model when it is listed and enabled, else the first enabled one

## Invariants

- `session` (`session-context.ts`): throws `MISSING_SESSION` when no scope is set on the async call path
- `established` (`core-runtime.ts`): every effectful scope method except tools.has, tools.catalog, page.connected and run.live runs inside `runWithSession`
- `navigation.set` (`core-runtime.ts`): a write dated more than 24h ahead is not applied; the upsert is last-writer-wins on `updatedAt` in a single row with id 'navigation'
- `makeSessionScope` (`core-runtime.ts`): the catalog view is gated by `registry.whenPageConnected`; `model` is read once at scope creation

## Side Effects

- `provideInstructionEntries` (`instruction-entries.ts`): `KV` reads and writes on the project database
- `provideGlobalRoots` (`plugin-sources.ts`): makes the `cache` and `state` directories and sets the host's `Flock` state root when the layer is built
- `provideHarnessModels` (`harness-models.ts`): each call lists the harness's models (a failed listing is logged and answers no models)
- `navigation` get/set (`core-runtime.ts`): SQLite select and upsert on the `navigation` table
- `captures.store` (`core-runtime.ts`): `writeToolCapture` to the DB
- `session-context.ts`: module-level AsyncLocalStorage

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
