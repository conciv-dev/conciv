import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {
  callPermissionPrompt,
  createReasoningChunks,
  createToolCallChunks,
  createToolResultChunk,
  type ChatCapabilities,
} from '@conciv/ai/testkit'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'

export type ScriptedTurnToolCall = {name: string; input: unknown; result?: unknown; error?: string}

export type PacedText = {chunk: number; everyMs: number}

export type ScriptedTurn = {
  toolCalls: ScriptedTurnToolCall[]
  text?: string
  thinking?: string
  textPace?: PacedText
}

export type PacedRelease = {everyMs: number}

export type ScriptedRequest = {
  threadId?: string
  runId?: string
  request?: Request | RequestInit
  abortController?: AbortController
  capabilities?: ChatCapabilities
}

export type ScriptedPermissionAsk = {toolName: string; input: unknown; cut?: AbortSignal}

export type ScriptedRun = {
  chatStream: (deps: HarnessChatDeps, options?: ScriptedRequest) => AsyncGenerator<ChatEvent>
  hold: () => void
  release: () => void
  holdStart: () => void
  releaseStart: () => void
  holdTools: () => void
  releaseTools: () => void
  holdResults: () => void
  releaseResults: (paced?: PacedRelease) => void
  scriptToolCall: (name: string, input: unknown, opts?: {blocking?: boolean}) => string
  scriptTurn: (turn: ScriptedTurn) => string[]
  scriptCustomEvent: (name: string, value: unknown) => void
  scriptPermissionAsk: (ask: ScriptedPermissionAsk) => string
  scriptError: (message: string) => void
  clearScript: () => void
}

type QueuedToolCall = {id: string; name: string; input: unknown; result: unknown; error?: string}

type QueuedPermissionAsk = ScriptedPermissionAsk & {id: string}

type QueuedTurn = {
  toolCalls: QueuedToolCall[]
  permissionAsk?: QueuedPermissionAsk
  text?: string
  thinking?: string
  textPace?: PacedText
  blocking: boolean
}

type RunIdentity = {threadId: string; runId: string}

function runIdentity(deps: HarnessChatDeps, options: ScriptedRequest | undefined): RunIdentity {
  return {threadId: options?.threadId ?? deps.sessionId, runId: options?.runId ?? crypto.randomUUID()}
}

function runScopedIds(runId: string): () => string {
  const minted = {next: 0}
  return () => `${runId}-${minted.next++}`
}

function scriptedResult(call: ScriptedTurnToolCall): unknown {
  if (call.result === undefined) return {ok: true}
  return call.result
}

function requestChunks(call: {id: string; name: string; input: unknown}, messageId: string): ChatEvent[] {
  return createToolCallChunks(call.name, call.input, {toolCallId: call.id, parentMessageId: messageId})
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === 'string') return result
  return JSON.stringify(result)
}

function resultChunk(call: QueuedToolCall): ChatEvent {
  if (call.error !== undefined) return createToolResultChunk(call.id, call.error, {state: 'output-error'})
  return createToolResultChunk(call.id, stringifyToolResult(call.result))
}

