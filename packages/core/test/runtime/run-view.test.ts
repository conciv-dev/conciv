import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {StreamProcessor, ImmediateStrategy} from '@tanstack/ai/client'
import {makeRunView} from '../../src/runtime/run-view.js'

function messagesFrom(chunks: StreamChunk[]): unknown {
  const processor = new StreamProcessor({chunkStrategy: new ImmediateStrategy()})
  for (const chunk of chunks) processor.processChunk(chunk)
  return processor.getMessages()
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

  it('passes tool calls and custom events through verbatim', () => {
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
