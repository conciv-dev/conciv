# primitives/thread

## Overview

Headless `Thread` compound: viewport with virtualized turns, messages, scroll-to-bottom, suggestions and empty state, plus viewport and turn-estimate contexts.

## Interface

- `thread.tsx:Thread` - `{Root, Viewport, ViewportFooter, Messages, MessageByIndex, Unstable_MessageById, ScrollToBottom, Suggestion, Suggestions, Empty, If}`; exported as `ThreadPrimitive`; type `MessagesComponents`.
- `viewport-context.tsx:ViewportProvider`, `useThreadViewport`, `useOptionalThreadViewport`, `useSendFromUser`; types `ViewportContextValue`, `ThreadScroller`.
- `turn-estimate.tsx:TurnEstimateProvider`, `useTurnEstimator`; `viewport-internal.tsx:ViewportInternalProvider`, `useViewportInternal`.
- `virtualize-threshold.ts:VIRTUALIZE_THRESHOLD` (15).

## Invariants

- Below `VIRTUALIZE_THRESHOLD` turns the overscan equals the turn count, so nothing is evicted; above it overscan is `EVICTING_OVERSCAN` (8) with a `ROW_ESTIMATE_PX` (72) estimate (`thread.tsx`).
- `useThreadViewport` throws `Thread.ScrollToBottom must be used within a Thread.Root`.

## Side Effects

- `thread.tsx` schedules `requestAnimationFrame` refreshes, waits on `document.fonts.ready`, and observes viewport width with `createResizeObserver`; scrolling is driven by `createThreadVirtualizer` (behaviors).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
