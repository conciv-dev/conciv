# core/src/lib

## Overview

Server helpers for the core engine: loopback-only Host/Origin CORS middleware, the dev-endpoint discovery file in ~/.conciv, a probe that reports when loaded engine modules change on disk, the persisted server port, and the state file layout.

## Interface

- `corsMiddleware` / `originAllowed` / `widgetCaller` / `loopbackHostAllowlist` / `CorsVars` (`cors.ts`)
- `logError` (`debug.ts`): writes a line to stderr
- `DevEndpointSchema` / `DevEndpoint` (`dev-endpoint.ts`): {apiBase, token: string|null, pid}
- `defaultDevEndpointDir` / `writePrivateFile` / `writeDevEndpoint` / `readDevEndpoint` / `removeDevEndpoint` (`dev-endpoint.ts`): `<dir>/dev-endpoint.json`, default dir ~/.conciv
- `makeStalenessProbe` / `loadedModules` / `engineStaleness` / `TrackedModule` (`engine-stamp.ts`): {stale, changed, tracked, bootedAt, fingerprint}
- `runInOrder` / `ShutdownStep` (`shutdown.ts`): runs steps one after another, keeps going past failures, rethrows them as one `AggregateError`
- `writeText` (`../start.ts`): mkdir -p then write
- `homeDbReads(folder, signal, read)` (`home-db-watch.ts`): an async generator that yields `read()` at once, then checks the home db's `PRAGMA data_version` every second and yields `read()` again whenever another connection committed and the value differs (`isEqual`); while `home.db` is absent it waits for the file to appear. It ends when `signal` aborts. Used by `meta.hubAgents` (`api/rpc/hub.ts`) and the plugin servers list (`runtime/servers-source.ts`)
- `readPersistedPort` / `writePersistedPort` / `isAddressInUse` (`../start.ts`)
- `requireHarness(registry, id)` (`require-harness.ts`): the harness in that `HarnessRegistry` with that id, or a throw naming the id and every id it lists
- `CHAT_SYSTEM_PROMPT` (`chat-system-prompt.ts`): the default chat system prompt `resolveSystemPrompt` (`../config.ts`) answers; the module imports nothing, so reading the config loads no harness code
- `withSavedModels(adapter, stateDir, signal)` (`../app.ts`): wraps a harness whose `models` is a function so it answers from `<stateDir>/<harness id>-models.json` at once and refreshes the live list once per process in the background, handing the listing the engine's `signal` (whatever signal a caller passes to the wrapped `models` is not used: the refresh is shared and lives as long as the engine); with nothing saved it waits for the live list. It returns `{harness, settled}`: `settled()` resolves once the refresh in flight, if any, has settled, which `makeApp`'s dispose awaits after aborting `signal`, for at most `GROUP_EXIT_TIMEOUT_MS` (5 s, from `@conciv/ai/server`) per harness
- `statePaths` / `StatePaths` (`../start.ts`): {dir, systemPrompt: chat-system-prompt.txt, server: server.json} under `concivStateDir(stateRoot)`

## Invariants

- `corsMiddleware` (`cors.ts`): a Host that is not a bare loopback authority gets 403 'forbidden host'; an Origin that is not loopback or in `allowedOrigins` gets 403 'forbidden origin'; no Origin is allowed. Every response it handles carries `x-conciv-version` (read on each response from the function it is given, `makeApp`'s `app.version`; when there is none or it answers `undefined`, the core package.json version), exposed to CORS callers; the header is also an allowed request header
- `writeDevEndpoint` (`dev-endpoint.ts`): validates with `DevEndpointSchema.parse`
- `readDevEndpoint` (`dev-endpoint.ts`): null on a missing file, bad JSON or schema failure
- `removeDevEndpoint` (`dev-endpoint.ts`): deletes only when the file is absent or invalid or its pid matches the caller
- `writePrivateFile` (`dev-endpoint.ts`): mode 0600, temp file plus rename; removes the temp file on failure
- `readPersistedPort` (`../start.ts`): an integer 1-65535 or undefined
- `writePersistedPort` (`../start.ts`): returns a step that puts back the record it replaced (or removes the file when there was none), only while the file still holds what this write put there, so it never touches a record another engine wrote since
- `withSavedModels` (`../app.ts`): a saved file is used only when it parses as a model list; every successful live list overwrites it, an empty one included (a harness with nothing usable, such as OpenCode with no credentials, stops offering models), while a failed probe never replaces a good list; once `signal` is aborted no refresh starts, a listing that answers anyway is not saved, and its failure is not logged as a failed refresh; a static `models` array passes through untouched
- `makeStalenessProbe` (`engine-stamp.ts`): the fingerprint is the first 12 hex chars of sha256 over current digests

## Side Effects

- `logError` (`debug.ts`): writes to process.stderr
- `writeDevEndpoint` / `removeDevEndpoint` (`dev-endpoint.ts`): write or delete files under ~/.conciv by default
- `engine-stamp.ts`: on load resolves modules with `import.meta.resolve` and hashes them; each `engineStaleness` call re-reads them
- `writeText` (`../start.ts`), `writePersistedPort` (`../start.ts`): write files
- `homeDbReads` (`home-db-watch.ts`): never creates `home.db`; once the file exists each call holds its own connection to it and a one-second timer until `signal` aborts or the caller stops reading

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
