# extensions

## Overview

Built-in `highlight` extension: hold Alt (or drive it from context) to outline the element under the pointer and click to open its source.

## Interface

- `highlight` (`highlight.tsx`): default export, `defineExtension({name: 'highlight', Surface: HighlightSurface}).client(...)`; `createConcivRouter` always prepends it
- `HighlightSurface` (`highlight.tsx`): active while Alt is held outside editable fields or `context.driven()` is true

## Invariants

- `highlight.tsx:isEditing`: Alt does not activate highlighting while focus is in an input, textarea or contenteditable
- `highlight.tsx`: elements are resolved through `[data-conciv-source],[data-tsd-source]` and `elementAt`, which skips `[data-conciv-effects]` nodes
- `highlight.tsx`: Escape exits inspection

## Side Effects

- `highlight.tsx`: capture-phase `pointermove`, `click`, `keydown`, `scroll` and `resize` listeners on `window` while active
- `highlight.tsx`: click calls `openSource` from `@conciv/extension/client` against `resolveApiBase()` and shows a toast with `showToast`
- `highlight.tsx`: `requestAnimationFrame` repositioning, cancelled on cleanup

## Verification

- Run: `cd apps/conciv && pnpm typecheck && pnpm lint && pnpm test`
