---
'@conciv/ui-kit-chat': patch
---

Fixed a `ResizeObserver loop completed with undelivered notifications` window error that fired repeatedly while a thread's turns were virtualized (above the virtualize threshold). The thread virtualizer's viewport-rect observer now defers its handling to the next animation frame (`useAnimationFrameWithResizeObserver`), matching the existing `top-anchor.ts` convention for resize-driven layout writes, instead of recomputing measurements synchronously inside the `ResizeObserver` callback.
