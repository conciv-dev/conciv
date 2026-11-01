# page/src/react-grab

## Overview

Element picking through `react-grab`: a lazily created adapter that activates pick or comment mode, a picking signal, element capture for previews, and the text attached to a grab.

## Interface

- `adapter.ts:getReactGrabAdapter` - creates the adapter once and returns `{activate(onGrab), comment(onGrab), deactivate(), isActive()}` (`ReactGrabAdapter`).
- `adapter.ts:GrabSink` - `(grab: Grab) => void`.
- `picking.ts:picking` / `setPicking` - Solid signal for pick mode; `setCancelPick` / `cancelPick`.
- `capture-element.ts:captureElement` - returns a `DomPreview` (`kind: 'dom'`, html, width, height) for an element.
- `grab-text.ts:elementSnippet` / `groundGrabText` - an element's opening tag and text, with its source location from `sourceFromAttr`.
- `fallback-metrics.ts:correctFallbackMetrics` / `isStyledElement` - adjust cloned text runs whose web fonts fall back.

## Invariants

- `adapter.ts:getReactGrabAdapter` - the adapter promise is cached; later calls reuse it.

## Side Effects

- `adapter.ts:create` - sets `window.__REACT_GRAB_DISABLED__ = true`, dynamically imports `react-grab`, and sets `registerPlugin` / `unregisterPlugin` on `window.__CONCIV__`.
- `fallback-metrics.ts` - appends a temporary `<iframe>` and a holder element to `document.body` to measure fonts.
- `capture-element.ts:captureElement` - waits one `requestAnimationFrame`, clones the element with inlined computed styles into a detached `<div>`, and returns its `outerHTML`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/page` from the repo root (turbo builds the package and its dependencies first)
