# primitives/selection-toolbar

## Overview

Headless toolbar that appears for a non-empty text selection and can quote it into the composer.

## Interface

- `selection-toolbar.tsx:SelectionToolbar` - `{Root, Quote}`.
- `selection-toolbar.tsx:useSelectionToolbarInfo` - accessor of `SelectionInfo` (`text`, `rect`) or `null`.

## Invariants

- `selection-toolbar.tsx:Root` renders only while a selection exists; `Quote` prevents `mousedown` default so the selection survives the click.

## Side Effects

- `selection-toolbar.tsx:useSelectionToolbarInfo` listens to `document` `selectionchange`.
- `selection-toolbar.tsx:Quote` replaces the composer text with `> <selection>` via `useComposer().setText`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
