import {Effect, Stream} from 'effect'
import {makeTextAdapter} from '@conciv/ai/server'
import {defineHarness, type HarnessAdapter} from '@conciv/harness'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import type {Gate, Response} from './test-llm.js'

const FAKE_HARNESS_ID = 'engine'

type Run = {threadId: string; runId: string}

type RunRequest = {threadId?: string; runId?: string; request?: {signal?: AbortSignal | null}}

type HeldGate = {started: PromiseWithResolvers<void>; released: PromiseWithResolvers<void>}

type ScriptState = {requests: number; held: HeldGate | undefined}

export type ReplyScript = {
  harness: (harness: HarnessAdapter | undefined) => HarnessAdapter
  gate: () => Gate
  releaseGate: () => void
}

function stamped(event: ChatEvent, run: Run): ChatEvent {
  if (event.type === ChatEventType.RUN_STARTED) return {...event, ...run}
  if (event.type === ChatEventType.RUN_FINISHED) return {...event, ...run}
  if (event.type === ChatEventType.RUN_ERROR) return {...event, ...run}
  return event
}

function abortedBy(signal: AbortSignal): Effect.Effect<void> {
  return Effect.callback<void>((resume) => {
    if (signal.aborted) resume(Effect.void)
    else signal.addEventListener('abort', () => resume(Effect.void), {once: true})
  })
}

function replyChunks(reply: Response, signal: AbortSignal | undefined): Iterable<ChatEvent> | AsyncIterable<ChatEvent> {
  if (!Stream.isStream(reply)) return reply
  if (signal === undefined) return Stream.toAsyncIterable(reply)
  return Stream.toAsyncIterable(Stream.interruptWhen(reply, abortedBy(signal)))
}

async function* replyEvents(
  deps: HarnessChatDeps,
  request: RunRequest,
  take: () => Promise<Response>,
): AsyncGenerator<ChatEvent> {
  const run = {threadId: request.threadId ?? deps.sessionId, runId: request.runId ?? crypto.randomUUID()}
  const reply = await take()
  yield {type: ChatEventType.RUN_STARTED, ...run}
  yield {
    type: ChatEventType.CUSTOM,
    name: 'fake.session-id',
    value: {sessionId: deps.resumeSessionId ?? `fake-${deps.sessionId}`},
    ...run,
  }
  for await (const event of replyChunks(reply, request.request?.signal ?? undefined)) yield stamped(event, run)
}

export function replyScript(replies: readonly Response[]): ReplyScript {
  const queued = [...replies]
  const state: ScriptState = {requests: 0, held: undefined}
  const take = async (): Promise<Response> => {
    state.requests += 1
    const reply = queued.shift()
    if (reply === undefined) throw new Error(`the scripted harness has no reply for request ${state.requests}`)
    const held = state.held
    if (held !== undefined) {
      held.started.resolve()
      await held.released.promise
    }
    return reply
  }
  const chatConfig =
    (name: string): HarnessAdapter['chatConfig'] =>
    (deps) => ({adapter: makeTextAdapter(name, (request) => replyEvents(deps, request, take))})
  const releaseGate = (): void => {
    const held = state.held
    state.held = undefined
    held?.released.resolve()
  }
  return {
    harness: (harness) => {
      if (harness !== undefined) return {...harness, chatConfig: chatConfig('scripted')}
      return defineHarness({
        id: FAKE_HARNESS_ID,
        binName: 'true',
        chatConfig: chatConfig(FAKE_HARNESS_ID),
        capabilities: {
          resume: false,
          permissionGate: 'none',
          compaction: false,
          systemPrompt: 'none',
          mcp: 'none',
          init: 'none',
          imageInput: false,
          transcriptHistory: false,
          slashCommands: 'none',
        },
      })
    },
    gate: () => {
      const held: HeldGate = {started: Promise.withResolvers<void>(), released: Promise.withResolvers<void>()}
      state.held = held
      return {
        started: held.started.promise,
        release: async () => {
          if (state.held === held) state.held = undefined
          held.released.resolve()
        },
      }
    },
    releaseGate,
  }
}
