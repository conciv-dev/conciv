import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {SessionId} from '@conciv/protocol/chat-types'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {makeScriptedRun, type ScriptedRun} from '../src/scripted-run.js'

const deps = (): HarnessChatDeps => ({
  cwd: '.',
  sessionId: SessionId.parse('conciv_s'),
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  decide: async (): Promise<'allow' | 'deny'> => 'allow',
})

function drainInBackground(scripted: ScriptedRun): {chunks: StreamChunk[]; drained: Promise<void>} {
  const chunks: StreamChunk[] = []
  const drain = async (): Promise<void> => {
    for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
  }
  return {chunks, drained: drain()}
}

function drainResultTimes(scripted: ScriptedRun): {times: number[]; drained: Promise<void>} {
  const times: number[] = []
  const drain = async (): Promise<void> => {
    for await (const chunk of scripted.chatStream(deps())) {
      if (chunk.type === EventType.TOOL_CALL_RESULT) times.push(performance.now())
    }
  }
  return {times, drained: drain()}
}

function drainTextDeltas(scripted: ScriptedRun): {deltas: string[]; times: number[]; drained: Promise<void>} {
  const deltas: string[] = []
  const times: number[] = []
  const drain = async (): Promise<void> => {
    for await (const chunk of scripted.chatStream(deps())) {
      if (chunk.type !== EventType.TEXT_MESSAGE_CONTENT) continue
      deltas.push(chunk.delta)
      times.push(performance.now())
    }
  }
  return {deltas, times, drained: drain()}
}

const PACED_STEPS = 4
const PACE_MS = 40
const PACE_TOLERANCE = 0.8
const TEXT_CHUNK_SIZE = 8
const PACED_TEXT = 'abcdefghijklmnopqrstuvwxyz0123456789'
const PACED_TEXT_SLICES = Math.ceil(PACED_TEXT.length / TEXT_CHUNK_SIZE)

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

  it('passes a scripted string tool result through raw instead of JSON-quoting it', async () => {
    const scripted = makeScriptedRun()
    const multilineResult = 'line one\nline two\nline three'
    const ids = scripted.scriptTurn({toolCalls: [{name: 'read_file', input: {a: 1}, result: multilineResult}]})
    const chunks: StreamChunk[] = []
    for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
    const results = chunks.flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_RESULT ? [{id: chunk.toolCallId, content: chunk.content}] : [],
    )
    expect(results).toEqual([{id: ids[0], content: multilineResult}])
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

  it('holds every tool result until releaseResults(), leaving the tool call started and unresolved', async () => {
    const scripted = makeScriptedRun()
    const ids = scripted.scriptTurn({toolCalls: [{name: 'held_tool', input: {a: 1}}], text: 'done'})
    scripted.holdResults()
    const {chunks, drained} = drainInBackground(scripted)
    await new Promise((r) => setTimeout(r, 30))
    expect(chunks.some((c) => c.type === EventType.TOOL_CALL_START && c.toolCallId === ids[0])).toBe(true)
    expect(chunks.some((c) => c.type === EventType.TOOL_CALL_RESULT)).toBe(false)
    scripted.releaseResults()
    await drained
    const results = chunks.flatMap((chunk) => (chunk.type === EventType.TOOL_CALL_RESULT ? [chunk.toolCallId] : []))
    expect(results).toEqual(ids)
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })

  it('releases held tool results one every everyMs instead of all at once', async () => {
    const scripted = makeScriptedRun()
    const ids = scripted.scriptTurn({
      toolCalls: Array.from({length: PACED_STEPS}, (_, index) => ({name: 'paced_tool', input: {step: index}})),
      text: 'done',
    })
    scripted.holdResults()
    const {times, drained} = drainResultTimes(scripted)
    await new Promise((r) => setTimeout(r, 20))
    expect(times.length).toBe(0)
    scripted.releaseResults({everyMs: PACE_MS})
    await drained
    expect(times.length).toBe(ids.length)
    const span = (times.at(-1) ?? 0) - (times.at(0) ?? 0)
    expect(span).toBeGreaterThanOrEqual(PACE_MS * (PACED_STEPS - 1) * PACE_TOLERANCE)
  })

  it('streams a paced turn text as several deltas spaced by everyMs instead of one delta', async () => {
    const scripted = makeScriptedRun()
    scripted.scriptTurn({
      toolCalls: [],
      text: PACED_TEXT,
      textPace: {chunk: TEXT_CHUNK_SIZE, everyMs: PACE_MS},
    })
    const {deltas, times, drained} = drainTextDeltas(scripted)
    await drained
    expect(deltas.length).toBe(PACED_TEXT_SLICES)
    expect(deltas.join('')).toBe(PACED_TEXT)
    const span = (times.at(-1) ?? 0) - (times.at(0) ?? 0)
    expect(span).toBeGreaterThanOrEqual(PACE_MS * (PACED_TEXT_SLICES - 1) * PACE_TOLERANCE)
  })

  it('streams an unpaced turn text as one delta', async () => {
    const scripted = makeScriptedRun()
    scripted.scriptTurn({toolCalls: [], text: PACED_TEXT})
    const {deltas, drained} = drainTextDeltas(scripted)
    await drained
    expect(deltas).toEqual([PACED_TEXT])
  })

  it('emits a queued custom event while the tool call it names is still unresolved', async () => {
    const scripted = makeScriptedRun()
    const ids = scripted.scriptTurn({toolCalls: [{name: 'risky_tool', input: {command: 'rm -rf build'}}]})
    scripted.scriptCustomEvent('approval-requested', {
      toolCallId: ids[0],
      toolName: 'risky_tool',
      input: {command: 'rm -rf build'},
      approval: {id: 'ask-1', needsApproval: true},
    })
    scripted.holdResults()
    const {chunks, drained} = drainInBackground(scripted)
    await new Promise((r) => setTimeout(r, 30))
    expect(chunks.some((c) => c.type === EventType.CUSTOM && c.name === 'approval-requested')).toBe(true)
    expect(chunks.some((c) => c.type === EventType.TOOL_CALL_RESULT)).toBe(false)
    scripted.releaseResults()
    await drained
    const order = chunks.flatMap((chunk) => {
      if (chunk.type === EventType.CUSTOM && chunk.name === 'approval-requested') return ['ask']
      return chunk.type === EventType.TOOL_CALL_RESULT ? ['result'] : []
    })
    expect(order).toEqual(['ask', 'result'])
  })

  it('holds the turn open until release()', async () => {
    const scripted = makeScriptedRun()
    scripted.hold()
    const {chunks, drained} = drainInBackground(scripted)
    await new Promise((r) => setTimeout(r, 30))
    expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
    scripted.release()
    await drained
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })
})
