# styled/trace

## Overview

Trace view components: the collapsible trace list with an SVG rail, tool and run rows, output blocks with copy, clamped bodies, permission prompts and action rows.

## Interface

- `trace.tsx:Trace`, types `TraceItem`, `TraceBranch`.
- `trace-row.tsx:TraceMark`, `TraceRing`, `TraceRunRow`, `TraceToolRow`, `TraceFoldableRow`, `TRACE_LINE`, `TRACE_INDENT`, `TRACE_MICROLABEL`.
- `output-block.tsx:TraceOutputBlock`, `TraceBodyFrame`, type `TraceOutputTone`.
- `permission-block.tsx:TracePermissionBlock`; `action-row.tsx:TraceActionRow`; `clamp.tsx:TraceClamp`; `rail.tsx:TraceRail`.

## Invariants

- `permission-block.tsx` handles keys only while the permission is pending: Escape rejects, Ctrl/Meta+Enter approves.
- `output-block.tsx` resets the copy state after `COPY_RESET_MS` (3000).

## Side Effects

- `clamp.tsx` and `rail.tsx` measure with `requestAnimationFrame` and resize observers.
- `permission-block.tsx` adds a `keydown` listener on its element; `output-block.tsx` writes to the clipboard.

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
