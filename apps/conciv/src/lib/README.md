# lib

## Overview

DOM and browser helpers: api base resolution, shadow root creation with fonts, host theme detection, draggable launcher position, focus and element lookup, hotkeys, quick-terminal search params and the panel open flag.

## Interface

- `resolveApiBase()` (`api-base.ts`): `window.__CONCIV_API_BASE__`, else `<meta name="conciv-api-base">`, else `?core=`; exported as `@conciv/app/api-base`
- `createShadowRoot`, `registerFonts`, `registerWind4Properties` (`shadow.ts`): open shadow root with inlined styles; exported as `@conciv/app/shadow`
- `createHostTheme`, `applySchemeClass`, `applySkinClass`, `themeClasses`, `HostTheme`, `ColorScheme` (`color-scheme.ts`)
- `createDraggablePosition({initial, storageKey})`, `DraggablePosition`, `LauncherAnchor`, `launcherPlacement`, `panelPlacement` (`draggable-position.ts`): the launcher's drag, a port of the TanStack Devtools floating trigger: a press past 4px drags with the grab point under the pointer, a release throws with friction and wall bounce, a release within 72px of a corner pins it there (holding still 2s on a corner switches that corner off for the drag, Shift steers to the corner the drag heads for), a release anywhere else stays put, a drag past an edge hides it into a tab, Escape drops the gesture; arrows nudge the focused launcher and Shift with an arrow sends it to a corner. `LauncherAnchor` holds the collapsed launcher's `left`, `right` and `top` plus the screen-half `corner`; `growsTowardStart(labelWidth)` is true when the opened pill (collapsed launcher plus the label's natural width) would cross the right margin from the launcher's resting left (or its live drag position), so hovering never flips it; `launcherPlacement` places the launcher by `left` and `top` so its pill grows to the right, or by `right` and `top` when it grows toward the start, so the robot never moves; `panelPlacement` opens the chat panel toward the free side of the launcher's screen half, aligned to its right edge on the right half
- `clamp`, `cornerAt`, `cornerCoords`, `directionCorner`, `quadrantCorner`, `offScreenEdge`, `stepAxis`, `throwPath`, `toPercent`, `toPixels`, `parsePlacement`, `presetPlacement` (`draggable-physics.ts`): the pure geometry and throw physics behind the drag, and the stored placement schema
- `createMediaQuery(query)`, `PHONE_MEDIA_QUERY` (`media-query.ts`): `(max-width: 520px)`
- `hostFocusTarget`, `hostPageHasFocus` (`host-focus.ts`)
- `elementAt(x, y)` (`element-at.ts`): top element at a point that is not inside `[data-conciv-effects]`
- `createHotkeyRegistry()` (`hotkey-registry.ts`): the host `hotkeys` member; `register({binding, handler, label, owner})` binds through `createHotkey` with `parseHotkey`, refuses a binding another owner holds (the error names both), and `bindings()` lists every held binding with its label and owner
- `QuickSearchSchema`, `quickPaneIds`, `quickSearchFor` (`quick-search.ts`): `panes` (comma-separated session ids) and `focus` search params
- `setShutter(router, open)` (`shutter.ts`): sets or clears the `open` search param with `replace: true`

## Invariants

- `api-base.ts:queryCore`: `?core=` is accepted only for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) or the page's own origin; others are ignored with a warning
- `quick-search.ts:quickPaneIds`: only values passing `isSessionId` are kept; invalid `panes`/`focus` fall back to `''`/`0`
- `shutter.ts:setShutter`: closed is represented by an absent `open` param, never `open=false`
- `draggable-physics.ts:parsePlacement`: anything that is not a preset string or a valid placement reads as `undefined`, so the configured position wins; percents outside 0 to 100 are rejected

## Side Effects

- `draggable-position.ts:createDraggablePosition`: reads and writes the placement (a corner, a free spot as a percent of the free space, or a hidden edge, as JSON; a stored preset string from before still reads as that corner) under `storageKey` through `readStorage`/`writeStorage` from `@conciv/ui-kit-system`; window pointer and Escape listeners; pointer capture on the pressed launcher; a Web Animations settle or throw on release, skipped under reduced motion
- `shadow.ts:createShadowRoot`: `attachShadow({mode: 'open'})` and style injection; `registerFonts`/`registerWind4Properties` add fonts and CSS properties to the document
- `shadow.ts`: toggles a selection attribute on `document.documentElement`
- `color-scheme.ts:createHostTheme`: `MutationObserver` on `document.body` and `documentElement` class changes
- `api-base.ts:queryCore`: `console.warn` on a rejected `?core=`
- `shutter.ts:setShutter`: router navigation that replaces the history entry

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
