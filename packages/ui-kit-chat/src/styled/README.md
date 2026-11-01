# styled

## Overview

The themed component set built on the primitives: thread, composer, markdown with worker-based highlighting and mermaid diagrams, action bars, activity, groups, model selector and small display parts. Classes are UnoCSS utilities over `--chat-*` tokens.

## Interface

- `thread.tsx:Thread` - `{Root, Viewport, Welcome, Messages, Composer}`; types `ThreadComponents`, `ThreadRootProps`, `ThreadMessagesProps` (`tools`, `grouping`, `groupEntries`, `pageSession`, `attachmentCards`).
- `composer.tsx:Composer` (`ComposerProps`); `markdown.tsx:Markdown` (`MarkdownProps`: `content`, `streaming`), `markdown.tsx:warmHighlighter`, `isHighlighterWarming`.
- `action-bar.tsx:AssistantActionBar`, `UserActionBar`; `activity.tsx:Activity` (`{Root, Timeline}`); `group.tsx:Group` (`{Root, Trigger, Content}`); `reasoning.tsx:Reasoning`, `ReasoningText`.
- `model-selector.tsx:ModelSelector` (`StyledModelSelectorProps`); `branch-picker.tsx:BranchPicker`; `follow-up-suggestions.tsx:FollowUpSuggestions`; `attachment-ui.tsx:AttachmentUI`; `attachment-dispatch.tsx:AttachmentByMime`, `createDocumentAttachmentAdapter`, type `AttachmentCardSlot`.
- `now-line.tsx:NowLine`, `morph-label.tsx:MorphLabel`, `virtual-lines.tsx:VirtualLines`, `shimmer.ts:SHIMMER`, `classes.ts:FOCUS`, `turn-classes.ts`, `text-metrics.ts:createTurnEstimator`.
- `highlight-worker.ts` / `highlight-shared.ts` - worker message types `MainToWorkerMessage`, `WorkerToMainMessage`.
- Subdirectory: [trace](./trace/README.md) - trace list and rows.

## Invariants

- `markdown.tsx` caches highlights and diagrams in bounded stores of `MAX_CACHE_ENTRIES` (512), evicting oldest first.
- `markdown.tsx:createBackend` returns `null` when `Worker` is undefined, so highlighting is skipped outside browsers.
- `now-line.tsx` and `morph-label.tsx` honor `(prefers-reduced-motion: reduce)`.

## Side Effects

- `markdown.tsx` starts an inline web worker (`highlight-worker.ts?worker&inline`) and posts `highlight` requests; `highlight-worker.ts` runs Shiki and posts results.
- `markdown.tsx` lazily imports `mermaid` and renders diagrams to SVG; it creates probe elements in `document` to read colors.
- `text-metrics.ts:createTurnEstimator` creates hidden DOM probes to measure text; `now-line.tsx` runs an interval timer for the spinner frames (`FRAME_MS` 90).

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
