# backend-defaults/src/tools

## Overview

The engine's own agent tools, `conciv_ui`, `set_log_level` and `logs_query`. `conciv_ui`: its definition (`ui.ts`, from `@conciv/types/chat-tool-types` with `UiInputSchema` and `UiAnswerSchema` from `@conciv/types/ui-types`) and its sandbox server tool (`server.ts`), exported through the package's `./tools` entry (`../tools.ts`).

`set_log_level` (`log-level.ts`) sets the engine's or the widget's log level through `ConcivToolContext.setLogLevel` and answers the levels now in force. `logs_query` (`log-level.ts`) reads the stored logs through `ConcivToolContext.queryLogs` (code mode calls it `external_logs_query`); it asks nothing, and with the engine level `off` it answers no events and the level.

## Invariants

- `set_log_level` asks the user through the permission flow (`logs.setLevel` on the scope) before it raises the widget to `info`, `debug` or `trace`, since widget logs can carry page data (`exposesPageData`); a refusal answers `{refused}` and changes nothing.

- The sandbox wrapper throws `conciv_ui: server tool has no execute` when `.server()` returns no execute, and parses input with `UiInputSchema.parse` first (`server.ts`).

## Side Effects

- `conciv_ui` execute awaits `ctx.askUi()` until the UI answers (`server.ts`).
