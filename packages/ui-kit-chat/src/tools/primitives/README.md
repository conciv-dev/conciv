# tools/primitives

## Overview

Headless pieces for tool-call rendering: status derivation, toolkit definition, input and result parsing, row projections, titles, permission and fallback contexts.

## Interface

- `tool-status.ts:toolStatus`, type `ToolStatus` (`running`, `complete`, `error`, `approval`).
- `define-toolkit.ts:defineToolkit` - maps `{name: entry}` to `ToolCardEntry[]`.
- `tool-util.ts:parseInput`, `resultText`, `parseResultPayload`, `stripReadLineNumbers`, `formatDuration`; `result-media.ts:parseResultMedia`; `schema-params.ts:schemaFields`, `schemaParams`.
- `tool-row.ts:rowMarkOf`, `countLabel`, `shortToolLabel`, `primaryArgument`, `genericRowProjection`, `headerRowProjection`; `now-title.ts:humanToolName`, `nowTitle`.
- `tool-presentation.ts:cardPhase`, `cardTitle`, `displayValue`, `clip`, `MUTATING_BADGE`, `QUIET_TEXT_CLASS`, `DANGER_TEXT_CLASS`.
- `permission.tsx:Permission`, `usePermission`; `tool-fallback.tsx:ToolFallback`, `useToolFallback`; `tool-duration.tsx:ToolDurationProvider`, `useToolCallDuration`; `status-visual.tsx:StatusVisual`.

## Invariants

- `tool-status.ts:toolStatus` precedence: `approval-requested` part, error result, complete (result, part state or output), else running.
- `tool-util.ts:parseInput` tries `part.input`, then JSON-parsed `part.arguments`, and returns `undefined` on any failure.
- `tool-row.ts` caps labels at `MAX_LABEL_LENGTH` (12) and targets at `MAX_TARGET_LENGTH` (160).
- `usePermission` and `useToolFallback` throw outside their roots.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
