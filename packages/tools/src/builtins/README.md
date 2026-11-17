# tools/src/builtins

## Overview

The builtin `tabs` tool. The dev-server tools and `open` come from the engine's server plugin (`packages/plugin-host/src/core/tool/plugin/server.ts`). `OpenInput` stays here for the `open` card. Shared zod pieces and the `BuiltinCategory` type live here too.

## Interface

- `BUILTIN_TABS_TOOL` (`server-tools.ts`): tool `tabs`, no input, output `TabsListingSchema` from `ctx.listTabs()` (`TabsToolContext`); its hint (`TABS_GUIDANCE`, module private) tells an agent to list with `external_tabs({})`, match the user's words, then pass that tab's id as `tab` on every `execute_typescript` and `discover_tools` call of the hub.
- `OpenInput` (`open-input.ts`): `{file: string (min 1), line?: coerced int >= 1, column?: coerced int >= 1}`; a column without a line is dropped; the `open` card parses a call's input with it.
- `AnyRecord`, `OkResult`, `ElementTarget` `{selector?, ref?, name?}`, `BuiltinCategory` (`'read' | 'act' | 'edit-live' | 'react' | 'server'`) (`shared.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/tools` from the repo root (turbo builds the package and its dependencies first)
