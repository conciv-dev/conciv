import {describe, expect, it} from 'vitest'
import type {UIMessage} from '@conciv/protocol/chat-types'
import {makeTranscriptMirror} from '../src/transcript-mirror.js'

function message(id: string, role: UIMessage['role'], content: string): UIMessage {
  return {id, role, parts: [{type: 'text', content}]}
}

async function until(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function collect(mirror: {subscribe(key: string, sink: (messages: UIMessage[]) => void): () => void}, key: string) {
  const payloads: UIMessage[][] = []
  const stop = mirror.subscribe(key, (messages) => payloads.push(messages))
  return {payloads, stop}
}

async function watchTranscript(transcript: UIMessage[]) {
  const mirror = makeTranscriptMirror({messages: () => Promise.resolve([...transcript]), intervalMs: 5})
  const {payloads, stop} = collect(mirror, 'a')
  await until(() => payloads.length >= 1)
  return {payloads, stop}
}

describe('transcript mirror', () => {
  it('emits the current transcript and re-emits when it grows', async () => {
    const transcript = [message('h1', 'user', 'hello')]
    const {payloads, stop} = await watchTranscript(transcript)
    expect(payloads[0]?.map((entry) => entry.role)).toEqual(['user'])
    transcript.push(message('h2', 'assistant', 'hi there'))
    await until(() => payloads.length >= 2)
    expect(payloads.at(-1)?.map((entry) => entry.role)).toEqual(['user', 'assistant'])
    stop()
  })

  it('re-emits when the last message grows in place', async () => {
    const transcript = [message('h1', 'assistant', 'a')]
    const {payloads, stop} = await watchTranscript(transcript)
    transcript[0] = message('h1', 'assistant', 'a much longer answer')
    await until(() => payloads.length >= 2)
    stop()
  })

  it('stays quiet while the transcript is unchanged', async () => {
    const {payloads, stop} = await watchTranscript([message('h1', 'user', 'hello')])
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(payloads.length).toBe(1)
    stop()
  })

  it('emits an empty transcript when reading fails', async () => {
    const mirror = makeTranscriptMirror({messages: () => Promise.reject(new Error('gone')), intervalMs: 5})
    const {payloads, stop} = collect(mirror, 'a')
    await until(() => payloads.length >= 1)
    expect(payloads[0]).toEqual([])
    stop()
  })

  it('serves every sink on the same key and keeps keys apart', async () => {
    const transcripts = new Map<string, UIMessage[]>([
      ['a', [message('a1', 'user', 'from a')]],
      ['b', [message('b1', 'user', 'from b')]],
    ])
    const mirror = makeTranscriptMirror({
      messages: (key) => Promise.resolve([...(transcripts.get(key) ?? [])]),
      intervalMs: 5,
    })
    const first = collect(mirror, 'a')
    await until(() => first.payloads.length >= 1)
    const second = collect(mirror, 'a')
    const other = collect(mirror, 'b')
    await until(() => second.payloads.length >= 1 && other.payloads.length >= 1)
    expect(second.payloads[0]?.map((entry) => entry.id)).toEqual(['a1'])
    expect(other.payloads[0]?.map((entry) => entry.id)).toEqual(['b1'])
    transcripts.set('a', [message('a1', 'user', 'from a'), message('a2', 'assistant', 'reply')])
    await until(() => first.payloads.length >= 2 && second.payloads.length >= 2)
    expect(first.payloads.at(-1)?.length).toBe(2)
    expect(second.payloads.at(-1)?.length).toBe(2)
    expect(other.payloads.length).toBe(1)
    first.stop()
    second.stop()
    other.stop()
  })

  it('keeps polling for the remaining sinks and stops after the last unsubscribes', async () => {
    const transcript = [message('h1', 'user', 'hello')]
    const reads = {count: 0}
    const mirror = makeTranscriptMirror({
      messages: () => {
        reads.count += 1
        return Promise.resolve([...transcript])
      },
      intervalMs: 5,
    })
    const first = collect(mirror, 'a')
    const second = collect(mirror, 'a')
    await until(() => first.payloads.length >= 1 && second.payloads.length >= 1)
    first.stop()
    transcript.push(message('h2', 'assistant', 'hi'))
    await until(() => second.payloads.length >= 2)
    expect(first.payloads.length).toBe(1)
    second.stop()
    const settled = reads.count
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(reads.count).toBe(settled)
  })
})
