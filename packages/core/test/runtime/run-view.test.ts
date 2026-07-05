import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {StreamProcessor, ImmediateStrategy} from '@tanstack/ai/client'
import {makeRunView} from '../../src/runtime/run-view.js'

function normalize(messages: unknown): unknown {
  return JSON.parse(
    JSON.stringify(messages, (key, value) => {
      if (key === 'createdAt' || key === 'updatedAt') return undefined
      if (key === 'id' && typeof value === 'string' && /^msg-\d+-/.test(value)) return 'msg-generated'
      return value
    }),
  )
}

function messagesFrom(chunks: StreamChunk[]): unknown {
  const processor = new StreamProcessor({chunkStrategy: new ImmediateStrategy()})
  for (const chunk of chunks) processor.processChunk(chunk)
  return normalize(processor.getMessages())
}

function materialize(chunks: StreamChunk[]): StreamChunk[] {
  const view = makeRunView()
  for (const chunk of chunks) view.record(chunk)
  return view.snapshot()
}

const started: StreamChunk = {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}
const finished: StreamChunk = {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r', finishReason: 'stop'}
const textStart = (id: string): StreamChunk => ({type: EventType.TEXT_MESSAGE_START, messageId: id, role: 'assistant'})
const textDelta = (id: string, delta: string): StreamChunk => ({
  type: EventType.TEXT_MESSAGE_CONTENT,
  messageId: id,
  delta,
})
const textEnd = (id: string): StreamChunk => ({type: EventType.TEXT_MESSAGE_END, messageId: id})
const reasoningStart = (id: string): StreamChunk => ({
  type: EventType.REASONING_MESSAGE_START,
  messageId: id,
  role: 'reasoning',
})
const reasoningDelta = (id: string, delta: string): StreamChunk => ({
  type: EventType.REASONING_MESSAGE_CONTENT,
  messageId: id,
  delta,
})
const reasoningEnd = (id: string): StreamChunk => ({type: EventType.REASONING_MESSAGE_END, messageId: id})
const toolStart = (id: string, name: string): StreamChunk => ({
  type: EventType.TOOL_CALL_START,
  toolCallId: id,
  toolCallName: name,
  toolName: name,
})
const toolArgs = (id: string, delta: string): StreamChunk => ({type: EventType.TOOL_CALL_ARGS, toolCallId: id, delta})
const toolEnd = (id: string): StreamChunk => ({type: EventType.TOOL_CALL_END, toolCallId: id})
const toolResult = (messageId: string, id: string, content: string): StreamChunk => ({
  type: EventType.TOOL_CALL_RESULT,
  messageId,
  toolCallId: id,
  content,
  state: 'output-available',
})
const custom = (name: string): StreamChunk => ({type: EventType.CUSTOM, name, value: {v: 1}})

describe('run view', () => {
  it('produces the same client messages as the raw chunk stream (settled turn)', () => {
    const raw = [
      started,
      reasoningStart('re1'),
      reasoningDelta('re1', 'think'),
      reasoningDelta('re1', 'ing'),
      reasoningEnd('re1'),
      textStart('m1'),
      textDelta('m1', 'hel'),
      textDelta('m1', 'lo '),
      textDelta('m1', 'world'),
      textEnd('m1'),
      toolStart('tc1', 'conciv_page'),
      toolArgs('tc1', '{"verb":"route"}'),
      toolEnd('tc1'),
      custom('conciv-ui'),
      finished,
    ]
    expect(messagesFrom(materialize(raw))).toEqual(messagesFrom(raw))
  })

  it('produces the same client messages mid-stream (reconnect before the turn settles)', () => {
    const raw = [started, textStart('m1'), textDelta('m1', 'partial '), textDelta('m1', 'answer')]
    expect(messagesFrom(materialize(raw))).toEqual(messagesFrom(raw))
  })

  it('coalesces content deltas so replay is bounded by message size, not chunk count', () => {
    const deltas = Array.from({length: 500}, (_, i) => textDelta('m1', `d${i}`))
    const raw = [started, textStart('m1'), ...deltas, textEnd('m1'), finished]
    const snapshot = materialize(raw)
    const contentChunks = snapshot.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
    expect(contentChunks).toHaveLength(1)
    expect(snapshot.length).toBeLessThan(raw.length)
    expect(messagesFrom(snapshot)).toEqual(messagesFrom(raw))
  })

  it('coalesces streamed tool-call argument fragments (the large-edit case)', () => {
    const bigValue = 'x'.repeat(2000)
    const raw = [
      started,
      toolStart('tc1', 'Write'),
      toolArgs('tc1', '{"path":"'),
      toolArgs('tc1', 'src/app.ts'),
      toolArgs('tc1', '","content":"'),
      toolArgs('tc1', bigValue),
      toolArgs('tc1', '"}'),
      toolEnd('tc1'),
      toolResult('m0', 'tc1', 'written'),
      finished,
    ]
    const snapshot = materialize(raw)
    const argChunks = snapshot.filter((chunk) => chunk.type === EventType.TOOL_CALL_ARGS)
    expect(argChunks).toHaveLength(1)
    expect(snapshot.length).toBeLessThan(raw.length)
    expect(messagesFrom(snapshot)).toEqual(messagesFrom(raw))
  })

  it('leaves a one-shot tool call and custom events byte-identical', () => {
    const raw = [
      started,
      toolStart('tc1', 'conciv_page'),
      toolArgs('tc1', '{"a":1}'),
      toolEnd('tc1'),
      custom('conciv-usage'),
      finished,
    ]
    expect(materialize(raw)).toEqual(raw)
  })

  it('reset clears the view', () => {
    const view = makeRunView()
    view.record(started)
    view.record(textStart('m1'))
    view.record(textDelta('m1', 'x'))
    view.reset()
    expect(view.snapshot()).toEqual([])
  })
})
