# tools/src/builtins

## Overview

Builtin tools for an agent working against a dev server: seven `server_*` tools that proxy a `BundlerBridge` (config, urls, resolve, module graph, transform, reload, restart) and an `open` tool that opens a file in the user's editor. Shared zod pieces and the `BuiltinCategory` type live here too.

## Interface

- `ServerToolContext` `{bundler: () => BundlerBridge | undefined}`, `OpenToolContext` `{openInEditor(file, line?): void}` (`server-tools.ts`).
- `BUILTIN_SERVER_TOOL` map and `BUILTIN_SERVER_TOOLS` (`Object.values`) (`server-tools.ts`):
  - `server_config`: `bundler.config()` (`BundlerConfigSchema`).
  - `server_urls`: `bundler.urls()` `{local[], network[]}`.
  - `server_resolve` `{spec, importer?}`: `bundler.resolve()` `{id | null}`.
  - `server_graph` `{file}`: `bundler.moduleGraph()` (`ModuleNodeSchema[]`).
  - `server_transform` `{url}`: `bundler.transform()` `{code | null}`.
  - `server_reload` `{file}`: `bundler.reload()`, then waits for the page hot update; returns `{ok, applied, waitedMs}`.
  - `server_restart` `{force?}`: `bundler.restart(force ?? false)`.
- `BUILTIN_OPEN_TOOL` (`server-tools.ts`): tool `open`, input `OpenInput`, output `{ok: true, file, line?}`.
- `OpenInput` (`open-input.ts`): `{file: string (min 1), line?: coerced int >= 1}`.
- `AnyRecord`, `OkResult`, `ElementTarget` `{selector?, ref?, name?}`, `BuiltinCategory` (`'read' | 'act' | 'edit-live' | 'react' | 'server'`) (`shared.ts`).

## Invariants

- Every server tool throws `toolError('NO_BUNDLER', {message: 'no dev server is attached to conciv'})` when `ctx.bundler()` is undefined (`requireBundler`).
- Server tool names are `server_${operation}` with `meta.category: 'server'`, `mirrors: false`, `mutating` default false (`serverTool`).
- `server_reload` and `server_restart` are `mutating: true` with `approval: 'ask'`.
- `waitForHotUpdate` maps a failed page call to `{applied: false, waitedMs: 0}` and validates answers with `HotUpdateWaitSchema.parse`.
- The `open` output includes `line` only when the input has one.

## Side Effects

- `server_reload` / `server_restart` trigger a hot update or a dev-server restart through the `BundlerBridge`.
- `server_reload` calls the page RPC `hmrDef.name` with timeout `HOT_UPDATE_WAIT_MS` (`@conciv/extension-page/defs`) (`waitForHotUpdate`).
- `open` calls `ctx.openInEditor(file, line)`.

## Verification

- Run: `cd packages/tools && pnpm test`
