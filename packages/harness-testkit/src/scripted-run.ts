import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'

export type ScriptedTurnToolCall = {name: string; input: unknown; result?: unknown}

export type ScriptedTurn = {toolCalls: ScriptedTurnToolCall[]; text?: string}

export type ScriptedRun = {
  chatStream: (deps: HarnessChatDeps) => AsyncGenerator<StreamChunk>
  hold: () => void
  release: () => void
  scriptToolCall: (name: string, input: unknown, opts?: {blocking?: boolean}) => string
  scriptTurn: (turn: ScriptedTurn) => string[]
  scriptCustomEvent: (name: string, value: unknown) => void
  scriptError: (message: string) => void
}

type QueuedToolCall = {id: string; name: string; input: unknown; result: unknown}

type QueuedTurn = {toolCalls: QueuedToolCall[]; text?: string; blocking: boolean}

const THREAD = {threadId: 'scripted', runId: 'scripted'} as const

function* requestChunks(call: {id: string; name: string; input: unknown}): Generator<StreamChunk> {
  const toolCallId = call.id
  yield {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: call.name, toolName: call.name}
  yield {type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(call.input)}
  yield {type: EventType.TOOL_CALL_END, toolCallId}
}

function resultChunk(toolCallId: string, result: unknown): StreamChunk {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${toolCallId}-result`,
    toolCallId,
    content: JSON.stringify(result),
    state: 'output-available',
  }
}

function* turnChunks(turn: QueuedTurn): Generator<StreamChunk> {
  for (const call of turn.toolCalls) {
    yield* requestChunks(call)
    if (!turn.blocking) yield resultChunk(call.id, call.result)
  }
}

function sessionIdChunk(deps: HarnessChatDeps): StreamChunk {
  const sessionId = deps.resumeSessionId ?? `fake-${deps.sessionId}`
  return {type: EventType.CUSTOM, name: 'fake.session-id', value: {sessionId}, ...THREAD}
}

function* customEventChunks(events: {name: string; value: unknown}[]): Generator<StreamChunk> {
  for (const event of events) yield {type: EventType.CUSTOM, name: event.name, value: event.value, ...THREAD}
}

export function makeScriptedRun(opts: {text?: string} = {}): ScriptedRun {
  const defaultText = opts.text ?? 'ok'
  const gate = {held: false, waiting: new Set<() => void>()}
  const turns = {count: 0}
  const toolCalls = {count: 0}
  const queuedTurns: QueuedTurn[] = []
  const queuedCustomEvents: Array<{name: string; value: unknown}> = []
  const queuedErrors: string[] = []
  const hold = () => {
    gate.held = true
  }
  const release = () => {
    gate.held = false
    const resuming = gate.waiting
    gate.waiting = new Set()
    for (const resume of resuming) resume()
  }
  const scriptToolCall = (name: string, input: unknown, toolOpts: {blocking?: boolean} = {}) => {
    toolCalls.count += 1
    const toolCallId = `tc-${toolCalls.count}`
    const blocking = toolOpts.blocking ?? true
    queuedTurns.push({toolCalls: [{id: toolCallId, name, input, result: {ok: true}}], blocking})
    return toolCallId
  }
  const scriptTurn = (turn: ScriptedTurn) => {
    const calls = turn.toolCalls.map((call) => {
      toolCalls.count += 1
      return {id: `tc-${toolCalls.count}`, name: call.name, input: call.input, result: call.result ?? {ok: true}}
    })
    queuedTurns.push({toolCalls: calls, text: turn.text, blocking: false})
    return calls.map((call) => call.id)
  }
  const scriptCustomEvent = (name: string, value: unknown) => {
    queuedCustomEvents.push({name, value})
  }
  const scriptError = (message: string) => {
    queuedErrors.push(message)
  }
  const chatStream = async function* (deps: HarnessChatDeps): AsyncGenerator<StreamChunk> {
    turns.count += 1
    const messageId = `scripted-${turns.count}`
    yield {type: EventType.RUN_STARTED, ...THREAD}
    yield sessionIdChunk(deps)
    const scriptedTurn = queuedTurns.shift()
    if (scriptedTurn) yield* turnChunks(scriptedTurn)
    if (scriptedTurn?.blocking) {
      yield {type: EventType.RUN_FINISHED, ...THREAD, finishReason: 'tool_calls'}
      return
    }
    yield* customEventChunks(queuedCustomEvents.splice(0))
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: scriptedTurn?.text ?? defaultText}
    if (gate.held) await new Promise<void>((resolve) => gate.waiting.add(resolve))
    const failure = queuedErrors.shift()
    if (failure) throw new Error(failure)
    yield {type: EventType.RUN_FINISHED, ...THREAD}
  }
  return {chatStream, hold, release, scriptToolCall, scriptTurn, scriptCustomEvent, scriptError}
}
