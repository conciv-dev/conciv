# TanStack Chat Queue Design

## Goal

Replace Conciv's hand-written local FIFO send queue with the native queue shipped by `@tanstack/ai-client` 0.22 and `@tanstack/ai-solid` 0.15, expose pending sends in the composer, and preserve Conciv's cross-surface session safety.

## Architecture

`useChatSession` configures TanStack AI with `{whenBusy: 'queue', drain: 'fifo'}`. TanStack AI becomes the owner of queue identity, ordering, local busy detection, cancellation, and draining. The UI consumes the hook's `queue` accessor and `cancelQueued` operation directly.

TanStack's busy policy is request-local, while Conciv's `sessionGenerating` signal intentionally covers runs initiated in another tab or device. A small shared-session bridge delays sends only for that remote-owner case and forwards them into the native `sendMessage` path as soon as the shared run settles. It does not maintain a second local queue or duplicate TanStack ordering.

## Composer behavior

The composer remains writable and sendable during generation. A normal send while locally busy enters TanStack's FIFO queue. Pending messages render above the composer with their text and two actions:

- Remove calls `cancelQueued(id)`.
- Steer removes the selected queued item and resends its original content with `{whenBusy: 'interrupt'}`. TanStack aborts the current local stream, runs the selected message immediately, and then resumes the remaining queue after a successful settle.

The Stop action remains available during generation, and the Send action remains visible so users can add work to the queue. Batch draining remains available through TanStack's queue configuration but is not a new Conciv preference in this change; Conciv's established behavior is FIFO.

## Dependency boundary

All workspace packages that directly declare `@tanstack/ai-client` move to `^0.22.0`. Packages declaring `@tanstack/ai-solid` move to `^0.15.0`. No TanStack AI implementation is copied into Conciv.

## Failure behavior

TanStack's native semantics apply: queued items drain only after successful completion and are cleared on error, abort, stop, clear, unsubscribe, and reload. The shared-session bridge clears delayed sends when its owning Solid root is disposed. Queue overflow remains unlimited, matching Conciv's current queue.

## Testing

- Unit tests prove the shared-session bridge delays only remote-owned runs and preserves order when forwarding to TanStack.
- Real-browser UI tests prove the composer can submit while busy, pending items render, Remove cancels, and Steer interrupts.
- Client integration tests continue to prove the custom Subscribe connection works with the upgraded TanStack client.
- Repository typecheck, build, test, lint, formatting, and fallow changed-code audit remain required before the PR opens.
