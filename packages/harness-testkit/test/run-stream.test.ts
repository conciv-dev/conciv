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

const text = (delta: string): StreamChunk => ({type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta}) as StreamChunk
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
})
