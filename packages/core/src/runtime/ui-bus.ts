import type {StreamChunk} from '@tanstack/ai'
import {
  aguiCustomFor,
  aguiApprovalRequestedFor,
  type ApprovalRequest,
  type UiSpec,
} from '@opendui/aidx-protocol/ui-types'
import {aguiUsageFor, type UsageSnapshot} from '@opendui/aidx-protocol/usage-types'

// Merges agent-emitted generative-UI specs (POST /api/chat/ui) onto the live chat stream as
// AG-UI CUSTOM events. Channels are keyed by the canonical header id, so concurrent turns each
// get their own channel and an inject routes to exactly the matching session (never clobbered).

type Channel = {
  push: (chunk: StreamChunk) => void
  close: () => void
  iterate: () => AsyncGenerator<StreamChunk>
}

// A single-consumer async channel: producers push, the consumer iterates until close().
function makeChannel(): Channel {
  const items: StreamChunk[] = []
  const waiters: ((r: IteratorResult<StreamChunk>) => void)[] = []
  const state = {closed: false}

  function push(chunk: StreamChunk): void {
    const waiter = waiters.shift()
    if (waiter) {
      waiter({value: chunk, done: false})
      return
    }
    items.push(chunk)
  }

  function close(): void {
    state.closed = true
    const waiter = waiters.shift()
    // IteratorResult's done-variant value type is TReturn (default any), so undefined needs no cast.
    if (waiter) waiter({value: undefined, done: true})
  }

  async function* iterate(): AsyncGenerator<StreamChunk> {
    while (true) {
      const buffered = items.shift()
      if (buffered !== undefined) {
        yield buffered
        continue
      }
      if (state.closed) return
      const next = await new Promise<IteratorResult<StreamChunk>>((resolve) => waiters.push(resolve))
      if (next.done) return
      yield next.value
    }
  }

  return {push, close, iterate}
}

export type UiBus = {
  // Inject a UI spec onto the matching session's live stream. Returns false if no turn is active there.
  inject: (sessionId: string, spec: UiSpec) => boolean
  // Drive a tool-call part into its native approval-requested state on the live stream (risky-Bash
  // gate). Returns false if no turn is active there → the gate fails closed. The matching
  // TOOL_CALL_START is already on the channel (claude streams the tool_use before its PreToolUse hook
  // fires), so the part exists when this lands and the StreamProcessor sets part.approval on it.
  injectApproval: (sessionId: string, req: ApprovalRequest) => boolean
  // Inject a live usage snapshot onto the matching session's stream (no-op if no turn is active).
  injectUsage: (sessionId: string, usage: UsageSnapshot) => void
  // Run one chat turn for a session: merge Claude's events with injected UI events into one stream.
  run: (sessionId: string, claudeEvents: AsyncIterable<StreamChunk>) => AsyncGenerator<StreamChunk>
}

export function makeUiBus(): UiBus {
  const channels = new Map<string, Channel>()

  function inject(sessionId: string, spec: UiSpec): boolean {
    const channel = channels.get(sessionId)
    if (!channel) return false
    channel.push(aguiCustomFor(spec))
    return true
  }

  function injectApproval(sessionId: string, req: ApprovalRequest): boolean {
    const channel = channels.get(sessionId)
    if (!channel) return false
    channel.push(aguiApprovalRequestedFor(req))
    return true
  }

  function injectUsage(sessionId: string, usage: UsageSnapshot): void {
    channels.get(sessionId)?.push(aguiUsageFor(usage))
  }

  // Sync function (not an async generator) so the channel registers EAGERLY when run() is called —
  // an inject right after run() must find the channel, not wait for the consumer's first pull.
  function run(sessionId: string, claudeEvents: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    const channel = makeChannel()
    channels.set(sessionId, channel)
    // Named async fn rather than an IIFE (project rule: no IIFEs); start it without awaiting.
    async function pumpEvents(): Promise<void> {
      try {
        for await (const chunk of claudeEvents) channel.push(chunk)
      } finally {
        channel.close()
      }
    }
    const pump = pumpEvents()
    async function* drain(): AsyncGenerator<StreamChunk> {
      try {
        for await (const chunk of channel.iterate()) yield chunk
      } finally {
        // Only clear if still ours — a re-run for the same id may have replaced the channel.
        if (channels.get(sessionId) === channel) channels.delete(sessionId)
        await pump
      }
    }
    return drain()
  }

  return {inject, injectApproval, injectUsage, run}
}
