# ui-kit-chat/src/behaviors

## Overview

DOM-level behaviors used by primitives: the thread virtualizer with end-following scroll, composer draft persistence, a scroll lock for animations and a size observer.

## Interface

- `create-thread-virtualizer.ts`: the thread virtualizer, with end-following scroll and an early `nearStart` so older history loads before the reader reaches the top.
- `composer-draft-storage.ts`, `use-composer-draft.ts`: the composer draft's persistence to a `WebStorage`, or to a host `writer`.
- `use-scroll-lock.ts`, `use-size-handle.ts`: a scroll lock for animations and a size observer.

## Invariants

- `composer-draft-storage.ts:readComposerDraft` returns `null` for missing or unparseable data; restored attachments get status `requires-action`.
- `composer-draft-storage.ts:writeComposerDraft` persists attachments only within a shared `MAX_PERSISTED_ATTACHMENT_CHARACTERS` (1,000,000) budget and ignores storage write errors; `encodeAttachments` leaves out an attachment with no `File`, one over the budget, and one whose bytes cannot be read, and logs only the last with `console.error`, naming the file.
- `use-composer-draft.ts:useComposerDraftPersistence` debounces writes by `DRAFT_WRITE_DELAY_MS` (300); a cleared draft cancels the pending write and is written once immediately.
- `use-composer-draft.ts:useComposerDraftPersistence` with a `writer` set: every change goes to the writer at once, with the attachments' `File`s and nothing encoded, and the kit writes no storage, debounces nothing and flushes nothing of its own; the host owns when and where the draft is kept. A cleared draft reaches the writer only after a typed one. conciv's pane uses this to keep the draft in two copies, this browser's `conciv-drafts` first and the engine second (see `packages/frontend-defaults/src/pane/README.md`).
- `create-thread-virtualizer.ts` keeps following the end only while the reader has not scrolled away (`ReaderInput`: `untouched`, `holding`, `touched`), and re-lands on the end after a scroll write while still on the landing offset.
- `create-thread-virtualizer.ts:landOnEnd` (opening a chat, sending, following a stream) is one instant scroll write at the virtualizer-computed end offset, never an instance `scrollTo*` command. `glideToEnd` (the Latest button) first jumps instantly, with the same one-shot write, to `GLIDE_VIEWPORTS` (2) viewport heights above the end when the reader is further up, then is the only caller of the instance's `scrollToEnd({behavior: 'smooth'})` for the rest, so the glide mounts and measures only the last rows; under `prefers-reduced-motion: reduce` it lands instantly like `landOnEnd`. While the glide travels the reader is `gliding-to-end`; an older page that lands above it then (the first row's key changes) cancels the smooth command and lands instantly instead, because virtual-core drops its prepend anchor while a smooth command travels and would stretch the glide across the new page. A wheel, touch, key or pointer on the thread calls `cancelScroll()`, because virtual-core keeps a travelling smooth command alive through user scroll events and re-aims it whenever the end moves, which would drag the reader back. A scroll that arrives at the end (not under a held pointer) adopts it as the landing, so a finished glide follows the stream like an instant landing. A downward wheel whose distance (`deltaY` in pixels, lines times the thread's line height, or pages times its height) reaches the end marks the reader as aiming at the end, so it follows the stream even when the end moves mid-scroll; a wheel an inner scroller on its path takes (vertical `overflow` `auto`/`scroll` with room left below, or `overscroll-behavior` that stops chaining) never does.

## Side Effects

- `use-composer-draft.ts` writes to the provided `WebStorage` and flushes on `window` `pagehide`, whenever an element in the composer form loses focus, its own buttons included (a native `focusout` listener on the form, since a focus move inside a shadow root never reaches a document-level or delegated listener), and when the composer unmounts; with a `writer` set it only calls the writer.
- `create-thread-virtualizer.ts` adds passive `scroll`, `pointerdown`, `wheel`, `touchmove`, `keydown` listeners on the scroll element and `pointerup`/`pointercancel` on its document, a resize observer that lands the thread on its end again when the reader was resting on the end (a strip above the composer, such as the queue or the unsaved draft notice, or a taller composer, shrinks the viewport without a scroll, so the last row would slide under its bottom edge; the end offset is read from the element's live `scrollHeight - clientHeight`, so the virtualizer's frame-deferred rect is never stale for it), and otherwise only re-reads the at-end and near-start edges (row rendering follows the virtualizer's own frame-deferred rect observer, so a resize callback never mounts or unmounts rows), and a `MutationObserver` on the element ancestry.
- `use-scroll-lock.ts:useScrollLock` sets `scrollbarWidth: none` and padding on the nearest scrollable ancestor for `animationDuration` ms, then restores them.
- `use-size-handle.ts:useSizeHandle` observes the element with a `ResizeObserver`.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
