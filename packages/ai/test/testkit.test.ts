import {describe, expect, it} from 'vitest'
import {ChatEventType, type ChatEvent} from '../src/index.js'
import {createTextChunks, storyConnection} from '../src/testkit.js'

async function drainUntilLastChunk(iterator: AsyncIterator<ChatEvent>, expected: number): Promise<ChatEvent[]> {
  const seen: ChatEvent[] = []
  while (seen.length < expected) {
    const step = await iterator.next()
    if (step.done) return seen
    seen.push(step.value)
  }
  return seen
}

describe('storyConnection abort at the last chunk yield', () => {
  it('emits no RUN_FINISHED when aborted while suspended at the final chunk', async () => {
    const chunks = createTextChunks('hi')
    const controller = new AbortController()
    const stream = storyConnection({chunks}).connect([], undefined, controller.signal, {
      threadId: 'story-thread',
      runId: 'story-run',
    })
    const iterator = stream[Symbol.asyncIterator]()
    const seen = await drainUntilLastChunk(iterator, chunks.length + 1)
    expect(seen.at(-1)?.type).toBe(ChatEventType.TEXT_MESSAGE_END)
    controller.abort()
    const resumed = await iterator.next()
    expect(resumed.done).toBe(true)
  })

  it('emits no RUN_ERROR when an erroring stream is aborted at the final chunk', async () => {
    const chunks = createTextChunks('hi')
    const controller = new AbortController()
    const stream = storyConnection({chunks, shouldError: true}).connect([], undefined, controller.signal, {
      threadId: 'story-thread',
      runId: 'story-run',
    })
    const iterator = stream[Symbol.asyncIterator]()
    await drainUntilLastChunk(iterator, chunks.length + 1)
    controller.abort()
    const resumed = await iterator.next()
    expect(resumed.done).toBe(true)
  })
})
