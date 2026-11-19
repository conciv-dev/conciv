# primitives/composer

## Overview

Headless `Composer` compound: input, send/cancel, attachments with adapters, quote, dictation, queue, plus draft persistence and a width-fitted actions toolbar.

## Interface

- `composer.tsx:Composer` - `{Root, Input, Send, Cancel, AddAttachment, Attachments, AttachmentDropzone, If, Quote, QuoteDismiss, Dictate, StopDictation, DictationTranscript, Queue}`; exported as `ComposerPrimitive`. `Root` props include `attachmentAdapter`, `draftStorage`, `draftKey`; `Input` props include `submitMode` (`enter` | `ctrlEnter` | `none`) and `cancelOnEscape`.
- `composer-context.tsx:ComposerProvider`, `useComposerContext`; types `ComposerDraft` (`draft`, `attachments`, `quote`), `ComposerContextValue`.
- `composer-handlers.tsx:ComposerHandlersProvider`, `useComposerHandlers`, type `ComposerHandlers`.
- `composer-actions.tsx:ComposerActions` - `{Action, ActionButton, ActionMenuItem, Inline, Leading, Trailing, Trigger}`; `composer-actions.tsx:ComposerActionsHost`.
- `composer-actions-core.ts:createActionsCoordinator`; `composer-actions-core.ts:computeVisibleAutoCount`, `ACTION_SLOT_PX` (38), `REGION_GAP_PX` (4), `FIT_HYSTERESIS_PX` (24).

## Invariants

- Submit requires no unavailable state and either non-empty text or at least one attachment (`composer.tsx:canSubmit`).
- Enter handling ignores IME composition (`event.isComposing`); `submitMode: 'enter'` submits on Enter without Shift, `ctrlEnter` on Ctrl/Meta+Enter; Escape cancels a run when `cancelOnEscape` (default `true`) and cancel is possible.
- A file not matching the adapter `accept` throws `File type ... is not accepted`; adding attachments without an adapter throws `Attachments are not supported`.
- Drafts default to storage key `conciv-composer-draft` (`composer.tsx:DEFAULT_DRAFT_KEY`) and are restored only when `draftStorage` is passed.
- A failed send puts the draft back in the composer only when the message never left: the send rejected (the send handler threw, or the chat's `sendMessage` rejected, as the conciv session does for a send the engine refused or a Stop withdrew, after dropping that message). A send that resolves with a new chat error (the engine started the run and it failed, with or without a reply) leaves the draft empty, because the message is in the conversation; `onSendError` fires either way. Which sends come back is decided by which sends reject: see `sendMessage` in `packages/ai/src/session/README.md`. The put-back message goes first and anything already in the composer (text typed while it was sending, or queued messages the app returned when the stream gave up) follows it on the next line, so neither is dropped; a quote already in the composer is kept.
- Items are kept by `key`: `addItem` keeps the existing item when its key is already there, `updateItem` changes the value of the item with that key, `removeItem` drops it. The kit never reads `value`. Items travel with the draft: snapshot and restore, the put-back of a failed send, clear, and the persisted form.
- A quote (`Composer.Quote`, `setQuote`) is kept in the kit's own persisted form only: the app saves drafts to the engine's draft row, whose `DraftRowSchema` has no quote, and the app's bridge writes `quote: null`, so a quote is lost on a reload there. Saving it is to be built with whatever first mounts a quote UI.
- `composer-actions-core.ts:computeVisibleAutoCount` only grows the visible count when the extra space exceeds `FIT_HYSTERESIS_PX`, to avoid flicker.
- `useComposerContext` throws `Composer.* must be used within a Composer.Root`.

## Side Effects

- Pasting files into the input adds them as attachments and calls `preventDefault` (`composer.tsx:pastedFiles`).
- `composer.tsx:Root` reads and writes the draft through `readComposerDraft` and `useComposerDraftPersistence` (see behaviors).
- `composer-actions.tsx:ComposerActionsHost` observes region widths with `makeResizeObserver`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
