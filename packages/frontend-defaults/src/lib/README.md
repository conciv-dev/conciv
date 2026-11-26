# frontend-defaults/src/lib

## Overview

DOM and browser helpers: shadow root styling with fonts, host theme detection, draggable launcher position, focus lookup, hotkeys, quick-terminal search params and the panel open flag.

## Interface

- `shadow.ts`, `widget-styles.ts`: every app root gets the fonts on the document; a shadow root also adopts the one widget stylesheet and its CSS properties go to the document.
- `color-scheme.ts`: the host page's theme (scheme and skin).
- `draggable-position.ts`, `draggable-physics.ts`: the launcher's drag, a port of the TanStack Devtools floating trigger, and the pure geometry, throw physics and stored placement schema behind it.
- `host-focus.ts`, `hotkey.ts`, `leave-screen.ts`, `widget-layer.ts`: focus lookup on the host page, hotkey parsing (`@tanstack/hotkeys`), leaving a session's screen, the widget's z-index.
- `session-search-schemas.ts`, `quick-search.ts`: the root route's search params (`open`, `sessionSearch`, `allProjects`) and the quick terminal's (`panes`, `focus`).
- The media query helper lives in `@internal/frontend-app-api/lib/media-query`.

## Invariants

- `widget-styles.ts:widgetSheet`: es-toolkit `once`, so the page's `document` gets one sheet, made on first call; every widget root in it (widget, plugin overlays) adopts the same object; the picture-in-picture window makes and holds its own (`shell/pip.ts`) and no root carries the CSS text in a `<style>`; `@property` and `@font-face` stay in `document.head` (`registerWind4Properties`, `registerFonts`)
- `quick-search.ts:quickPaneIds`: only values passing `isSessionId` are kept; invalid `panes`/`focus` fall back to `''`/`0`
- `../routes/__root.tsx:setShutter`: closed is represented by an absent `open` param, never `open=false`
- `draggable-physics.ts:parsePlacement`: anything that is not a preset string or a valid placement reads as `undefined`, so the configured position wins; percents outside 0 to 100 are rejected

## Side Effects

- `draggable-position.ts:createDraggablePosition`: reads and writes the placement (a corner, a free spot as a percent of the free space, or a hidden edge, as JSON; a stored preset string from before still reads as that corner) under `storageKey` through `readStorage`/`writeStorage` from `@conciv/ui-kit-system`; window pointer and Escape listeners; pointer capture on the pressed launcher; a Web Animations settle or throw on release, skipped under reduced motion
- `shadow.ts:styleRoot`: adds the fonts to the document for any root; for a shadow root it also sets `adoptedStyleSheets` to the widget sheet and adds the CSS properties to the document
- `color-scheme.ts:createHostTheme`: `MutationObserver` on `document.body` and `documentElement` class changes
- `../routes/__root.tsx:setShutter`: router navigation that replaces the history entry

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=@internal/frontend-defaults` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
