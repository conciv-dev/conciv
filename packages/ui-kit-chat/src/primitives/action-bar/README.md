# ui-kit-chat/src/primitives/action-bar

## Overview

Headless per-message action bar (copy, reload, edit, export, speak, feedback) and the context providers it reads.

## Interface

- `action-bar.tsx`: the `ActionBar` compound (copy, reload, edit, export, speak, feedback), exported as `ActionBarPrimitive`; `action-handlers.tsx` and `interaction-context.tsx`: the handlers and the interaction lock it reads.

## Invariants

- `action-bar.tsx:Copy` copies its `text` prop when given, else only the `text` parts of the message joined by blank lines (`messageText`), and resets the copied state after `copiedDuration` (default 3000 ms).
- Buttons built with `createActionButton` render only when their handler exists (for example `onFeedback` in `ActionHandlers`).

## Side Effects

- `action-bar.tsx:Copy` writes to the clipboard via `createClipboardCopy` (`writeClipboardText` unless `writeText` is passed).
- `action-bar.tsx:useExportMarkdown` creates a `Blob` URL and clicks a temporary `<a download>` (default `message.md`) unless `onExport` is given.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
