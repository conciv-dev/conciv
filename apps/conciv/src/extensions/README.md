# extensions

## Overview

Built-in `highlight` extension: hold Alt (or drive it from context) to outline the element under the pointer and click to open its source. Also the hub dock layer that shows Devframe iframe docks beside the chat.

## Interface

- `highlight` (`highlight.tsx`): default export, `defineExtension({name: 'highlight', Surface: HighlightSurface}).client(...)`; `createConcivRouter` always prepends it
- `HighlightSurface` (`highlight.tsx`): active while Alt is held outside editable fields or `context.driven()` is true

- `createShownDocks`, `DockLayer`, `dockViewId`, `dockIdOfView` (`devframe-docks.tsx`): the hub's iframe docks shown as panel tabs, and the layer that renders them

## Invariants

- `highlight.tsx:isEditing`: Alt does not activate highlighting while focus is in an input, textarea or contenteditable
- `highlight.tsx`: elements are resolved through `[data-conciv-source],[data-tsd-source]` and `elementAt`, which skips `[data-conciv-effects]` nodes
- `highlight.tsx`: Escape exits inspection
- `devframe-docks.tsx:createShownDocks`: only iframe docks whose `when` is not `'false'`, and only when the hub base resolves to the page origin
- `devframe-docks.tsx:DockLayer`: an opened dock stays mounted (hidden while inactive) so its state survives tab switches

## Side Effects

- `highlight.tsx`: capture-phase `pointermove`, `click`, `keydown`, `scroll` and `resize` listeners on `window` while active
- `highlight.tsx`: click calls `openSource` from `@conciv/extension/client` against `resolveApiBase()` and shows a toast with `showToast`
- `highlight.tsx`: `requestAnimationFrame` repositioning, cancelled on cleanup

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
