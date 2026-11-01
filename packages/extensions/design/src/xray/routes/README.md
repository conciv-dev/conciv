# design/src/xray/routes

## Overview

__root.tsx defines the root route. index.tsx defines the '/' route, which validates search params with XraySearchSchema and drops default values from the URL. XrayPage loads data (or the dev fixture), keeps mode, boxes, zoom and slider as view state, and connects Topbar, StageToolbar, Stage, ComponentList, the keyboard shortcuts and the shortcuts dialog.

## Interface

- `rootRoute` (`__root.tsx`): `createRootRoute({component: Outlet})`
- `indexRoute` (`index.tsx`): route at path '/' with `validateSearch: XraySearchSchema`, a `stripSearchParams({target: '', filter: 'all'})` middleware and component `XrayPage`

## Invariants

- `indexRoute` (`index.tsx`): `loadData` uses `loadFixture` only when `import.meta.env.DEV` is set and search `fixture === 1`; otherwise it calls `loadXray`
- `indexRoute` (`index.tsx`): mode is forced to 'design' until a report exists; after that it is the search mode, then the stored mode, then 'slider'
- `indexRoute` (`index.tsx`): `chooseMode` does nothing before a diff has run; `run` does nothing while already running; `open` does nothing for a null source or while an open is in progress
- `indexRoute` (`index.tsx`): zoom values go through `clampZoom`; J/K stepping wraps around the visible rows
- `indexRoute` (`index.tsx`): on a failed diff the alert includes the error and the fallback `diffCommand` to run in a terminal

## Side Effects

- localStorage: `indexRoute` (`index.tsx`) reads and writes the keys `conciv.design.xray.mode` and `conciv.design.xray.boxes` via `readStorage`/`writeStorage`
- Network: `indexRoute` (`index.tsx`) calls `loadXray`, `runDiff` (design_diff) and `openInEditor`, and refetches after a successful run
- URL: `indexRoute` (`index.tsx`) updates search params with `navigate({replace: true})`
- DOM: `indexRoute` (`index.tsx`) registers global keyboard shortcuts via `createShortcuts` and updates an aria-live status region

## Verification

- Run: `cd packages/extensions/design && pnpm typecheck && pnpm lint` (the package has no `test` script)
