import type {StreamChunk} from '@tanstack/ai'
import {aguiApprovalRequestedFor, type ApprovalRequest} from '@conciv/protocol/ui-types'

type Channel = {
  push: (chunk: StreamChunk) => void
  close: () => void
  iterate: () => AsyncGenerator<StreamChunk>
}

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
  injectApproval: (sessionId: string, req: ApprovalRequest) => boolean

  setModel: (sessionId: string, model: string | null) => void

  getModel: (sessionId: string) => string | null

  run: (sessionId: string, claudeEvents: AsyncIterable<StreamChunk>) => AsyncGenerator<StreamChunk>
}

export function makeUiBus(opts: {onChunk?: (sessionId: string, chunk: StreamChunk) => void} = {}): UiBus {
  const channels = new Map<string, Channel>()
  const models = new Map<string, string | null>()

  function setModel(sessionId: string, model: string | null): void {
    models.set(sessionId, model)
  }

  function getModel(sessionId: string): string | null {
    return models.get(sessionId) ?? null
  }

  function injectApproval(sessionId: string, req: ApprovalRequest): boolean {
    const channel = channels.get(sessionId)
    if (!channel) return false
    channel.push(aguiApprovalRequestedFor(req))
    return true
  }

  function run(sessionId: string, claudeEvents: AsyncIterable<StreamChunk>): AsyncGenerator<StreamChunk> {
    const channel = makeChannel()
    channels.set(sessionId, channel)

    async function pumpEvents(): Promise<void> {
      try {
        for await (const chunk of claudeEvents) {
          opts.onChunk?.(sessionId, chunk)
          channel.push(chunk)
        }
      } finally {
        channel.close()
      }
    }
    const pump = pumpEvents()
    async function* drain(): AsyncGenerator<StreamChunk> {
      try {
        for await (const chunk of channel.iterate()) yield chunk
      } finally {
        if (channels.get(sessionId) === channel) {
          channels.delete(sessionId)
          models.delete(sessionId)
        }
        await pump
      }
    }
    return drain()
  }

  return {injectApproval, setModel, getModel, run}
}
