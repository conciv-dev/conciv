# ui-kit-chat/src/tools/styled

## Overview

Themed tool-call cards and building blocks: the generic tool card and fallback, card shell and chrome, meta-tool card, permission card, chips, code and diff blocks, JSON tree and inline rows.

## Interface

- `tool-card.tsx`, `card-shell.tsx`, `card-chrome.tsx`, `card-headline.tsx`: the tool card and its shell; a card renders in full or embedded layout (`useEmbeddedCard`).
- `tool-fallback.tsx`, `generic-tool-headline.ts`, `meta-tool-card.tsx`, `tool-call-card.tsx`, `tool-error-card.tsx`: the cards for a call no tool card draws, a meta tool, and a trace row.
- `chip.tsx`, `code-block.tsx`, `json-tree.tsx`, `shaped-content.tsx`, `error-block.tsx`, `result-image.tsx`, `inline-row.tsx`, `note-row.tsx`, `action-row.tsx`, `collapsible-section.tsx`, `tool-icon.tsx`, `tool-display.tsx`: the pieces cards are built from.
- `collapsible-card.tsx`: kit-internal.

## Invariants

- `collapsible-card.tsx:CollapsibleCard` is internal to the kit: the `conciv/tool-card-shell` lint rule in `packages/oxlint-plugin` forbids importing it from `@conciv/ui-kit-chat` outside this package; compose `CardShell` or `ToolCard` instead.
- `tool-call-card.tsx:ToolTraceRow` tags a row "from <client>" ("from outside agent" without a client) when its call's metadata carries the hub marker `{conciv: {origin: 'hub', client, run}}` (`OutsideCallMetadataSchema` from `@conciv/types/chat-message-types`); in-page calls carry no tag.

## Side Effects

- `collapsible-card.tsx` applies `useScrollLock` during open/close animations.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
