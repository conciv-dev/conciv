# ui-kit-chat/src/primitives/assistant-modal

## Overview

Headless popover-based assistant modal built on `Popover` from `@conciv/ui-kit-system`, with an option to open when a run starts.

## Interface

- `assistant-modal.tsx`: the `AssistantModal` compound; `Root` takes `openOnRunStart` plus the `Popover.Root` props.

## Invariants

- `assistant-modal.tsx:Root` treats the chat as running when `status()` is `streaming` or `submitted`; it works without a `ChatProvider` (`useChatContextOptional`).

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
