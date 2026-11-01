# lib

## Overview

DOM and browser helpers: api base resolution, shadow root creation with fonts, host theme detection, draggable launcher position, focus and element lookup, hotkeys, quick-terminal search params and the panel open flag.

## Interface

- `resolveApiBase()` (`api-base.ts`): `window.__CONCIV_API_BASE__`, else `<meta name="conciv-api-base">`, else `?core=`; exported as `@conciv/app/api-base`
- `createShadowRoot`, `registerFonts`, `registerWind4Properties` (`shadow.ts`): open shadow root with inlined styles; exported as `@conciv/app/shadow`
- `createHostTheme`, `applySchemeClass`, `applySkinClass`, `themeClasses`, `HostTheme`, `ColorScheme` (`color-scheme.ts`)
- `createDraggablePosition({initial, storageKey})`, `DraggablePosition` (`draggable-position.ts`): snaps to the nearest preset corner and persists it
- `createMediaQuery(query)`, `PHONE_MEDIA_QUERY` (`media-query.ts`): `(max-width: 520px)`
- `hostFocusTarget`, `hostPageHasFocus` (`host-focus.ts`)
- `elementAt(x, y)` (`element-at.ts`): top element at a point that is not inside `[data-conciv-effects]`
- `toRawHotkey(binding)` (`hotkey.ts`): `parseHotkey` from `@tanstack/hotkeys`
- `QuickSearchSchema`, `quickPaneIds`, `quickSearchFor` (`quick-search.ts`): `panes` (comma-separated session ids) and `focus` search params
- `setShutter(router, open)` (`shutter.ts`): sets or clears the `open` search param with `replace: true`

## Invariants

- `api-base.ts:queryCore`: `?core=` is accepted only for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) or the page's own origin; others are ignored with a warning
- `quick-search.ts:quickPaneIds`: only values passing `isSessionId` are kept; invalid `panes`/`focus` fall back to `''`/`0`
- `shutter.ts:setShutter`: closed is represented by an absent `open` param, never `open=false`

## Side Effects

- `draggable-position.ts:createDraggablePosition`: reads and writes the position under `storageKey` through `readStorage`/`writeStorage` from `@conciv/ui-kit-system`
- `shadow.ts:createShadowRoot`: `attachShadow({mode: 'open'})` and style injection; `registerFonts`/`registerWind4Properties` add fonts and CSS properties to the document
- `shadow.ts`: toggles a selection attribute on `document.documentElement`
- `color-scheme.ts:createHostTheme`: `MutationObserver` on `document.body` and `documentElement` class changes
- `api-base.ts:queryCore`: `console.warn` on a rejected `?core=`
- `shutter.ts:setShutter`: router navigation that replaces the history entry

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
