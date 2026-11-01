# tanstack/src/tool

## Overview

`def.ts` declares every tool with `toolDefinition` from `@conciv/extension/tool`: name, description, input/output zod schemas, error codes and UI meta. `client.ts` binds 13 page tools to functions in `../client/router-adapter.js`, `../client/query-adapter.js` and `../client/error-ring.js`, and attaches render cards to most of them. The three server-only tools (build errors, route manifest, server-fn trace) get card renderers only. `server.ts` gives those three tools server handlers that call `ctx.makeAdapter(tools)`, and declares the 13 page tools as client-executed. The `*-card.tsx` files are Solid components built on shared `InspectionCard`/`ActionCard` wrappers in `card-shared.tsx`. `story.fixtures.ts` and `trace.fixtures.tsx` are helpers for the colocated `*.stories.tsx` files. `src/client.tsx` imports `tanstackClientTools`, `src/server.ts` imports `tanstackServerTools`, and `src/server/adapter.ts` imports from `def.ts`.

## Interface

- `detectDef` (`def.ts`): tool `tanstack_detect`, no input, returns FrameworkInfo (name/version/router/dev)
- `routerStateDef` (`def.ts`): tool `tanstack_router_state`, returns current location and route matches
- `routeTreeDef` (`def.ts`): tool `tanstack_route_tree`, returns the nested route tree (transport schema with `children: unknown[]`)
- `RouteNodeSchema` (`def.ts`): recursive zod schema for RouteNode (id, path, kind, hasLoader, children, optional truncated)
- `dataEntriesDef` (`def.ts`): tool `tanstack_data_entries`, returns `{entries: CacheEntry[]}`, one entry per matched route
- `loaderDataDef` (`def.ts`): tool `tanstack_loader_data`, optional `routeId` input, returns `{routeId, data}`
- `dataInvalidateDef` (`def.ts`): tool `tanstack_data_invalidate`, input `{routeId}`, mutating, returns `{ok: true}`
- `errorsSnapshotDef` (`def.ts`): tool `tanstack_errors_snapshot`, returns buffered runtime errors `{errors: AppError[]}`
- `queryCacheDef` (`def.ts`): tool `tanstack_query_cache`, returns `{queries, mutations}` CacheEntry arrays
- `queryInvalidateDef` / `queryRefetchDef` (`def.ts`): tools `tanstack_query_invalidate` / `tanstack_query_refetch`, input `{key}` (serialized queryKey), mutating
- `navigateDef` (`def.ts`): tool `tanstack_navigate`, input `{to, params?, search?, replace?}`, returns `{ok: true, to}`
- `routerInvalidateDef` (`def.ts`): tool `tanstack_router_invalidate`, re-runs active loaders
- `backDef` (`def.ts`): tool `tanstack_back`, navigates router history back one entry
- `buildErrorsDef` (`def.ts`): tool `tanstack_build_errors`, returns an array of `{kind, message, source}`, declares error `BUNDLER_UNAVAILABLE`
- `routeManifestDef` (`def.ts`): tool `tanstack_route_manifest`, returns an array of `{path, kind, dynamic, file}`, declares error `MANIFEST_UNREADABLE`
- `serverFnTraceDef` (`def.ts`): tool `tanstack_server_fn_trace`, optional `count` input, returns `{traces, functions}`
- `TANSTACK_PAGE_TOOL_DEFS` (`def.ts`): readonly list of the 13 page-executed tool definitions (everything except build errors, route manifest and server-fn trace)
- `tanstackClientTools` (`client.ts`): AnyToolBuilder[] with `.client()` executors for the 13 page tools and `.render()` cards for 12 tools (all except detect, data_entries, data_invalidate and errors_snapshot)
- `tanstackServerTools` (`server.ts`): AnyToolBuilder[] with server handlers for build_errors, route_manifest and server_fn_trace, plus client-only declarations for `TANSTACK_PAGE_TOOL_DEFS`
- `InspectionCard` / `ActionCard` (`card-shared.tsx`): CardShell wrappers that show an ErrorBlock on error, hide the body while running, and set the subtitle to `summary`
- `settledCardBody`, `CardRows`, `CardRow`, `CardNote`, `JsonValue`, `ErrorRecord` (`card-shared.tsx`): shared card layout and body-presence helpers
- `backCard`, `buildErrorsCard`, `loaderDataCard`, `navigateCard`, `queryCacheCard`, `queryInvalidateCard`, `queryRefetchCard`, `routeManifestCard`, `routeTreeCard`, `routerInvalidateCard`, `routerStateCard`, `serverFnTraceCard` (`*-card.tsx`): ToolCardView objects (`render` plus `hasEmbeddedBody`), each with an exported matching `*Card` component
- `storyCtx`, `storyPart`, `storyResult`, `storyErrorResult`, `storyAddResult`, `STORY_FRAME_CLASS` (`story.fixtures.ts`): Storybook builders for tool-call/result parts and an inert view ctx
- `traceRow`, `traceFrame`, `TRACE_FRAME_CLASS` (`trace.fixtures.tsx`): Storybook helpers that render `tanstackClientTools` cards inside a ui-kit-chat Trace

## Invariants

- `serverFnTraceDef` (`def.ts`) input `count` must be a positive integer of at most 100
- `FrameworkInfoSchema` (`def.ts`) only accepts name values nextjs/tanstack-start/vue/solid-start/astro and router values app/pages/file-based/unknown
- Route matches (`def.ts`) must have status pending/success/error/notFound/redirected, and cache entries state fresh/stale/fetching/error
- Mutating tools are flagged `meta.mutating: true` in `def.ts`: data_invalidate, query_invalidate, query_refetch, navigate, router_invalidate, back
- `routeManifestServer` (`server.ts`) rethrows any adapter failure as `toolError('MANIFEST_UNREADABLE', {message})`
- `serverFnTraceServer` (`server.ts`) returns `{traces: [], functions: []}` when `adapter.serverFunctions` is absent, and uses `Number.MAX_SAFE_INTEGER` as the default count
- `readError` (`card-shared.tsx`) falls back from `result.error` to the payload's `message`, then the result text, then the string 'tool failed'
- `settledCardBody` (`card-shared.tsx`) reports a body on error, none while running, and otherwise defers to `hasContent`
- `InspectionCard` (`card-shared.tsx`) sets status 'error' only when `failed === true`, and `BuildErrorsCard` (`build-errors-card.tsx`) passes failed when there is at least one build error
- `LoaderDataCard` (`loader-data-card.tsx`) hides the JSON body for truncated markers (`__conciv === 'object'` with a string `preview`) and shows nothing when `data` is null or undefined

## Side Effects

- `tanstackClientTools` (`client.ts`) mutates the host app's router/query state via `navigateTo`, `goBack`, `invalidateRouter`, `invalidateRouterMatch`, `invalidateQuery` and `refetchQuery` (implemented in `../client/*`)
- `tanstackServerTools` (`server.ts`) reads dev-server build errors, the route manifest and server-function traces through `ctx.makeAdapter(tools)`
- Card components (`*-card.tsx`) render Solid DOM only

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-tanstack` from the repo root (turbo builds the package and its dependencies first)
