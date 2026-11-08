# behaviors

## Overview

DOM-level behaviors used by primitives: the thread virtualizer with end-following scroll, composer draft persistence, a scroll lock for animations and a size observer.

## Interface

- `create-thread-virtualizer.ts:createThreadVirtualizer` - returns `ThreadVirtualizer` (`items`, `totalSize`, `measured`, `atEnd`, `nearStart` (scrolled within three viewport heights of the top, so older history loads before the reader reaches it), `landOnEnd`, `glideToEnd`, `measureRow`, `remeasure`); `SCROLL_END_THRESHOLD_PX` (1); type `ThreadVirtualizerConfig`.
- `composer-draft-storage.ts:readComposerDraft`, `composer-draft-storage.ts:writeComposerDraft`, type `PersistedComposerDraft`.
- `use-composer-draft.ts:useComposerDraftPersistence`, type `ComposerDraftPersistenceOptions`.
- `use-scroll-lock.ts:useScrollLock`; `use-size-handle.ts:useSizeHandle`.

## Invariants

- `composer-draft-storage.ts:readComposerDraft` returns `null` for missing or unparseable data; restored attachments get status `requires-action`.
- `composer-draft-storage.ts:writeComposerDraft` persists attachments only within a shared `MAX_PERSISTED_ATTACHMENT_CHARACTERS` (1,000,000) budget and ignores storage write errors.
- `use-composer-draft.ts:useComposerDraftPersistence` debounces writes by `DRAFT_WRITE_DELAY_MS` (300); a cleared draft cancels the pending write and is written once immediately.
- `create-thread-virtualizer.ts` keeps following the end only while the reader has not scrolled away (`ReaderInput`: `untouched`, `holding`, `touched`), and re-lands on the end after a scroll write while still on the landing offset.
- `create-thread-virtualizer.ts:landOnEnd` (opening a chat, sending, following a stream) is one instant scroll write at the virtualizer-computed end offset, never an instance `scrollTo*` command. `glideToEnd` (the Latest button) first jumps instantly, with the same one-shot write, to `GLIDE_VIEWPORTS` (2) viewport heights above the end when the reader is further up, then is the only caller of the instance's `scrollToEnd({behavior: 'smooth'})` for the rest, so the glide mounts and measures only the last rows; under `prefers-reduced-motion: reduce` it lands instantly like `landOnEnd`. A wheel, touch, key or pointer on the thread calls `cancelScroll()`, because virtual-core keeps a travelling smooth command alive through user scroll events and re-aims it whenever the end moves, which would drag the reader back. A scroll that arrives at the end (not under a held pointer) adopts it as the landing, so a finished glide follows the stream like an instant landing.

## Side Effects

- `use-composer-draft.ts` writes to the provided `WebStorage` and flushes on `window` `pagehide`.
- `create-thread-virtualizer.ts` adds passive `scroll`, `pointerdown`, `wheel`, `touchmove`, `keydown` listeners on the scroll element and `pointerup`/`pointercancel` on its document, a resize observer that only re-reads the at-end and near-start edges (row rendering follows the virtualizer's own frame-deferred rect observer, so a resize callback never mounts or unmounts rows), and a `MutationObserver` on the element ancestry.
- `use-scroll-lock.ts:useScrollLock` sets `scrollbarWidth: none` and padding on the nearest scrollable ancestor for `animationDuration` ms, then restores them.
- `use-size-handle.ts:useSizeHandle` observes the element with a `ResizeObserver`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
