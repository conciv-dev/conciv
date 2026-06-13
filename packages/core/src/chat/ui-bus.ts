import type {StreamChunk} from '@tanstack/ai'
import {aguiCustomFor, type UiSpec} from '@devgent/protocol/ui-types'

// Merges agent-emitted generative-UI specs (POST /api/chat/ui) onto the live chat stream as
// AG-UI CUSTOM events. `run(events)` interleaves the turn's events with injected UI; the lock
// guarantees one active turn, so one active channel at a time.

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
  // Inject a UI spec onto the active turn's stream. Returns false if no turn is active.
  inject: (spec: UiSpec) => boolean
  // Run one chat turn: merge Claude's events with injected UI events into one stream.
  run: (claudeEvents: AsyncIterable<StreamChunk>) => AsyncGenerator<StreamChunk>
}

export function makeUiBus(): UiBus {
  const state: {channel: Channel | null} = {channel: null}

  function inject(spec: UiSpec): boolean {
    if (!state.channel) return false
    state.channel.push(aguiCustomFor(spec))
    return true
  }

  async function* run(claudeEvents: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    const channel = makeChannel()
    state.channel = channel
    // Named async fn rather than an IIFE (project rule: no IIFEs); start it without awaiting.
    async function pumpEvents(): Promise<void> {
      try {
        for await (const chunk of claudeEvents) channel.push(chunk)
      } finally {
        channel.close()
      }
    }
    const pump = pumpEvents()
    try {
      for await (const chunk of channel.iterate()) yield chunk
    } finally {
      state.channel = null
      await pump
    }
  }

  return {inject, run}
}