function thinkingChunks(text: string | undefined, messageId: string): ChatEvent[] {
  if (!text) return []
  return createReasoningChunks(text, messageId)
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

async function* textChunks(text: string, pace: PacedText | undefined, messageId: string): AsyncGenerator<ChatEvent> {
  const slices = textSlices(text, pace)
  yield {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
  for (const [index, delta] of slices.entries()) {
    if (index > 0 && pace) await delay(pace.everyMs)
    yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta}
  }
  yield {type: ChatEventType.TEXT_MESSAGE_END, messageId}
}

async function* turnChunks(
  turn: QueuedTurn,
  results: Gate,
  drainCustomEvents: () => Generator<ChatEvent>,
  signal: AbortSignal | undefined,
  messageId: string,
): AsyncGenerator<ChatEvent> {
  for (const call of turn.toolCalls) {
    if (isAborted(signal)) return
    yield* requestChunks(call, messageId)
    yield* drainCustomEvents()
    if (turn.blocking) continue
    await results.wait(signal)
    if (isAborted(signal)) return
    yield resultChunk(call)
  }
}

function sessionIdChunk(deps: HarnessChatDeps, run: RunIdentity): ChatEvent {
  const sessionId = deps.resumeSessionId ?? `fake-${deps.sessionId}`
  return {type: ChatEventType.CUSTOM, name: 'fake.session-id', value: {sessionId}, ...run}
}

function* customEventChunks(events: {name: string; value: unknown}[], run: RunIdentity): Generator<ChatEvent> {
  for (const event of events) yield {type: ChatEventType.CUSTOM, name: event.name, value: event.value, ...run}
}

type Gate = {hold: () => void; release: (paced?: PacedRelease) => void; wait: (signal?: AbortSignal) => Promise<void>}

function readRequestSignal(options: ScriptedRequest | undefined): AbortSignal | undefined {
  return options?.request?.signal ?? undefined
}

function readRunSignal(options: ScriptedRequest | undefined): AbortSignal | undefined {
  return options?.abortController?.signal ?? readRequestSignal(options)
}

async function promptForPermission(
  ask: QueuedPermissionAsk,
  options: ScriptedRequest | undefined,
  run: RunIdentity,
): Promise<string> {
  if (options?.capabilities === undefined) throw new Error('a scripted permission ask needs the chat capabilities')
  const signal = readRunSignal(options)
  return callPermissionPrompt(options.capabilities, {
    threadId: run.threadId,
    toolName: ask.toolName,
    input: ask.input,
    ...(signal === undefined ? {} : {signal}),
    ...(ask.cut === undefined ? {} : {cut: ask.cut}),
  })
}

async function* permissionAskChunks(
  ask: QueuedPermissionAsk,
  options: ScriptedRequest | undefined,
  run: RunIdentity,
  messageId: string,
): AsyncGenerator<ChatEvent> {
  yield* requestChunks({id: ask.id, name: ask.toolName, input: ask.input}, messageId)
  const reply = await promptForPermission(ask, options, run)
  if (isAborted(readRunSignal(options))) return
  yield createToolResultChunk(ask.id, reply)
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
  const startGate = makeGate()
  const toolGate = makeGate()
  const resultGate = makeGate()
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
      return {
        id: `tc-${toolCalls.count}`,
        name: call.name,
        input: call.input,
        result: scriptedResult(call),
        error: call.error,
      }
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
  const scriptPermissionAsk = (ask: ScriptedPermissionAsk) => {
    toolCalls.count += 1
    const id = `tc-${toolCalls.count}`
    queuedTurns.push({toolCalls: [], permissionAsk: {...ask, id}, blocking: false})
    return id
  }
  const scriptError = (message: string) => {
    queuedErrors.push(message)
  }
  const clearScript = () => {
    queuedTurns.splice(0)
    queuedCustomEvents.splice(0)
    queuedErrors.splice(0)
  }
  const settleTurn = async function* (
    turn: QueuedTurn | undefined,
    messageId: string,
    signal: AbortSignal | undefined,
    run: RunIdentity,
  ): AsyncGenerator<ChatEvent> {
    if (turn?.blocking === true) {
      yield {type: ChatEventType.RUN_FINISHED, ...run, finishReason: 'tool_calls'}
      return
    }
    yield* customEventChunks(queuedCustomEvents.splice(0), run)
    yield* textChunks(turn?.text ?? defaultText, turn?.textPace, messageId)
    await gate.wait(signal)
    if (isAborted(signal)) return
    const failure = queuedErrors.shift()
    if (failure) throw new Error(failure)
    yield {type: ChatEventType.RUN_FINISHED, ...run}
  }
  const chatStream = async function* (deps: HarnessChatDeps, options?: ScriptedRequest): AsyncGenerator<ChatEvent> {
    const signal = readRequestSignal(options)
    const run = runIdentity(deps, options)
    const nextId = runScopedIds(run.runId)
    const drainCustomEvents = () => customEventChunks(queuedCustomEvents.splice(0), run)
    await startGate.wait(signal)
    if (isAborted(signal)) return
    yield {type: ChatEventType.RUN_STARTED, ...run}
    yield sessionIdChunk(deps, run)
    const turn = queuedTurns.shift()
    if (turn) yield* thinkingChunks(turn.thinking, nextId())
    await toolGate.wait(signal)
    if (isAborted(signal)) return
    const messageId = nextId()
    if (turn) yield* turnChunks(turn, resultGate, drainCustomEvents, signal, messageId)
    if (turn?.permissionAsk !== undefined) yield* permissionAskChunks(turn.permissionAsk, options, run, messageId)
    if (isAborted(signal)) return
    yield* settleTurn(turn, messageId, signal, run)
  }
  return {
    chatStream,
    hold: gate.hold,
    release: gate.release,
    holdStart: startGate.hold,
    releaseStart: startGate.release,
    holdTools: toolGate.hold,
    releaseTools: toolGate.release,
    holdResults: resultGate.hold,
    releaseResults: resultGate.release,
    scriptToolCall,
    scriptTurn,
    scriptCustomEvent,
    scriptPermissionAsk,
    scriptError,
    clearScript,
  }
}

export type ScriptedChat = {
  reply: (text: string) => void
  hold: () => void
  release: () => void
}

export function createScriptedChat(script: ScriptedRun): ScriptedChat {
  return {
    reply: (text) => {
      script.scriptTurn({toolCalls: [], text})
    },
    hold: script.hold,
    release: () => {
      script.releaseStart()
      script.releaseTools()
      script.releaseResults()
      script.release()
    },
  }
}
