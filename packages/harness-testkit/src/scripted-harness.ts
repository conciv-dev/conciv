import {Effect, Stream} from 'effect'
import {z} from 'zod'
import {makeTextAdapter} from '@conciv/ai/server'
import {defineHarness, type HarnessAdapter} from '@conciv/harness'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ReasoningEffort} from '@conciv/protocol/chat-types'
import type {HarnessChatDeps, HarnessCommand, HarnessConnectContext, HarnessModel} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'
import type {Gate, ModelRequest, Response} from './test-llm.js'

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

type RunRequest = Pick<StreamOptions, 'messages' | 'tools' | 'systemPrompts' | 'modelOptions'> & {
  threadId?: string
  runId?: string
  request?: {signal?: AbortSignal | null}
}

type HeldGate = {started: PromiseWithResolvers<void>; released: PromiseWithResolvers<void>}

type ScriptState = {requests: ModelRequest[]; held: HeldGate | undefined}

export type ScriptedHarness = {id: string; models?: HarnessModel[]; commands?: HarnessCommand[]}

export type ReplyScript = {
  adapter: (harness: HarnessAdapter) => HarnessAdapter
  scripted: (harness: Partial<ScriptedHarness>) => HarnessAdapter
  gate: () => Gate
  releaseGate: () => void
  requests: () => ModelRequest[]
}

function stamped(event: ChatEvent, run: Run): ChatEvent {
  if (event.type === ChatEventType.RUN_STARTED) return {...event, ...run}
  if (event.type === ChatEventType.RUN_FINISHED) return {...event, ...run}
  if (event.type === ChatEventType.RUN_ERROR) return {...event, ...run}
  return event
}

const InputSchemaSchema = z.record(z.string(), z.unknown())

function recorded(request: RunRequest, deps: HarnessChatDeps): ModelRequest {
  return {
    system: (request.systemPrompts ?? []).map((prompt) => (typeof prompt === 'string' ? prompt : prompt.content)),
    messages: [...request.messages],
    tools: (request.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: InputSchemaSchema.parse(tool.inputSchema ?? {}),
    })),
    model: deps.model ?? null,
    effort: deps.effort ?? null,
    options: {...request.modelOptions},
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
  take: (request: ModelRequest) => Promise<Response>,
): AsyncGenerator<ChatEvent> {
  const run = {threadId: request.threadId ?? deps.sessionId, runId: request.runId ?? crypto.randomUUID()}
  const reply = await take(recorded(request, deps))
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
  const state: ScriptState = {requests: [], held: undefined}
  const take = async (request: ModelRequest): Promise<Response> => {
    const count = state.requests.push(request)
    const reply = queued.shift()
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
  const releaseGate = (): void => {
    const held = state.held
    state.held = undefined
    held?.released.resolve()
  }
  return {
    adapter: (harness) => ({...harness, chatConfig: chatConfig('scripted')}),
    scripted: ({id = FAKE_HARNESS_ID, models = MODELS, commands = COMMANDS}) =>
      defineHarness({
        id,
        binName: 'true',
        chatConfig: chatConfig(id),
        models,
        commands: async () => commands,
        tty: {command: shellCommand},
        capabilities: {
          resume: false,
          permissionGate: 'none',
          compaction: false,
          systemPrompt: 'flag',
          mcp: 'none',
          init: 'none',
          imageInput: false,
          transcriptHistory: false,
          slashCommands: 'live',
        },
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
  }
}
