import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'

export type ScriptedTurnToolCall = {name: string; input: unknown; result?: unknown}

export type PacedText = {chunk: number; everyMs: number}

export type ScriptedTurn = {
  toolCalls: ScriptedTurnToolCall[]
  text?: string
  thinking?: string
  textPace?: PacedText
}

export type PacedRelease = {everyMs: number}

export type ScriptedRequest = {request?: Request | RequestInit}

export type ScriptedRun = {
  chatStream: (deps: HarnessChatDeps, options?: ScriptedRequest) => AsyncGenerator<StreamChunk>
  hold: () => void
  release: () => void
  holdTools: () => void
  releaseTools: () => void
  holdResults: () => void
  releaseResults: (paced?: PacedRelease) => void
  scriptToolCall: (name: string, input: unknown, opts?: {blocking?: boolean}) => string
  scriptTurn: (turn: ScriptedTurn) => string[]
  scriptCustomEvent: (name: string, value: unknown) => void
  scriptError: (message: string) => void
}

type QueuedToolCall = {id: string; name: string; input: unknown; result: unknown}

type QueuedTurn = {
  toolCalls: QueuedToolCall[]
  text?: string
  thinking?: string
  textPace?: PacedText
  blocking: boolean
}

const THREAD = {threadId: 'scripted', runId: 'scripted'} as const

function scriptedResult(call: ScriptedTurnToolCall): unknown {
  if (call.result === undefined) return {ok: true}
  return call.result
}

function* requestChunks(call: {id: string; name: string; input: unknown}): Generator<StreamChunk> {
  const toolCallId = call.id
  yield {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: call.name, toolName: call.name}
  yield {type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(call.input)}
  yield {type: EventType.TOOL_CALL_END, toolCallId}
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result
  return JSON.stringify(result)
}

