# tanstack/src/server

## Overview

adapter.ts builds a `FrameworkAdapter` named `tanstack-start`. Its client-side verbs call the tanstack_* tools through the registry and parse the replies with the tools' output schemas. Its server-side verbs read from injected dependencies. diagnostics.ts turns bundler build-error diagnostics into `AppError`s and keeps them in a fixed-size ring. serverfn-trace.ts picks `/_serverFn/<base64>` request traces out of the bundler stream and decodes them into trace records and a list of server functions. route-manifest.ts uses regexes to pull route paths and files out of a project's src/routeTree.gen.ts.

## Interface

- `makeTanstackAdapter` (`adapter.ts`): returns `defineFrameworkAdapter` with capabilities {queryCache: true, serverFunctions: true, rscPayload: false, isr: false, middleware: false} and the verb groups client.detect, routes, navigation, data and errors, plus queryCache, serverFunctions and server manifest/errors/events/logs
- `TanstackAdapterDeps` (`adapter.ts`): dependency type with tools, buildErrors, routeManifest, serverFnTraces, serverFns and an optional bundlerSubscribe
- `buildErrorToAppError` (`diagnostics.ts`): converts a build-error diagnostic to an `AppError` with kind 'build' and id `build:<file>:<line>:<col>:<ts>`
- `makeDiagnosticsRing` / `DiagnosticsRing` (`diagnostics.ts`): ring of `AppError`s with push and list
- `makeServerFnTraceRing` / `ServerFnTraceRing` (`serverfn-trace.ts`): observe, traces(count?) and functions() over request-trace diagnostics
- `readRouteManifest` (`route-manifest.ts`): parses `<cwd>/src/routeTree.gen.ts` into `ServerRouteInfo[]`

## Invariants

- `makeVerbCaller` (`adapter.ts`): throws `tanstack verb "<name>" declares no output schema` when a def has no outputSchema, and otherwise parses every tool result with `outputSchema.parse`
- `detect` (`adapter.ts`): returns null when the call throws
- `routes.tree` (`adapter.ts`): parses the result again with `RouteNodeSchema`
- `toFrameworkEvent` (`adapter.ts`): build-error -> buildError, hmr-update -> hmrUpdate, every other kind -> requestTrace
- `events.subscribe` (`adapter.ts`): returns a no-op unsubscribe when `bundlerSubscribe` is missing; `logs.tail` always returns []
- `makeDiagnosticsRing` (`diagnostics.ts`): keeps the last `DEFAULT_CAPACITY` = 50 entries
- `makeServerFnTraceRing` (`serverfn-trace.ts`): keeps the last `DEFAULT_CAPACITY` = 100 traces and only accepts `request-trace` diagnostics whose URL contains `/_serverFn/` followed by a non-empty segment
- `decodeServerFn` (`serverfn-trace.ts`): drops any segment whose base64-decoded JSON does not have string `file` and `export` fields
- `toTrace` (`serverfn-trace.ts`): HTTP status < 400 -> 'ok', otherwise 'error'
- `classify` (`route-manifest.ts`): id '**root**' or an empty or missing path -> 'layout', anything else -> 'page'; `dynamic` is true when the path contains '$'
- `updateBlockToRoute` (`route-manifest.ts`): skips `.update({...} as any)` blocks that have no `id:`
- `resolveFile` (`route-manifest.ts`): tries the import spec as written, then with .tsx, .ts, .jsx and .js appended, and otherwise returns the unresolved path

## Side Effects

- `readRouteManifest` (`route-manifest.ts`): reads src/routeTree.gen.ts from disk; `resolveFile` calls `existsSync`
- `makeTanstackAdapter` (`adapter.ts`): makes registry calls through `tools.call` to the tanstack_* tools that run on the page
- `events.subscribe` (`adapter.ts`): subscribes to the bundler diagnostic stream

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-tanstack` from the repo root (turbo builds the package and its dependencies first)
