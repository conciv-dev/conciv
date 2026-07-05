import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {aguiCustomFor, type UiSpec} from '@conciv/protocol/ui-types'
import {makeRunStream} from '../src/run-stream.js'

async function* scripted(chunks: StreamChunk[], gapMs = 5): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    await new Promise((r) => setTimeout(r, gapMs))
    yield chunk
  }
}

async function* parked(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  yield* scripted(chunks)
  await new Promise(() => {})
}

const text = (delta: string): StreamChunk =>
  ({type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta}) as StreamChunk
const started = {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'} as StreamChunk
const finished = {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r'} as StreamChunk

describe('makeRunStream', () => {
  it('waitForUiSpec resolves when the spec lands mid-stream', async () => {
    const spec: UiSpec = {kind: 'confirm', renderId: 'r1', question: 'Proceed?'}
    const run = makeRunStream(scripted([started, text('thinking'), aguiCustomFor(spec), finished]))
    const got = await run.waitForUiSpec('Proceed?')
    expect('question' in got && got.question).toBe('Proceed?')
  })

  it('waitFor rejects fast when the run finishes without a match', async () => {
    const run = makeRunStream(scripted([started, text('nope'), finished]))
    await expect(run.waitForUiSpec('Proceed?')).rejects.toThrow(/finished|without/i)
  })

  it('done drains to RUN_FINISHED and exposes typed queries', async () => {
    const run = makeRunStream(scripted([started, text('hello '), text('world'), finished]))
    const events = await run.done()
    expect(events.text()).toBe('hello world')
    expect(events.runs()).toBe(1)
  })

  it('hang guard fires while the source is parked', async () => {
    const run = makeRunStream(parked([started, text('still going')]))
    await expect(run.waitFor((chunk) => chunk.type === EventType.RUN_FINISHED, {hangGuardMs: 80})).rejects.toThrow(
      /stall.*seen:/s,
    )
  })

  it('parallel waiters each see every chunk', async () => {
    const run = makeRunStream(scripted([started, text('alpha'), text('beta'), finished]))
    const isDelta = (delta: string) => (chunk: StreamChunk) =>
      chunk.type === EventType.TEXT_MESSAGE_CONTENT && chunk.delta === delta
    const [alpha, beta] = await Promise.all([run.waitFor(isDelta('alpha')), run.waitFor(isDelta('beta'))])
    expect(alpha.type).toBe(EventType.TEXT_MESSAGE_CONTENT)
    expect(beta.type).toBe(EventType.TEXT_MESSAGE_CONTENT)
  })

  it('a late waiter replays chunks already collected', async () => {
    const run = makeRunStream(scripted([started, text('early'), finished]))
    await run.done()
    const chunk = await run.waitFor((c) => c.type === EventType.TEXT_MESSAGE_CONTENT, {hangGuardMs: 100})
    expect(chunk.type).toBe(EventType.TEXT_MESSAGE_CONTENT)
  })

  it('done resolves when RUN_FINISHED landed before the call', async () => {
    const spec: UiSpec = {kind: 'confirm', renderId: 'r1', question: 'Proceed?'}
    const run = makeRunStream(scripted([started, aguiCustomFor(spec), text('tail'), finished]))
    await run.waitForUiSpec('Proceed?')
    await new Promise((r) => setTimeout(r, 50))
    const events = await run.done({hangGuardMs: 500})
    expect(events.runs()).toBe(1)
  })

  it('an old-turn RUN_FINISHED in history does not fail a new waiter', async () => {
    const spec: UiSpec = {kind: 'confirm', renderId: 'r2', question: 'Again?'}
    const run = makeRunStream(parked([started, finished, started, aguiCustomFor(spec)]))
    await run.done()
    const got = await run.waitForUiSpec('Again?')
    expect('question' in got && got.question).toBe('Again?')
  })
})
