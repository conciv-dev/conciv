import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeTurnHub} from '../../src/runtime/turn-hub.js'

const started: StreamChunk = {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'} as StreamChunk
const finished: StreamChunk = {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r'} as StreamChunk
const text = (delta: string): StreamChunk =>
  ({type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta}) as StreamChunk
const userMessage = {id: 'u1', role: 'user' as const, parts: [{type: 'text' as const, content: 'hi'}]}

function makeGate(): {
  stream: AsyncIterable<StreamChunk>
  push: (c: StreamChunk) => void
  end: () => void
  fail: (error: unknown) => void
} {
  const queue: StreamChunk[] = []
  const waiters: (() => void)[] = []
  const state = {done: false, error: null as unknown}
  const wake = () => waiters.splice(0).forEach((w) => w())
  return {
    push: (c) => {
      queue.push(c)
      wake()
    },
    end: () => {
      state.done = true
      wake()
    },
    fail: (error) => {
      state.error = error
      wake()
    },
    stream: {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const next = queue.shift()
          if (next) {
            yield next
            continue
          }
          if (state.error) throw state.error
          if (state.done) return
          await new Promise<void>((resolve) => waiters.push(resolve))
        }
      },
    },
  }
}

async function drainInto(iter: AsyncGenerator<StreamChunk>, sink?: StreamChunk[]): Promise<void> {
  for await (const chunk of iter) if (sink) sink.push(chunk)
}

describe('turn hub', () => {
  it('buffers the active run and replays it to a late subscriber', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    gate.push(text('hel'))
    await new Promise((r) => setTimeout(r, 10))
    expect(hub.generating('s1')).toBe(true)
    expect(hub.pendingUserMessage('s1')).toEqual(userMessage)
    const controller = new AbortController()
    const {replay, live} = hub.attach('s1', controller.signal)
    expect(replay.map((c) => c.type)).toEqual([EventType.RUN_STARTED, EventType.TEXT_MESSAGE_CONTENT])
    const collected: StreamChunk[] = []
    const drain = drainInto(live, collected)
    gate.push(text('lo'))
    gate.push(finished)
    gate.end()
    await pump
    await new Promise((r) => setTimeout(r, 10))
    expect(collected.map((c) => c.type)).toEqual([EventType.TEXT_MESSAGE_CONTENT, EventType.RUN_FINISHED])
    expect(hub.generating('s1')).toBe(false)
    expect(hub.pendingUserMessage('s1')).toBe(null)
    const after = hub.attach('s1', controller.signal)
    expect(after.replay).toEqual([])
    controller.abort()
    await drain
  })

  it('stops yielding to an aborted subscriber but keeps the run going', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    const controller = new AbortController()
    const {live} = hub.attach('s1', controller.signal)
    const collected: StreamChunk[] = []
    const drain = drainInto(live, collected)
    controller.abort()
    await drain
    gate.push(text('after-abort'))
    gate.push(finished)
    gate.end()
    await pump
    expect(collected.map((c) => c.type)).not.toContain(EventType.RUN_FINISHED)
    expect(hub.generating('s1')).toBe(false)
  })

  it('broadcasts a terminal RUN_ERROR when the run stream throws', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    const controller = new AbortController()
    const {live} = hub.attach('s1', controller.signal)
    const collected: StreamChunk[] = []
    const drain = drainInto(live, collected)
    gate.push(started)
    gate.fail(new Error('harness exploded'))
    await pump
    await new Promise((r) => setTimeout(r, 10))
    expect(collected.map((c) => c.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_ERROR])
    expect(collected.find((c) => c.type === EventType.RUN_ERROR)).toMatchObject({message: 'harness exploded'})
    expect(hub.generating('s1')).toBe(false)
    expect(hub.pendingUserMessage('s1')).toBe(null)
    const after = hub.attach('s1', controller.signal)
    expect(after.replay.map((c) => c.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_ERROR])
    controller.abort()
    await drain
  })

  it('preserves a terminal error for a client that attaches after a failed turn (reload-after-failure)', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    gate.push(text('half '))
    gate.fail(new Error('boom'))
    await pump
    expect(hub.generating('s1')).toBe(false)
    expect(hub.trackedSessions()).toBe(1)
    const controller = new AbortController()
    const {replay} = hub.attach('s1', controller.signal)
    const errorChunk = replay.find((chunk) => chunk.type === EventType.RUN_ERROR)
    expect(errorChunk).toMatchObject({message: 'boom'})
    controller.abort()
    await new Promise((r) => setTimeout(r, 10))
    expect(hub.trackedSessions()).toBe(0)
  })

  it('fans out live chunks to two subscribers', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    await new Promise((r) => setTimeout(r, 10))
    const a = new AbortController()
    const b = new AbortController()
    const subA = hub.attach('s1', a.signal)
    const subB = hub.attach('s1', b.signal)
    const gotA: StreamChunk[] = []
    const gotB: StreamChunk[] = []
    const drainA = drainInto(subA.live, gotA)
    const drainB = drainInto(subB.live, gotB)
    gate.push(finished)
    gate.end()
    await pump
    await new Promise((r) => setTimeout(r, 10))
    a.abort()
    b.abort()
    await Promise.all([drainA, drainB])
    expect(gotA.map((c) => c.type)).toContain(EventType.RUN_FINISHED)
    expect(gotB.map((c) => c.type)).toContain(EventType.RUN_FINISHED)
  })

  it('drops a session once its turn ends with no subscribers', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    await new Promise((r) => setTimeout(r, 10))
    expect(hub.trackedSessions()).toBe(1)
    gate.push(finished)
    gate.end()
    await pump
    expect(hub.trackedSessions()).toBe(0)
  })

  it('retains a session while a subscriber is attached and drops it when the last one leaves', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    const controller = new AbortController()
    const {live} = hub.attach('s1', controller.signal)
    const drain = drainInto(live)
    gate.push(finished)
    gate.end()
    await pump
    await new Promise((r) => setTimeout(r, 10))
    expect(hub.trackedSessions()).toBe(1)
    controller.abort()
    await drain
    expect(hub.trackedSessions()).toBe(0)
  })

  it('never evicts a session whose turn is still generating', async () => {
    const hub = makeTurnHub()
    const gate = makeGate()
    const pump = hub.start('s1', userMessage, gate.stream)
    gate.push(started)
    const controller = new AbortController()
    const {live} = hub.attach('s1', controller.signal)
    const drain = drainInto(live)
    controller.abort()
    await drain
    expect(hub.trackedSessions()).toBe(1)
    gate.push(finished)
    gate.end()
    await pump
    expect(hub.trackedSessions()).toBe(0)
  })

  it('does not accumulate entries across many sequential settled sessions', async () => {
    const hub = makeTurnHub()
    for (const index of Array.from({length: 50}, (_, i) => i)) {
      const gate = makeGate()
      const pump = hub.start(`s${index}`, userMessage, gate.stream)
      gate.push(started)
      gate.push(finished)
      gate.end()
      await pump
    }
    expect(hub.trackedSessions()).toBe(0)
  })
})
