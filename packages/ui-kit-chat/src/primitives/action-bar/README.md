# primitives/action-bar

## Overview

Headless per-message action bar (copy, reload, edit, export, speak, feedback) and the context providers it reads.

## Interface

- `action-bar.tsx:ActionBar` - `{Root, Copy, Reload, Edit, ExportMarkdown, Speak, StopSpeaking, FeedbackPositive, FeedbackNegative}`; exported as `ActionBarPrimitive`.
- `action-bar.tsx:useCopyStatus` - copy status accessor, `'idle'` without a provider; `action-bar.tsx:useExportMarkdown`.
- `action-handlers.tsx:ActionHandlersProvider`, `action-handlers.tsx:useActionHandlers`, type `ActionHandlers`.
- `interaction-context.tsx:ActionBarInteractionProvider`, `interaction-context.tsx:useActionBarInteraction` - `acquireInteractionLock`.

## Invariants

- `action-bar.tsx:Copy` copies only the `text` parts of the message joined by blank lines (`messageText`), and resets the copied state after `copiedDuration` (default 3000 ms).
- Buttons built with `createActionButton` render only when their handler exists (for example `onFeedback` in `ActionHandlers`).

## Side Effects

- `action-bar.tsx:Copy` writes to the clipboard via `createClipboardCopy` (`writeClipboardText` unless `writeText` is passed).
- `action-bar.tsx:useExportMarkdown` creates a `Blob` URL and clicks a temporary `<a download>` (default `message.md`) unless `onExport` is given.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
