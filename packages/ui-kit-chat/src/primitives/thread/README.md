# ui-kit-chat/src/primitives/thread

## Overview

Headless `Thread` compound: viewport with virtualized turns, messages, scroll-to-bottom, suggestions and empty state, plus viewport and turn-estimate contexts.

## Interface

- `thread.tsx`: the `Thread` compound, exported as `ThreadPrimitive`; `viewport-context.tsx`, `viewport-internal.tsx` and `turn-estimate.tsx`: the viewport and turn-estimate contexts; `virtualize-threshold.ts`: the turn count past which the thread virtualizes.

## Invariants

- Below `VIRTUALIZE_THRESHOLD` turns the overscan equals the turn count, so nothing is evicted; above it overscan is `EVICTING_OVERSCAN` (8) with a `ROW_ESTIMATE_PX` (72) estimate (`thread.tsx`).
- The virtualized turns sit in one `data-thread-list` element; the gap between turns is that element's `row-gap` (inherited from the viewport unless a styled layer overrides it), and `TurnEstimator.estimateTurn(turn, index)` gets the turn's index.
- `useThreadViewport` throws `Thread.ScrollToBottom must be used within a Thread.Root`.

## Side Effects

- `thread.tsx` schedules `requestAnimationFrame` refreshes, waits on `document.fonts.ready`, observes viewport width with `createResizeObserver`, and re-measures the scroll margin whenever the viewport's own children change (a `MutationObserver`, `childList` only), so the rows' offset follows content above them such as the empty-state welcome leaving; scrolling is driven by `createThreadVirtualizer` (behaviors).

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
