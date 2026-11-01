# tools/src

## Overview

Entry modules of `@conciv/tools`. They define the `conciv_ui` and `conciv_extensions` agent tools (with `defineTool` from `@conciv/protocol/chat-tool-types`), wrap them as sandbox server tools, re-export the builtin dev-server and `open` tools, and register Solid card renderers by tool name.

## Interface

- `ConcivToolContext` `{askUi: () => Promise<UiAnswer>}`, `ConcivServerTool` `{name, description, inputSchema, execute(input)}` (`types.ts`).
- `concivUiToolDef` (`ui.ts`): tool `conciv_ui`, input `UiInputSchema`, output `UiAnswerSchema` (`@conciv/protocol/ui-types`).
- `ExtensionsInput` `{verb: 'catalog' | 'scaffold' | 'validate', kind?, name?, source?}` and `concivExtensionsToolDef` (tool `conciv_extensions`) (`extensions-tool.ts`).
- `concivSandboxTools(ctx)` and `concivSandboxToolNames()` (`['conciv_ui', 'conciv_extensions']`) (`server.ts`).
- `tools.ts` (export `.`): `ConcivServerTool`, `ConcivToolContext`, `concivSandboxTools`, `concivSandboxToolNames`, `concivUiToolDef`.
- `defs.ts` (export `./defs`): `concivUiToolDef`, `concivExtensionsToolDef`.
- `builtins.ts` (export `./builtins`): re-exports `BUILTIN_OPEN_TOOL`, `BUILTIN_SERVER_TOOL`, `BUILTIN_SERVER_TOOLS`, `OpenToolContext`, `ServerToolContext`, `BuiltinCategory`; defines `SERVER_TOOL_PREFIX` (`'server_'`), `serverOperationOfTool(name)`, `builtinToolNames()`.
- `cards.tsx` (export `./cards`): `concivToolCards: ToolCardEntry[]` (`conciv_ui` -> `UiCard`, `open` -> `OpenCard`, `conciv_extensions` -> `ExtensionsCard`) and re-exports of the three cards.
- [builtins/README.md](./builtins/README.md): `server_*` and `open` tools.
- [cards/README.md](./cards/README.md): card renderers.

## Invariants

- `serverOperationOfTool` throws `"<name>" is not a dev-server tool` without the `server_` prefix (`builtins.ts`).
- Sandbox wrappers throw `conciv_ui: server tool has no execute` / `conciv_extensions: server tool has no execute` when `.server()` returns no execute, and parse input with `UiInputSchema.parse` / `ExtensionsInput.parse` first (`server.ts`).
- `scaffold` requires `kind` and `name` (`scaffold needs {kind, name}`); `validate` requires `source` (`validate needs {source}`) (`server.ts`).
- `ExtensionsInput.name` must match `/^[a-zA-Z]\w*$/` (`extensions-tool.ts`).

## Side Effects

- `conciv_ui` execute awaits `ctx.askUi()` until the UI answers (`server.ts`).
- `conciv_extensions` execute calls `buildCatalog`, `scaffold` or `validateSource` from `@conciv/extension/catalog` (`server.ts`).

## Verification

- Run: `cd packages/tools && pnpm test`
