# tools/styled

## Overview

Themed tool-call cards and building blocks: the generic tool card and fallback, card shell and chrome, meta-tool card, permission card, chips, code and diff blocks, JSON tree and inline rows.

## Interface

- `tool-card.tsx:ToolCard`; `tool-fallback.tsx:ToolFallback`, `toolFallbackCardView`, `toolFallbackHasEmbeddedBody`; `generic-tool-headline.ts:genericToolHeadline` (as opencode's GenericTool: title 'Called <tool>', subtitle from the first non-empty of description, query, url, path, pattern, name, and up to three other scalar inputs as `key=value`), `genericToolRowProjection`; `tool-call-card.tsx:ToolCallCard`, `ToolTraceRow` (a row whose card published no header and has no catalog meta is drawn from `genericToolRowProjection`: the subtitle or first argument, then the arguments).
- `card-shell.tsx:CardShell`, `cardHeader`, `detailChips`; `card-chrome.tsx:CardChromeProvider`, `useCardChrome`, `useEmbeddedCard`; `card-headline.tsx:CardHeadline`; `collapsible-card.tsx:CollapsibleCard` (kit-internal).
- `meta-tool-card.tsx:MetaToolCard`, `metaToolHasEmbeddedBody`; `permission-card.tsx:PermissionCard`.
- `chip.tsx:Chip`, `ChipRow`, `ChipGroup`, `CHIP`; `code-block.tsx:CodeBlock`, `DiffBlock`, `diffBlockClass`; `json-tree.tsx:JsonTree`; `shaped-content.tsx:ShapedValue`; `error-block.tsx:ErrorBlock`; `result-image.tsx:ResultImage`.
- `inline-row.tsx:InlineRow`, `InlineShell`; `note-row.tsx:NoteRow`; `action-row.tsx:ActionRow`, `ActionButton`; `collapsible-section.tsx:CollapsibleSection`; `tool-icon.tsx:GENERIC_TOOL_ICON`.

## Invariants

- `collapsible-card.tsx:CollapsibleCard` is internal to the kit: the `conciv/tool-card-shell` lint rule in `packages/oxlint-plugin` forbids importing it from `@conciv/ui-kit-chat` outside this package; compose `CardShell` or `ToolCard` instead.
- `tool-call-card.tsx:ToolTraceRow` tags a row "from <client>" ("from outside agent" without a client) when its call's metadata carries the hub marker `{conciv: {origin: 'hub', client, run}}` (`OutsideCallMetadataSchema` from `@conciv/protocol/chat-message-types`); in-page calls carry no tag.

## Side Effects

- `collapsible-card.tsx` applies `useScrollLock` during open/close animations.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat` from the repo root (turbo builds the package and its dependencies first)
