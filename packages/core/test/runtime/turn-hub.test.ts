import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeTurnHub} from '../../src/runtime/turn-hub.js'

const started: StreamChunk = {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'} as StreamChunk
const finished: StreamChunk = {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r'} as StreamChunk
const text = (delta: string): StreamChunk =>
  ({type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta}) as StreamChunk
const userMessage = {id: 'u1', role: 'user' as const, parts: [{type: 'text' as const, content: 'hi'}]}

function makeGate(): {stream: AsyncIterable<StreamChunk>; push: (c: StreamChunk) => void; end: () => void} {
  const queue: StreamChunk[] = []
  const waiters: (() => void)[] = []
  const state = {done: false}
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
    stream: {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const next = queue.shift()
          if (next) {
            yield next
            continue
          }
          if (state.done) return
          await new Promise<void>((resolve) => waiters.push(resolve))
        }
      },
    },
  }
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
    const drain = (async () => {
      for await (const chunk of live) collected.push(chunk)
    })()
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
    const drain = (async () => {
      for await (const chunk of live) collected.push(chunk)
    })()
    controller.abort()
    await drain
    gate.push(text('after-abort'))
    gate.push(finished)
    gate.end()
    await pump
    expect(collected.map((c) => c.type)).not.toContain(EventType.RUN_FINISHED)
    expect(hub.generating('s1')).toBe(false)
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
    const drainA = (async () => {
      for await (const c of subA.live) gotA.push(c)
    })()
    const drainB = (async () => {
      for await (const c of subB.live) gotB.push(c)
    })()
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
})
