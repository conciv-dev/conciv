# tools/src

## Overview

Entry modules of `@conciv/tools`. They define the `conciv_ui` agent tool (with `defineTool` from `@conciv/protocol/chat-tool-types`), wrap it as a sandbox server tool, and register Solid card renderers by tool name.

## Interface

- `ConcivToolContext` `{askUi: () => Promise<UiAnswer>}`, `ConcivServerTool` `{name, description, inputSchema, execute(input)}` (`types.ts`).
- `concivUiToolDef` (`ui.ts`): tool `conciv_ui`, input `UiInputSchema`, output `UiAnswerSchema` (`@conciv/protocol/ui-types`).
- `concivSandboxTools(ctx)` and `concivSandboxToolNames()` (`['conciv_ui']`) (`server.ts`).
- `tools.ts` (export `.`): `ConcivServerTool`, `ConcivToolContext`, `concivSandboxTools`, `concivSandboxToolNames`.
- `defs.ts` (export `./defs`): `concivUiToolDef`.
- `cards.tsx` (export `./cards`): `concivToolCards: ToolCardEntry[]` (`conciv_ui` -> `UiCard`, `open` -> `OpenCard`).
- `OpenInput` (`cards.tsx`): `{file: string (min 1), line?: coerced int >= 1, column?: coerced int >= 1}`; a column without a line is dropped; the `open` card parses a call's input with it.
- [cards/README.md](./cards/README.md): card renderers.

## Invariants

- The sandbox wrapper throws `conciv_ui: server tool has no execute` when `.server()` returns no execute, and parses input with `UiInputSchema.parse` first (`server.ts`).

## Side Effects

- `conciv_ui` execute awaits `ctx.askUi()` until the UI answers (`server.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/tools` from the repo root (turbo builds the package and its dependencies first)
