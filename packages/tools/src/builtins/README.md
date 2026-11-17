# tools/src/builtins

## Overview

Builtin tools for an agent working against a dev server: the `server_reload` tool that proxies a `BundlerBridge` hot update, and the `tabs` tool. The other dev-server tools and `open` come from the engine's server plugin (`packages/plugin-host/src/core/tool/plugin/server.ts`). `OpenInput` stays here for the `open` card. Shared zod pieces and the `BuiltinCategory` type live here too.

## Interface

- `ServerToolContext` `{bundler: () => BundlerBridge | undefined}` (`server-tools.ts`).
- `BUILTIN_SERVER_TOOL` map and `BUILTIN_SERVER_TOOLS` (`Object.values`) (`server-tools.ts`):
  - `server_reload` `{file}`: `bundler.reload()`, then waits for the page hot update; returns `{ok, applied, waitedMs}`.
- `BUILTIN_TABS_TOOL` (`server-tools.ts`): tool `tabs`, no input, output `TabsListingSchema` from `ctx.listTabs()` (`TabsToolContext`); its hint (`TABS_GUIDANCE`, module private) tells an agent to list with `external_tabs({})`, match the user's words, then pass that tab's id as `tab` on every `execute_typescript` and `discover_tools` call of the hub.
- `OpenInput` (`open-input.ts`): `{file: string (min 1), line?: coerced int >= 1, column?: coerced int >= 1}`; a column without a line is dropped; the `open` card parses a call's input with it.
- `AnyRecord`, `OkResult`, `ElementTarget` `{selector?, ref?, name?}`, `BuiltinCategory` (`'read' | 'act' | 'edit-live' | 'react' | 'server'`) (`shared.ts`).

## Invariants

- `server_reload` throws `toolError('NO_BUNDLER', {message: 'no dev server is attached to conciv'})` when `ctx.bundler()` is undefined (`requireBundler`).
- Server tool names are `server_${operation}` with `meta.category: 'server'`, `mutating` default false (`serverTool`).
- `server_reload` is `mutating: true` with `approval: 'ask'`.
- `waitForHotUpdate` maps a failed page call to `{applied: false, waitedMs: 0}` and validates answers with `HotUpdateWaitSchema.parse`.

## Side Effects

- `server_reload` triggers a hot update through the `BundlerBridge`.
- `server_reload` asks its context's `hotUpdate(sessionId, HOT_UPDATE_WAIT_MS)` (5000 ms), which core answers from the page plugin's `hmr.wait` (`waitForHotUpdate`); a failed wait answers `{applied: false, waitedMs: 0}`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/tools` from the repo root (turbo builds the package and its dependencies first)
