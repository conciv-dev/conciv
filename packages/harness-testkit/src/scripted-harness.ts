import {Effect, Stream} from 'effect'
import {makeTextAdapter} from '@conciv/ai/server'
import {defineHarness, type HarnessAdapter} from '@conciv/harness'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ReasoningEffort} from '@conciv/protocol/chat-types'
import type {HarnessChatDeps, HarnessCommand, HarnessConnectContext, HarnessModel} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'
import type {Gate, RecordedRequest, Responder, Response} from './test-llm.js'

const FAKE_HARNESS_ID = 'engine'

const EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

const MODELS: HarnessModel[] = [
  {id: 'opus', name: 'Opus 5.5', group: 'Claude', efforts: EFFORTS},
  {id: 'sonnet', name: 'Sonnet 5.5', group: 'Claude', efforts: EFFORTS},
  {id: 'claude-opus-4-7', name: 'Opus 4.7', group: 'Older versions', efforts: EFFORTS},
  {id: 'claude-haiku-4-5', name: 'Haiku 4.5', group: 'Older versions'},
]

const COMMANDS: HarnessCommand[] = [
  {name: 'model', description: 'Set the AI model'},
  {name: 'deploy', description: 'Ship the branch'},
]

const SHELL_START =
  'printf "model %s %sx%s\\n" "$CONCIV_MODEL" "$(tput cols)" "$(tput lines)"; exec bash --noprofile --norc -i'

function shellCommand(context: HarnessConnectContext): TtyCommand {
  return {
    bin: 'bash',
    args: ['-c', SHELL_START],
    env: {
      TERM: 'xterm-256color',
      PS1: '$ ',
      BASH_SILENCE_DEPRECATION_WARNING: '1',
      CONCIV_MODEL: context.model ?? 'none',
    },
  }
}

type Run = {threadId: string; runId: string}

type StreamOptions = Parameters<Parameters<typeof makeTextAdapter>[1]>[0]

type RunRequest = Pick<StreamOptions, 'messages' | 'tools'> & {
  threadId?: string
  runId?: string
  request?: {signal?: AbortSignal | null}
}

type HeldGate = {started: PromiseWithResolvers<void>; released: PromiseWithResolvers<void>}

type ScriptState = {
  requests: RecordedRequest[]
  held: HeldGate | undefined
  fallback: Responder | undefined
  arrived: PromiseWithResolvers<void>
}

export type ReplyScript = {
  harness: (harness: HarnessAdapter | undefined) => HarnessAdapter
  gate: () => Gate
  releaseGate: () => void
  requests: () => RecordedRequest[]
  push: (...replies: readonly Response[]) => void
  always: (reply: Response) => void
  serve: (responder: Responder) => void
  wait: (count: number) => Promise<void>
}

function stamped(event: ChatEvent, run: Run): ChatEvent {
  if (event.type === ChatEventType.RUN_STARTED) return {...event, ...run}
  if (event.type === ChatEventType.RUN_FINISHED) return {...event, ...run}
  if (event.type === ChatEventType.RUN_ERROR) return {...event, ...run}
  return event
}

function recorded(request: RunRequest): RecordedRequest {
  return {
    messages: [...request.messages],
    tools: (request.tools ?? []).map((tool) => ({name: tool.name, description: tool.description})),
  }
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
  take: (request: RecordedRequest) => Promise<Response>,
): AsyncGenerator<ChatEvent> {
  const run = {threadId: request.threadId ?? deps.sessionId, runId: request.runId ?? crypto.randomUUID()}
  const reply = await take(recorded(request))
  yield {type: ChatEventType.RUN_STARTED, ...run}
  yield {
    type: ChatEventType.CUSTOM,
    name: 'fake.session-id',
    value: {sessionId: deps.resumeSessionId ?? `fake-${deps.sessionId}`},
    ...run,
  }
  for await (const event of replyChunks(reply, request.request?.signal ?? undefined)) yield stamped(event, run)
}

function answerWith(reply: Response | undefined): Responder | undefined {
  if (reply === undefined) return undefined
  return () => reply
}

export function replyScript(replies: readonly Response[], fallback: Response | undefined): ReplyScript {
  const queued = [...replies]
  const state: ScriptState = {
    requests: [],
    held: undefined,
    fallback: answerWith(fallback),
    arrived: Promise.withResolvers<void>(),
  }
  const pick = (request: RecordedRequest): Response | undefined => queued.shift() ?? state.fallback?.(request)
  const take = async (request: RecordedRequest): Promise<Response> => {
    const count = state.requests.push(request)
    const arrived = state.arrived
    state.arrived = Promise.withResolvers<void>()
    arrived.resolve()
    const reply = pick(request)
    if (reply === undefined) throw new Error(`the scripted harness has no reply for request ${count}`)
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
  const wait = async (count: number): Promise<void> => {
    while (state.requests.length < count) await state.arrived.promise
  }
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
        models: MODELS,
        commands: async () => COMMANDS,
        tty: {command: shellCommand},
        capabilities: {
          resume: false,
          permissionGate: 'none',
          compaction: false,
          systemPrompt: 'none',
          mcp: 'none',
          init: 'none',
          imageInput: false,
          transcriptHistory: false,
          slashCommands: 'live',
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
    requests: () => [...state.requests],
    push: (...more) => {
      queued.push(...more)
    },
    always: (reply) => {
      state.fallback = () => reply
    },
    serve: (responder) => {
      state.fallback = responder
    },
    wait,
  }
}
