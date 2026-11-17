# tools/src

## Overview

Entry modules of `@conciv/tools`. They define the `conciv_ui` agent tool (with `defineTool` from `@conciv/protocol/chat-tool-types`), wrap it as a sandbox server tool, re-export the builtin `tabs` tool, and register Solid card renderers by tool name.

## Interface

- `ConcivToolContext` `{askUi: () => Promise<UiAnswer>}`, `ConcivServerTool` `{name, description, inputSchema, execute(input)}` (`types.ts`).
- `concivUiToolDef` (`ui.ts`): tool `conciv_ui`, input `UiInputSchema`, output `UiAnswerSchema` (`@conciv/protocol/ui-types`).
- `concivSandboxTools(ctx)` and `concivSandboxToolNames()` (`['conciv_ui']`) (`server.ts`).
- `tools.ts` (export `.`): `ConcivServerTool`, `ConcivToolContext`, `concivSandboxTools`, `concivSandboxToolNames`, `concivUiToolDef`.
- `defs.ts` (export `./defs`): `concivUiToolDef`.
- `builtins.ts` (export `./builtins`): re-exports `BUILTIN_TABS_TOOL`, `TabsToolContext`, `BuiltinCategory`; defines `builtinToolNames()`.
- `cards.tsx` (export `./cards`): `concivToolCards: ToolCardEntry[]` (`conciv_ui` -> `UiCard`, `open` -> `OpenCard`) and re-exports of the two cards.
- [builtins/README.md](./builtins/README.md): the `tabs` tool.
- [cards/README.md](./cards/README.md): card renderers.

## Invariants

- The sandbox wrapper throws `conciv_ui: server tool has no execute` when `.server()` returns no execute, and parses input with `UiInputSchema.parse` first (`server.ts`).

## Side Effects

- `conciv_ui` execute awaits `ctx.askUi()` until the UI answers (`server.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/tools` from the repo root (turbo builds the package and its dependencies first)
