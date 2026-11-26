# backend-defaults/src/tools

## Overview

The engine's own `conciv_ui` agent tool: its definition (`ui.ts`, from `@conciv/types/chat-tool-types` with `UiInputSchema` and `UiAnswerSchema` from `@conciv/types/ui-types`) and its sandbox server tool (`server.ts`), exported through the package's `./tools` entry (`../tools.ts`).

## Invariants

- The sandbox wrapper throws `conciv_ui: server tool has no execute` when `.server()` returns no execute, and parses input with `UiInputSchema.parse` first (`server.ts`).

## Side Effects

- `conciv_ui` execute awaits `ctx.askUi()` until the UI answers (`server.ts`).
