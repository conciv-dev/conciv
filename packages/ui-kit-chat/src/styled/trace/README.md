# ui-kit-chat/src/styled/trace

## Overview

Trace view components: the collapsible trace list with an SVG rail, tool and run rows, output blocks with copy, clamped bodies, permission prompts and action rows.

## Interface

- `trace.tsx`: the trace list; `trace-row.tsx`, `output-block.tsx`, `permission-block.tsx`, `action-row.tsx`, `clamp.tsx`, `rail.tsx`: its rows, output blocks, permission prompt, action row, clamped body and SVG rail.

## Invariants

- `permission-block.tsx` handles keys only while the permission is pending: Escape rejects, Ctrl/Meta+Enter approves.
- `output-block.tsx` resets the copy state after `COPY_RESET_MS` (3000).
- `trace.tsx:Trace` with `headless` has no header or fold toggle and is always open; its rail starts at the top of the trace. With `joinsBelow` the rail runs straight to the bottom of the trace with an arm on every row, so stacked traces read as one continuous rail.

## Side Effects

- `clamp.tsx` and `rail.tsx` measure with `requestAnimationFrame` and resize observers.
- `permission-block.tsx` adds a `keydown` listener on its element; `output-block.tsx` writes to the clipboard.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
