# primitives/assistant-modal

## Overview

Headless popover-based assistant modal built on `Popover` from `@conciv/ui-kit-system`, with an option to open when a run starts.

## Interface

- `assistant-modal.tsx:AssistantModal` - `{Root, Trigger, Anchor, Content}`; `Root` accepts `openOnRunStart` plus the `Popover.Root` props.

## Invariants

- `assistant-modal.tsx:Root` treats the chat as running when `status()` is `streaming` or `submitted`; it works without a `ChatProvider` (`useChatContextOptional`).

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
