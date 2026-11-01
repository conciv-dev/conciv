# primitives/composer

## Overview

Headless `Composer` compound: input, send/cancel, attachments with adapters, quote, dictation, queue, plus draft persistence and a width-fitted actions toolbar.

## Interface

- `composer.tsx:Composer` - `{Root, Input, Send, Cancel, AddAttachment, Attachments, AttachmentDropzone, If, Quote, QuoteDismiss, Dictate, StopDictation, DictationTranscript, Queue}`; exported as `ComposerPrimitive`. `Root` props include `attachmentAdapter`, `draftStorage`, `draftKey`; `Input` props include `submitMode` (`enter` | `ctrlEnter` | `none`) and `cancelOnEscape`.
- `composer-context.tsx:ComposerProvider`, `useComposerContext`; types `ComposerDraft` (`draft`, `attachments`, `quote`), `ComposerContextValue`.
- `composer-handlers.tsx:ComposerHandlersProvider`, `useComposerHandlers`, type `ComposerHandlers`.
- `composer-actions.tsx:ComposerActions` - `{Action, ActionButton, ActionMenuItem, Inline, Leading, Trailing, Trigger}`; `composer-actions.tsx:ComposerActionsHost`.
- `composer-actions-core.ts:createActionsCoordinator`; `composer-actions-fit.ts:computeVisibleAutoCount`, `ACTION_SLOT_PX` (38), `REGION_GAP_PX` (4), `FIT_HYSTERESIS_PX` (24).

## Invariants

- Submit requires no unavailable state and either non-empty text or at least one attachment (`composer.tsx:canSubmit`).
- Enter handling ignores IME composition (`event.isComposing`); `submitMode: 'enter'` submits on Enter without Shift, `ctrlEnter` on Ctrl/Meta+Enter; Escape cancels a run when `cancelOnEscape` (default `true`) and cancel is possible.
- A file not matching the adapter `accept` throws `File type ... is not accepted`; adding attachments without an adapter throws `Attachments are not supported`.
- Drafts default to storage key `conciv-composer-draft` (`composer.tsx:DEFAULT_DRAFT_KEY`) and are restored only when `draftStorage` is passed.
- `composer-actions-fit.ts:computeVisibleAutoCount` only grows the visible count when the extra space exceeds `FIT_HYSTERESIS_PX`, to avoid flicker.
- `useComposerContext` throws `Composer.* must be used within a Composer.Root`.

## Side Effects

- Pasting files into the input adds them as attachments and calls `preventDefault` (`composer.tsx:pastedFiles`).
- `composer.tsx:Root` reads and writes the draft through `readComposerDraft` and `useComposerDraftPersistence` (see behaviors).
- `composer-actions.tsx:ComposerActionsHost` observes region widths with `makeResizeObserver`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
