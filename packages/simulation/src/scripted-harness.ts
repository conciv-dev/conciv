import {once} from 'node:events'
import {z} from 'zod'
import {makeTextAdapter} from '@conciv/harness/adapters'
import type {HarnessAdapter} from '@conciv/harness'
import {ChatEventType, type ChatEvent} from '@conciv/types/chat-event-types'
import type {HarnessChatDeps} from '@conciv/types/harness-types'
import {fakeText} from './ai-testkit.js'
import {ENGINE_HARNESS, scriptedHarness, writeContextTokens, type ScriptedHarness} from './backend/scripted-harness.js'
import {recordedRequest} from './backend/simulated-harness.js'
import type {FakeResponseStep, Gate, ModelRequest, Reply} from './test-llm.js'
import {simulationErrors} from '@conciv/errors'

export type {ScriptedHarness, ScriptedSession} from './backend/scripted-harness.js'

const CodedErrorSchema = z.object({error: z.string(), code: z.string()})

type StreamOptions = Parameters<Parameters<typeof makeTextAdapter>[1]>[0]

type HeldGate = {started: PromiseWithResolvers<void>; released: PromiseWithResolvers<void>}

type ScriptState = {requests: ModelRequest[]; held: HeldGate | undefined}

type ScriptedUsage = Pick<ScriptedHarness, 'contextTokens' | 'contextWindow'> & {project?: string}

function withContextWindow(event: ChatEvent, contextWindow: number | undefined): ChatEvent {
  if (event.type !== ChatEventType.RUN_FINISHED || contextWindow === undefined || event.usage === undefined)
    return event
  if (Array.isArray(event.usage)) return event
  return {
    ...event,
    usage: {...event.usage, providerUsageDetails: {...event.usage.providerUsageDetails, contextWindow}},
  }
}

export type ReplyScript = {
  adapter: (harness: HarnessAdapter) => HarnessAdapter
  scripted: (harness: Partial<ScriptedHarness>, project: string) => HarnessAdapter
  gate: () => Gate
  releaseGate: () => void
  requests: () => ModelRequest[]
  add: (replies: readonly Reply[]) => void
}

async function releasedOrStopped(held: HeldGate, signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) return held.released.promise
  if (signal.aborted) return
  const settled = new AbortController()
  await Promise.race([held.released.promise, once(signal, 'abort', {signal: settled.signal})])
    .catch(() => undefined)
    .finally(() => settled.abort())
}

export function replyScript(tokensPerSecond: number | undefined): ReplyScript {
  const fake = fakeText(tokensPerSecond === undefined ? {} : {tokensPerSecond})
  const state: ScriptState = {requests: [], held: undefined}
  const codes = new WeakMap<object, string>()
  const gated =
    (reply: Reply): FakeResponseStep =>
    async (call) => {
      const held = state.held
      if (held !== undefined) {
        held.started.resolve()
        await releasedOrStopped(held, call.request.request?.signal ?? call.request.abortController?.signal)
        if (state.held === held) state.held = undefined
      }
      const step = typeof reply === 'function' ? await reply(call) : reply
      const coded = CodedErrorSchema.safeParse(step)
      if (coded.success) codes.set(call.request, coded.data.code)
      return step
    }
  async function* scriptedRun(
    deps: HarnessChatDeps,
    request: StreamOptions,
    usage: ScriptedUsage,
  ): AsyncGenerator<ChatEvent> {
    const count = state.requests.push(recordedRequest(request, deps))
    if (fake.pendingResponses() === 0) throw simulationErrors.NO_SCRIPTED_REPLY({count})
    const nativeId = deps.resumeSessionId ?? `fake-${deps.sessionId}`
    for await (const event of fake.chatStream(request)) {
      const code = codes.get(request)
      if (event.type === ChatEventType.RUN_FINISHED && usage.contextTokens !== undefined && usage.project) {
        await writeContextTokens(usage.project, nativeId, usage.contextTokens)
      }
      yield event.type === ChatEventType.RUN_ERROR && code !== undefined
        ? {...event, code, error: {message: event.message, code}}
        : withContextWindow(event, usage.contextWindow)
      if (event.type === ChatEventType.RUN_STARTED) {
        yield {
          type: ChatEventType.CUSTOM,
          name: 'fake.session-id',
          value: {sessionId: nativeId},
        }
      }
    }
  }
  const chatConfig =
    (name: string, usage: ScriptedUsage = {}): HarnessAdapter['chatConfig'] =>
    async (deps) => ({adapter: makeTextAdapter(name, (request) => scriptedRun(deps, request, usage))})
  const releaseGate = (): void => {
    const held = state.held
    state.held = undefined
    held?.released.resolve()
  }
  return {
    adapter: (harness) => ({...harness, chatConfig: chatConfig('scripted')}),
    scripted: (
      {
        id = ENGINE_HARNESS.id,
        models = ENGINE_HARNESS.models,
        commands = ENGINE_HARNESS.commands,
        sessions,
        contextTokens,
        contextWindow,
      },
      project,
    ) => ({
      ...scriptedHarness({id, models, commands, sessions, terminal: true, contextTokens}, project),
      chatConfig: chatConfig(id, {contextTokens, contextWindow, project}),
    }),
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
    requests: () => [...state.requests],
    add: (replies) => {
      fake.appendResponses(replies.map(gated))
    },
  }
}