function resultChunk(toolCallId: string, result: unknown): StreamChunk {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${toolCallId}-result`,
    toolCallId,
    content: stringifyToolResult(result),
    state: 'output-available',
  }
}

function* thinkingChunks(text: string | undefined): Generator<StreamChunk> {
  if (!text) return
  const messageId = 'scripted-reasoning'
  yield {type: EventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'}
  yield {type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta: text}
  yield {type: EventType.REASONING_MESSAGE_END, messageId}
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function textSlices(text: string, pace: PacedText | undefined): string[] {
  if (!pace || pace.chunk <= 0 || text.length <= pace.chunk) return [text]
  const count = Math.ceil(text.length / pace.chunk)
  return Array.from({length: count}, (_, index) => text.slice(index * pace.chunk, (index + 1) * pace.chunk))
}

async function* textChunks(text: string, pace: PacedText | undefined, messageId: string): AsyncGenerator<StreamChunk> {
  const slices = textSlices(text, pace)
  for (const [index, delta] of slices.entries()) {
    if (index > 0 && pace) await delay(pace.everyMs)
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta}
  }
}

async function* turnChunks(
  turn: QueuedTurn,
  results: Gate,
  drainCustomEvents: () => Generator<StreamChunk>,
  signal: AbortSignal | undefined,
): AsyncGenerator<StreamChunk> {
  for (const call of turn.toolCalls) {
    if (isAborted(signal)) return
    yield* requestChunks(call)
    yield* drainCustomEvents()
    if (turn.blocking) continue
    await results.wait(signal)
    if (isAborted(signal)) return
    yield resultChunk(call.id, call.result)
  }
}

function sessionIdChunk(deps: HarnessChatDeps): StreamChunk {
  const sessionId = deps.resumeSessionId ?? `fake-${deps.sessionId}`
  return {type: EventType.CUSTOM, name: 'fake.session-id', value: {sessionId}, ...THREAD}
}

function* customEventChunks(events: {name: string; value: unknown}[]): Generator<StreamChunk> {
  for (const event of events) yield {type: EventType.CUSTOM, name: event.name, value: event.value, ...THREAD}
}

type Gate = {hold: () => void; release: (paced?: PacedRelease) => void; wait: (signal?: AbortSignal) => Promise<void>}

function requestSignalOf(options: ScriptedRequest | undefined): AbortSignal | undefined {
  return options?.request?.signal ?? undefined
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function makeGate(): Gate {
  const state = {
    held: false,
    everyMs: 0,
    waiting: new Set<() => void>(),
    timers: new Set<ReturnType<typeof setTimeout>>(),
  }
  const schedule = (resume: () => void): void => {
    const timer = setTimeout(() => {
      state.timers.delete(timer)
      state.waiting.delete(resume)
      resume()
    }, state.everyMs)
    state.timers.add(timer)
  }
  return {
    hold: () => {
      state.held = true
      state.everyMs = 0
    },
    release: (paced?: PacedRelease) => {
      if (paced && paced.everyMs > 0) {
        state.everyMs = paced.everyMs
        for (const resume of state.waiting) schedule(resume)
        return
      }
      state.held = false
      state.everyMs = 0
      for (const timer of state.timers) clearTimeout(timer)
      state.timers.clear()
      const resuming = state.waiting
      state.waiting = new Set<() => void>()
      for (const resume of resuming) resume()
    },
    wait: async (signal?: AbortSignal) => {
      if (!state.held || isAborted(signal)) return
      await new Promise<void>((resolve) => {
        const settle = (): void => {
          state.waiting.delete(settle)
          resolve()
        }
        state.waiting.add(settle)
        if (state.everyMs > 0) schedule(settle)
        signal?.addEventListener('abort', settle, {once: true})
      })
    },
  }
}

export function makeScriptedRun(opts: {text?: string} = {}): ScriptedRun {
  const defaultText = opts.text ?? 'ok'
  const gate = makeGate()
  const toolGate = makeGate()
  const resultGate = makeGate()
  const turns = {count: 0}
  const toolCalls = {count: 0}
  const queuedTurns: QueuedTurn[] = []
  const queuedCustomEvents: Array<{name: string; value: unknown}> = []
  const queuedErrors: string[] = []
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
      return {id: `tc-${toolCalls.count}`, name: call.name, input: call.input, result: scriptedResult(call)}
    })
    queuedTurns.push({
      toolCalls: calls,
      text: turn.text,
      thinking: turn.thinking,
      textPace: turn.textPace,
      blocking: false,
    })
    return calls.map((call) => call.id)
  }
  const scriptCustomEvent = (name: string, value: unknown) => {
    queuedCustomEvents.push({name, value})
  }
  const scriptError = (message: string) => {
    queuedErrors.push(message)
  }
  const drainCustomEvents = () => customEventChunks(queuedCustomEvents.splice(0))
  const settleTurn = async function* (
    turn: QueuedTurn | undefined,
    messageId: string,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<StreamChunk> {
    if (turn?.blocking === true) {
      yield {type: EventType.RUN_FINISHED, ...THREAD, finishReason: 'tool_calls'}
      return
    }
    yield* drainCustomEvents()
    yield* textChunks(turn?.text ?? defaultText, turn?.textPace, messageId)
    await gate.wait(signal)
    if (isAborted(signal)) return
    const failure = queuedErrors.shift()
    if (failure) throw new Error(failure)
    yield {type: EventType.RUN_FINISHED, ...THREAD}
  }
  const chatStream = async function* (deps: HarnessChatDeps, options?: ScriptedRequest): AsyncGenerator<StreamChunk> {
    const signal = requestSignalOf(options)
    turns.count += 1
    const messageId = `scripted-${turns.count}`
    yield {type: EventType.RUN_STARTED, ...THREAD}
    yield sessionIdChunk(deps)
    const turn = queuedTurns.shift()
    if (turn) yield* thinkingChunks(turn.thinking)
    await toolGate.wait(signal)
    if (isAborted(signal)) return
    if (turn) yield* turnChunks(turn, resultGate, drainCustomEvents, signal)
    if (isAborted(signal)) return
    yield* settleTurn(turn, messageId, signal)
  }
  return {
    chatStream,
    hold: gate.hold,
    release: gate.release,
    holdTools: toolGate.hold,
    releaseTools: toolGate.release,
    holdResults: resultGate.hold,
    releaseResults: resultGate.release,
    scriptToolCall,
    scriptTurn,
    scriptCustomEvent,
    scriptError,
  }
}
