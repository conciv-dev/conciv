# tools/styled

## Overview

Themed tool-call cards and building blocks: the generic tool card and fallback, card shell and chrome, meta-tool card, permission card, chips, code and diff blocks, JSON tree, element preview and inline rows.

## Interface

- `tool-card.tsx:ToolCard`; `tool-fallback.tsx:ToolFallback`, `toolFallbackCardView`, `toolFallbackHasEmbeddedBody`; `tool-call-card.tsx:ToolCallCard`, `ToolTraceRow`.
- `card-shell.tsx:CardShell`, `cardHeader`, `detailChips`; `card-chrome.tsx:CardChromeProvider`, `useCardChrome`, `useEmbeddedCard`; `card-headline.tsx:CardHeadline`; `collapsible-card.tsx:CollapsibleCard` (kit-internal).
- `meta-tool-card.tsx:MetaToolCard`, `metaToolHasEmbeddedBody`; `permission-card.tsx:PermissionCard`.
- `chip.tsx:Chip`, `ChipRow`, `ChipGroup`, `CHIP`; `code-block.tsx:CodeBlock`, `DiffBlock`, `diffBlockClass`; `json-tree.tsx:JsonTree`; `shaped-content.tsx:ShapedValue`; `error-block.tsx:ErrorBlock`; `result-image.tsx:ResultImage`.
- `element-preview.tsx:ElementPreview` (`{Root, Frame, Descriptor}`); `inline-row.tsx:InlineRow`, `InlineShell`; `note-row.tsx:NoteRow`, `MirrorRow`; `action-row.tsx:ActionRow`, `ActionButton`; `collapsible-section.tsx:CollapsibleSection`; `tool-icon.tsx:toolIconRender`, `GENERIC_TOOL_ICON`.

## Invariants

- `collapsible-card.tsx:CollapsibleCard` is internal to the kit: the `conciv/tool-card-shell` lint rule in `packages/oxlint-plugin` forbids importing it from `@conciv/ui-kit-chat` outside this package; compose `CardShell` or `ToolCard` instead.
- `element-preview.tsx` throws when its parts render outside `ElementPreview.Root`.

## Side Effects

- `element-preview.tsx` lazily imports `rrweb-snapshot` and rebuilds the captured DOM into a sandboxed iframe, then crops it with a resize observer.
- `collapsible-card.tsx` applies `useScrollLock` during open/close animations.

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
