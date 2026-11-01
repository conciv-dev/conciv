# design/src/xray

## Overview

entry.tsx mounts a TanStack Solid router on the `[data-design-xray]` element in index.html. data.ts fetches reports and targets through the extension RPC client (the router type comes from ../server/xray-routes.ts), turns reports into rows, and triggers design_diff and editor opening through the session RPC. list.tsx, stage.tsx, topbar.tsx and frame.tsx are the UI components; shortcuts.ts binds keyboard actions; xray-schemas.ts validates URL search params; dev-fixture.ts supplies static fixture data for development.

## Interface

- `loadXray` (`data.ts`): loads the report for an id, its sibling targets on the same route and their reports, then calls `assemble`
- `assemble` (`data.ts`): builds `XrayData` (target, report, image urls, widths sorted ascending with off counts, ranAt)
- `runDiff` (`data.ts`): calls `rpc.registry.call({name: 'design_diff', ...})` with the target id and width
- `openInEditor` (`data.ts`): calls `rpc.editor.open({file, line})`
- `reportRows` / `rowAboveTolerance` / `sourceLabel` / `diffCommand` (`data.ts`): turn reports into rows, apply the tolerance check, format a label, and build the `conciv tools design diff --target <id> --width <w>` command string
- `Row`, `WidthTab`, `XrayImages`, `XrayData`, `ReportResponse`, `Delta` (`data.ts`): view-model types
- `loadFixture` (`dev-fixture.ts`): returns static XrayData for three targets (390/1280/2560) with SVG data-url images
- `fixPrompt` / `traced` (`fix-prompt.ts`): builds a copyable 'Fix ... to match the design' prompt from the traced deltas
- `Frame` (`frame.tsx`): browser-chrome figure that shows content scaled to target width×height, or a failure message
- `ComponentList`, `filterRows`, `percent`, `SMALL_BUTTON`, `Filter` (`list.tsx`): component list sidebar with filter and search
- `Stage`, `StageToolbar`, `fitScale`, `clampZoom`, `zoomStep`, `MODES`, `Mode`, `Canvas`, `StageView` (`stage.tsx`): image canvas with live/design/diff/side/slider modes, zoom, pan and box overlay
- `Topbar`, `RunButton` (`topbar.tsx`): header with route, width tabs, mismatch summary and run button
- `createShortcuts`, `SHORTCUT_HELP`, `ShortcutActions` (`shortcuts.ts`): keyboard bindings J/K, 1-5, B, R, Enter, 0, =/+/-, ?
- `createXrayRouter` (`router.tsx`): TanStack router whose URL rewrite maps the real page path to '/' on input and back on output
- `XraySearchSchema`, `XraySearch` (`xray-schemas.ts`): zod schema for the search params target, session, mode, component, filter, q, fixture
- Subdirectories:
  - [routes](./routes/README.md): TanStack Solid route definitions for the x-ray viewer: a root route that renders an Outlet and the index route that renders the full x-ray page.

## Invariants

- `XraySearchSchema` (`xray-schemas.ts`) uses `.catch` on every field so invalid params fall back to defaults; filter 'unmatched' is mapped to 'above'
- `fitScale` (`stage.tsx`) clamps between `MIN_FIT` 0.05 and 1; `clampZoom` clamps between `MIN_ZOOM` 0.25 and `MAX_ZOOM` 4; `zoomStep` snaps to `ZOOM_STEPS`
- `StageToolbar` (`stage.tsx`) disables every mode except 'design' until a diff has run
- `createShortcuts` (`shortcuts.ts`) ignores keydown events that are defaultPrevented, use meta/ctrl/alt, target inputs, textareas, selects or contentEditable, or are inside `[role=dialog], [role=listbox]`; Enter only fires when the target is body or documentElement
- `rowAboveTolerance` (`data.ts`) counts unmatched rows and rows with null mismatch as above tolerance
- `fixPrompt` (`fix-prompt.ts`) returns null when no delta is traced (`via` defined, not 'unknown', and `file` defined)
- `loadXray` (`data.ts`) reuses the current response for the current target instead of fetching it again
- `sessionClient` in `data.ts` (used by `runDiff`/`openInEditor`) resolves a session through `sessions.resolve` when none is given and sends it in the `CONCIV_SESSION_HEADER` header

## Side Effects

- Network: `loadXray` (`data.ts`) calls the extension RPC `xray.report` and `xray.targets` under slug 'design', based on `window.location.href`
- Network: `runDiff` (`data.ts`) invokes the design_diff tool through `registry.call`; `openInEditor` (`data.ts`) calls `editor.open`, which opens a file in the user's editor
- DOM: `entry.tsx` renders into the `[data-design-xray]` element; `createShortcuts` (`shortcuts.ts`) adds a window keydown listener
- DOM: `Stage` (`stage.tsx`) attaches a ResizeObserver, captures pointers and changes viewport scrollLeft/scrollTop; `ComponentList` rows (`list.tsx`) call scrollIntoView when selected
- Global state: `createXrayRouter` (`router.tsx`) reads `window.location.pathname` and rewrites the browser URL

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
