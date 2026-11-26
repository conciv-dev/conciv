# ui-kit-chat/src/primitives/queue-item

## Overview

Headless parts for a queued user message: its text, a steer action that sends it now, and remove.

## Interface

- `queue-item.tsx`: the `QueueItem` parts and their provider; re-exports the `QueuedMessage` type from `@conciv/types/chat-message-types`.

## Invariants

- Parts throw `QueueItem.* must be used within a QueueItemProvider` without a provider.

## Side Effects

- `Steer` calls `chat.cancelQueued(id)` then `chat.sendMessage(content, {whenBusy: 'interrupt'})`; a failure (from `onSteer` or the send) goes to `onSteerError(error, item)` with the item it took out of the queue, so the app can put its text back (with no `onSteerError` set it is logged through `reportUnsent`); nothing is resent. `Remove` calls `chat.cancelQueued(id)`.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
