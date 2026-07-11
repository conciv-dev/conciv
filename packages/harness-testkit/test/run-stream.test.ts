import {describe, expect, it} from 'vitest'
import {EventType, type MessagePart, type StreamChunk} from '@tanstack/ai'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
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

const snapshot = (parts: MessagePart[]): StreamChunk => aguiSnapshotFor([{id: 'a1', role: 'assistant', parts}])

const textPart = (content: string): MessagePart => ({type: 'text', content})

const toolCallPart = (id: string, name: string, args: unknown): MessagePart => ({
  type: 'tool-call',
  id,
  name,
  arguments: JSON.stringify(args),
  state: 'input-complete',
})

describe('makeRunStream', () => {
  it('waitForToolCall resolves with parsed input when the call lands mid-stream', async () => {
    const run = makeRunStream(
      scripted([
        started,
        snapshot([textPart('thinking'), toolCallPart('tc-1', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'})]),
        finished,
      ]),
    )
    const call = await run.waitForToolCall('conciv_ui')
    expect(call).toEqual({toolCallId: 'tc-1', name: 'conciv_ui', input: {kind: 'confirm', question: 'Proceed?'}})
  })

  it('waitForToolCall rejects fast when the run finishes without that tool', async () => {
    const run = makeRunStream(
      scripted([started, snapshot([toolCallPart('tc-1', 'conciv_open', {file: 'a.ts'})]), finished]),
    )
    await expect(run.waitForToolCall('conciv_ui')).rejects.toThrow(/finished|without/i)
  })

  it('done().toolCalls filters by name and parses each call input', async () => {
    const run = makeRunStream(
      scripted([
        started,
        snapshot([
          toolCallPart('tc-1', 'conciv_open', {file: 'a.ts'}),
          toolCallPart('tc-2', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'}),
        ]),
        finished,
      ]),
    )
    const events = await run.done()
    expect(events.toolCalls().map((call) => call.name)).toEqual(['conciv_open', 'conciv_ui'])
    expect(events.toolCalls('conciv_ui')).toEqual([
      {toolCallId: 'tc-2', name: 'conciv_ui', input: {kind: 'confirm', question: 'Proceed?'}},
    ])
  })

  it('done drains to RUN_FINISHED and exposes typed queries', async () => {
    const run = makeRunStream(scripted([started, snapshot([textPart('hello ')]), snapshot([textPart('hello world')]), finished]))
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
    const run = makeRunStream(
      scripted([
        started,
        snapshot([toolCallPart('tc-1', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'})]),
        text('tail'),
        finished,
      ]),
    )
    await run.waitForToolCall('conciv_ui')
    await new Promise((r) => setTimeout(r, 50))
    const events = await run.done({hangGuardMs: 500})
    expect(events.runs()).toBe(1)
  })

  it('an intermediate tool_calls RUN_FINISHED does not end done()', async () => {
    const intermediate = {
      type: EventType.RUN_FINISHED,
      threadId: 't',
      runId: 'r',
      finishReason: 'tool_calls',
    } as StreamChunk
    const run = makeRunStream(
      scripted([
        started,
        snapshot([toolCallPart('tc-1', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'})]),
        intermediate,
        snapshot([textPart('after')]),
        finished,
      ]),
    )
    const events = await run.done({hangGuardMs: 1000})
    expect(events.text()).toContain('after')
  })

  it('an old-turn RUN_FINISHED in history does not fail a new waiter', async () => {
    const run = makeRunStream(
      parked([started, finished, started, snapshot([toolCallPart('tc-2', 'conciv_ui', {kind: 'confirm', question: 'Again?'})])]),
    )
    await run.done()
    const call = await run.waitForToolCall('conciv_ui')
    expect(call.input).toEqual({kind: 'confirm', question: 'Again?'})
  })
})
