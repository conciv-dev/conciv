# styled

## Overview

The themed component set built on the primitives: thread, composer, markdown with worker-based highlighting and mermaid diagrams, action bars, activity, groups, model selector and small display parts. Classes are UnoCSS utilities over `--chat-*` tokens.

## Interface

- `thread.tsx:Thread` - `{Root, Viewport, Welcome, Messages, Composer}`; types `ThreadComponents`, `ThreadRootProps`, `ThreadMessagesProps` (`tools`, `grouping`, `groupEntries`, `pageSession`, `attachmentCards`, `readOnly`: the assistant action bar shows Copy only, no Refresh or More).
- `composer.tsx:Composer` (`ComposerProps`); `markdown.tsx:Markdown` (`MarkdownProps`: `content`, `streaming`, `highlight`, `compact`; `compact` renders `chat-markdown-compact` (one type size from the container, no heading scale or block spacing, fences as inline code), never wakes the highlight worker, and renders links as text), `markdown.tsx:MarkdownHighlightProvider` (a `readonly string[]` context, empty by default; a `Markdown` without its own `highlight` marks those words, so a whole `Thread` can be highlighted without threading a prop through it), `markdown.tsx:HighlightedText` (plain text that marks the same context words through the kit's Ark `Highlight`, `ignoreCase matchAll exactMatch`; `Thread` renders each user prompt with it, so a match found only in a prompt is marked too), `markdown.tsx:warmHighlighter`, `isHighlighterWarming`.
- `action-bar.tsx:AssistantActionBar` (`readOnly` renders Copy only; `copyText` replaces the text Copy writes), `UserActionBar`; `activity.tsx:Activity` (`{Root, Timeline}`); `group.tsx:Group` (`{Root, Trigger, Content}`); `reasoning.tsx:Reasoning`, `ReasoningText`.
- `model-selector.tsx:ModelSelector` (`StyledModelSelectorProps`); `branch-picker.tsx:BranchPicker`; `follow-up-suggestions.tsx:FollowUpSuggestions`; `attachment-ui.tsx:AttachmentUI`; `attachment-dispatch.tsx:AttachmentByMime`, `createDocumentAttachmentAdapter`, type `AttachmentCardSlot`.
- `now-line.tsx:NowLine`, `morph-label.tsx:MorphLabel`, `virtual-lines.tsx:VirtualLines`, `shimmer.ts:SHIMMER`, `classes.ts:FOCUS`, `turn-classes.ts`, `text-metrics.ts:createTurnEstimator`.
- `highlight-worker.ts` / `highlight-shared.ts` - worker message types `MainToWorkerMessage`, `WorkerToMainMessage`.
- Subdirectory: [trace](./trace/README.md) - trace list and rows.

## Invariants

- `markdown.tsx:MarkdownProvider` / `useMarkdown` (types `MarkdownCodeBlocks`, `MarkdownCodeBlock`, `MarkdownCodeAction` exported) - opencode's markdown context (`session-ui/src/context/markdown.tsx`) with `openLocalFile`, `localFileExists` and `codeBlocks` only: `openLocalFile` is not inherited, `localFileExists` and `codeBlocks` are, and `codeBlocks={false}` turns content off below. `Markdown` (not `compact`) hands the two file handlers to `Streamdown`; a fence whose language `codeBlocks.current().render` lists becomes a `FencedView` whose `view` mounts `codeBlocks.render(target, {code, language}, fallback)` and whose `fallback` is the kit's own highlight of that fence (Shiki tokens, the mermaid diagram, or plain code until the worker answers), so a declined, failed or thrown view shows the normal code block, and `undefined` from `render` calls `fallback()` (opencode `session-ui/src/components/markdown.tsx:416`). Differences from opencode: content mounts once the whole message stops streaming (the mermaid rule), where opencode mounts each fence once its closing fence arrives (`markdown.tsx:330-457`); the base highlight is requested for every claimed fence, as the source; `codeBlocks.actions` and `MarkdownCodeAction` (its `icon` a `string`) are declared, not drawn.
- `markdown.tsx` caches highlights and diagrams in bounded stores of `MAX_CACHE_ENTRIES` (512), evicting oldest first.
- Turns are spaced by padding, not by the list gap: each turn sits in a `TURN_FRAME_CLASS` frame with `TURN_LEAD_CLASS` top padding, except the first turn and an outside call that follows an outside call (`thread.tsx:TurnFrame`); the viewport zeroes its `data-thread-list` gap and the estimator adds the same padding.
- Only the last of consecutive outside calls shows the assistant action bar, Copy only; it copies every call of that run as fenced `name(arguments)` blocks.
- `markdown.tsx:createBackend` returns `null` when `Worker` is undefined, so highlighting is skipped outside browsers.
- `now-line.tsx` and `morph-label.tsx` honor `(prefers-reduced-motion: reduce)`.

## Side Effects

- `markdown.tsx` starts an inline web worker (`highlight-worker.ts?worker&inline`) and posts `highlight` requests; `highlight-worker.ts` runs Shiki and posts results.
- `markdown.tsx` lazily imports `mermaid` and renders diagrams to SVG; it creates probe elements in `document` to read colors.
- `text-metrics.ts:createTurnEstimator` creates hidden DOM probes to measure text; `now-line.tsx` runs an interval timer for the spinner frames (`FRAME_MS` 90).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
