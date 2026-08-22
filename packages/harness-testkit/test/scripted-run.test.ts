import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {SessionId} from '@conciv/protocol/chat-types'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {makeScriptedRun} from '../src/scripted-run.js'

const deps = (): HarnessChatDeps => ({
  cwd: '.',
  sessionId: SessionId.parse('conciv_s'),
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  decide: async (): Promise<'allow' | 'deny'> => 'allow',
})

describe('makeScriptedRun', () => {
  it('emits a full lifecycle with a session-id custom event', async () => {
    const {chatStream} = makeScriptedRun({text: 'hello from fake'})
    const out: StreamChunk[] = []
    for await (const chunk of chatStream(deps())) out.push(chunk)
    expect(out.at(0)?.type).toBe(EventType.RUN_STARTED)
    expect(out.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(out.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
    expect(out.some((c) => c.type === EventType.CUSTOM && c.name === 'fake.session-id')).toBe(true)
  })

  it('gives each tool call in a session its own toolCallId, matching what scriptToolCall returned', async () => {
    const scripted = makeScriptedRun()
    const firstScriptedId = scripted.scriptToolCall('first_tool', {a: 1}, {blocking: false})
    const secondScriptedId = scripted.scriptToolCall('second_tool', {b: 2}, {blocking: false})
    const collectToolCallId = async (): Promise<string> => {
      for await (const chunk of scripted.chatStream(deps())) {
        if (chunk.type === EventType.TOOL_CALL_START) return chunk.toolCallId
      }
      throw new Error('no tool call start emitted')
    }
    const firstEmittedId = await collectToolCallId()
    const secondEmittedId = await collectToolCallId()
    expect(firstEmittedId).not.toBe(secondEmittedId)
    expect(firstEmittedId).toBe(firstScriptedId)
    expect(secondEmittedId).toBe(secondScriptedId)
  })

  it('keeps two independently queued tool calls in two separate turns', async () => {
    const scripted = makeScriptedRun()
    scripted.scriptToolCall('first_tool', {a: 1})
    scripted.scriptToolCall('second_tool', {b: 2})
    const drainTurn = async (): Promise<StreamChunk[]> => {
      const chunks: StreamChunk[] = []
      for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
      return chunks
    }
    const first = await drainTurn()
    const second = await drainTurn()
    const startsIn = (chunks: StreamChunk[]): string[] =>
      chunks.flatMap((chunk) => (chunk.type === EventType.TOOL_CALL_START ? [chunk.toolCallName] : []))
    expect(startsIn(first)).toEqual(['first_tool'])
    expect(startsIn(second)).toEqual(['second_tool'])
  })

  it('emits every tool call of a scripted turn, with its result, inside one turn', async () => {
    const scripted = makeScriptedRun()
    const ids = scripted.scriptTurn({
      toolCalls: [
        {name: 'first_tool', input: {a: 1}, result: {ok: 'one'}},
        {name: 'second_tool', input: {b: 2}, result: {ok: 'two'}},
      ],
      text: 'both tools ran',
    })
    const chunks: StreamChunk[] = []
    for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)

    const starts = chunks.flatMap((chunk) => (chunk.type === EventType.TOOL_CALL_START ? [chunk.toolCallId] : []))
    const results = chunks.flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_RESULT ? [{id: chunk.toolCallId, content: chunk.content}] : [],
    )
    const text = chunks.flatMap((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? [chunk.delta] : []))
    expect(starts).toEqual(ids)
    expect(results).toEqual([
      {id: ids[0], content: JSON.stringify({ok: 'one'})},
      {id: ids[1], content: JSON.stringify({ok: 'two'})},
    ])
    expect(text).toEqual(['both tools ran'])
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })

  it('keeps a scripted null tool result as null instead of substituting the default', async () => {
    const scripted = makeScriptedRun()
    const ids = scripted.scriptTurn({toolCalls: [{name: 'nullish_tool', input: {a: 1}, result: null}]})
    const chunks: StreamChunk[] = []
    for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
    const results = chunks.flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_RESULT ? [{id: chunk.toolCallId, content: chunk.content}] : [],
    )
    expect(results).toEqual([{id: ids[0], content: 'null'}])
  })

  it('streams a queued tool call and a queued turn in the order they were scripted', async () => {
    const scripted = makeScriptedRun()
    scripted.scriptToolCall('first_tool', {a: 1})
    scripted.scriptTurn({toolCalls: [{name: 'second_tool', input: {b: 2}}], text: 'turn ran'})
    const drainTurn = async (): Promise<StreamChunk[]> => {
      const chunks: StreamChunk[] = []
      for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
      return chunks
    }
    const first = await drainTurn()
    const second = await drainTurn()
    const startsIn = (chunks: StreamChunk[]): string[] =>
      chunks.flatMap((chunk) => (chunk.type === EventType.TOOL_CALL_START ? [chunk.toolCallName] : []))
    expect(startsIn(first)).toEqual(['first_tool'])
    expect(startsIn(second)).toEqual(['second_tool'])
  })

  it('holds the turn open until release()', async () => {
    const scripted = makeScriptedRun()
    scripted.hold()
    const chunks: StreamChunk[] = []
    const drain = async (): Promise<void> => {
      for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
    }
    const drained = drain()
    await new Promise((r) => setTimeout(r, 30))
    expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
    scripted.release()
    await drained
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })
})
