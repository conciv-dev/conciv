# tools/primitives

## Overview

Headless pieces for tool-call rendering: status derivation, toolkit definition, input and result parsing, row projections, titles, permission and fallback contexts.

## Interface

- `tool-status.ts:toolStatus`, type `ToolStatus` (`running`, `complete`, `error`, `approval`).
- `define-toolkit.ts:defineToolkit` - maps `{name: entry}` to `ToolCardEntry[]`; `findToolEntry` picks the entry that draws a call.
- `tool-util.ts:parseInput`, `resultText`, `parseResultPayload`, `stripReadLineNumbers`, `formatDuration`; `result-media.ts:parseResultMedia`; `schema-params.ts:schemaFields`, `schemaParams`.
- `tool-row.ts:resolveRowMark`, `countLabel`, `shortToolLabel`, `primaryArgument`, `genericRowProjection`, `headerRowProjection`; `now-title.ts:humanToolName`, `nowTitle`.
- `tool-presentation.ts:cardPhase`, `cardTitle`, `displayValue`, `clip`, `MUTATING_BADGE`, `QUIET_TEXT_CLASS`, `DANGER_TEXT_CLASS`.
- `permission.tsx:Permission`, `usePermission`; `tool-fallback.tsx:ToolFallback`, `useToolFallback`; `tool-duration.tsx:ToolDurationProvider`, `useToolCallDuration`; `status-visual.tsx:StatusVisual`.

## Invariants

- `define-toolkit.ts:findToolEntry` returns the first entry whose `names` include the call's name and whose optional `accepts(part, result)` is absent or true; when every named entry declines, callers fall through to the catalog card and then the fallback, exactly as when no entry matches.
- `tool-status.ts:toolStatus` precedence: `approval-requested` part, error result, complete (result, part state or output), else running.
- `tool-util.ts:parseInput` tries `part.input`, then JSON-parsed `part.arguments`, and returns `undefined` on any failure.
- `tool-row.ts` caps labels at `MAX_LABEL_LENGTH` (12) and targets at `MAX_TARGET_LENGTH` (160).
- `usePermission` and `useToolFallback` throw outside their roots.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
