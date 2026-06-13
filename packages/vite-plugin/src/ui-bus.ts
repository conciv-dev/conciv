import type {StreamChunk} from '@tanstack/ai'
import {aguiCustomFor, type UiSpec} from '@devgent/protocol/ui-types'

// The UI bus injects agent-emitted generative-UI specs (from `devgent ui …` → POST
// /__pw/chat/ui) onto the LIVE chat stream as AG-UI CUSTOM events. A chat turn runs through
// `bus.run(claudeEvents)`, which merges Claude's transcoded events with any injected UI
// events into one ordered stream (the lock guarantees a single active turn, so there is at
// most one active channel). When the turn ends (Claude's stream completes), the merged
// stream ends too, even if no UI was injected.

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
    if (waiter) waiter({value: undefined as unknown as StreamChunk, done: true})
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
  const state = {channel: null as Channel | null}

  function inject(spec: UiSpec): boolean {
    if (!state.channel) return false
    state.channel.push(aguiCustomFor(spec))
    return true
  }

  async function* run(claudeEvents: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    const channel = makeChannel()
    state.channel = channel
    const pump = (async () => {
      try {
        for await (const chunk of claudeEvents) channel.push(chunk)
      } finally {
        channel.close()
      }
    })()
    try {
      for await (const chunk of channel.iterate()) yield chunk
    } finally {
      state.channel = null
      await pump
    }
  }

  return {inject, run}
}
