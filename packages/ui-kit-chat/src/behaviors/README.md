# behaviors

## Overview

DOM-level behaviors used by primitives: the thread virtualizer with end-following scroll, composer draft persistence, a scroll lock for animations and a size observer.

## Interface

- `create-thread-virtualizer.ts:createThreadVirtualizer` - returns `ThreadVirtualizer` (`items`, `totalSize`, `measured`, `atEnd`, `landOnEnd`, `measureRow`, `remeasure`); `SCROLL_END_THRESHOLD_PX` (1); type `ThreadVirtualizerConfig`.
- `composer-draft-storage.ts:readComposerDraft`, `composer-draft-storage.ts:writeComposerDraft`, type `PersistedComposerDraft`.
- `use-composer-draft.ts:useComposerDraftPersistence`, type `ComposerDraftPersistenceOptions`.
- `use-scroll-lock.ts:useScrollLock`; `use-size-handle.ts:useSizeHandle`.

## Invariants

- `composer-draft-storage.ts:readComposerDraft` returns `null` for missing or unparseable data; restored attachments get status `requires-action`.
- `composer-draft-storage.ts:writeComposerDraft` persists attachments only within a shared `MAX_PERSISTED_ATTACHMENT_CHARACTERS` (1,000,000) budget and ignores storage write errors.
- `use-composer-draft.ts:useComposerDraftPersistence` debounces writes by `DRAFT_WRITE_DELAY_MS` (300); a cleared draft cancels the pending write and is written once immediately.
- `create-thread-virtualizer.ts` keeps following the end only while the reader has not scrolled away (`ReaderInput`: `untouched`, `holding`, `touched`), and re-lands on the end after a scroll write while still on the landing offset.

## Side Effects

- `use-composer-draft.ts` writes to the provided `WebStorage` and flushes on `window` `pagehide`.
- `create-thread-virtualizer.ts` adds passive `scroll`, `pointerdown`, `wheel`, `touchmove`, `keydown` listeners on the scroll element and `pointerup`/`pointercancel` on its document, a resize observer, and a `MutationObserver` on the element ancestry.
- `use-scroll-lock.ts:useScrollLock` sets `scrollbarWidth: none` and padding on the nearest scrollable ancestor for `animationDuration` ms, then restores them.
- `use-size-handle.ts:useSizeHandle` observes the element with a `ResizeObserver`.

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
