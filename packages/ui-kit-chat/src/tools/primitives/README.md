# ui-kit-chat/src/tools/primitives

## Overview

Headless pieces for tool-call rendering: status derivation, toolkit definition, input and result parsing, row projections, titles, permission and fallback contexts.

## Interface

- `tool-status.ts`: a call's status (`running`, `complete`, `error`, `approval`).
- `define-toolkit.ts`: maps `{name: entry}` to `ToolCardEntry[]` and picks the entry that draws a call.
- `tool-util.ts`, `result-media.ts`, `schema-params.ts`, `tool-row.ts`, `now-title.ts`, `tool-presentation.ts`, `tool-error-subtitle.ts`: parsing a call's input and result, and the labels and phases a row shows.
- `permission.tsx`, `tool-fallback.tsx`, `status-visual.tsx`: headless roots for the permission ask and the fallback card, and the status mark.

## Invariants

- `define-toolkit.ts:findToolEntry` returns the first entry whose `names` include the call's name; with none, callers fall through to the catalog card and then the fallback.
- `tool-status.ts:toolStatus` precedence: `approval-requested` part, error result, complete (result, part state or output), else running.
- `tool-util.ts:parseInput` tries `part.input`, then JSON-parsed `part.arguments`, and returns `undefined` on any failure.
- `tool-row.ts` caps labels at `MAX_LABEL_LENGTH` (12) and targets at `MAX_TARGET_LENGTH` (160).
- `usePermission` and `useToolFallback` throw outside their roots.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
