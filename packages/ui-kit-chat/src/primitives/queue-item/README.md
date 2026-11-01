# primitives/queue-item

## Overview

Headless parts for a queued user message: its text, a steer action that sends it now, and remove.

## Interface

- `queue-item.tsx:QueueItem` - `{Text, Steer, Remove}`; `queue-item.tsx:QueueItemProvider`; re-exports type `QueuedMessage` from `@conciv/protocol/chat-message-types`.

## Invariants

- Parts throw `QueueItem.* must be used within a QueueItemProvider` without a provider.

## Side Effects

- `Steer` calls `chat.cancelQueued(id)` then `chat.sendMessage(content, {whenBusy: 'interrupt'})`; `Remove` calls `chat.cancelQueued(id)`.

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
