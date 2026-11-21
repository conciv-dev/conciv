import {z} from 'zod'
import {makeTextAdapter} from '@conciv/ai/server'
import {fakeText} from '@conciv/ai/testkit'
import {defineHarness, type HarnessAdapter} from '@conciv/harness'
import {pageAfter} from '@conciv/harness/page'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {HarnessSessionId, type ReasoningEffort} from '@conciv/protocol/chat-types'
import type {
  HarnessCapabilities,
  HarnessChatDeps,
  HarnessCommand,
  HarnessConnectContext,
  HarnessHistory,
  HarnessListScope,
  HarnessModel,
  HarnessSessionMeta,
  TranscriptFailure,
  TranscriptHandle,
  TranscriptPage,
  TranscriptTailOptions,
} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'
import type {FakeResponseStep, Gate, ModelRequest, Reply} from './test-llm.js'

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

type StreamOptions = Parameters<Parameters<typeof makeTextAdapter>[1]>[0]

type HeldGate = {started: PromiseWithResolvers<void>; released: PromiseWithResolvers<void>}

type ScriptState = {requests: ModelRequest[]; held: HeldGate | undefined}

export type ScriptedSession = {
  id: string
  cwd?: string
  derivedTitle: string
  updatedAt: number
  messages: ChatMessage[]
}

export type ScriptedHarness = {
  id: string
  models?: HarnessModel[]
  commands?: HarnessCommand[]
  sessions?: ScriptedSession[]
}

type StoredSession = {meta: HarnessSessionMeta; messages: ChatMessage[]}

const CAPABILITIES = {
  permissionGate: 'none',
  compaction: false,
  systemPrompt: 'flag',
  mcp: 'none',
  init: 'none',
  imageInput: false,
  slashCommands: 'live',
} satisfies Omit<HarnessCapabilities, 'resume' | 'transcriptHistory'>

const REVISION = 'scripted'

const TailCursorSchema = z.string().regex(/^\d+$/).transform(Number)

function storedSession(session: ScriptedSession, project: string): StoredSession {
  const id = HarnessSessionId.safeParse(session.id)
  if (!id.success) {
    throw new Error(`the scripted session id ${session.id} is not a harness session id: use letters, digits, _ and -`)
  }
  const meta = {
    id: id.data,
    cwd: session.cwd ?? project,
    derivedTitle: session.derivedTitle,
    updatedAt: session.updatedAt,
  }
  return {meta, messages: session.messages}
}

function inScope(meta: HarnessSessionMeta, scope: HarnessListScope): boolean {
  return 'everywhere' in scope || meta.cwd === scope.cwd
}

function pageBefore(messages: ChatMessage[], end: number, limit: number): TranscriptPage {
  const start = messages.findLastIndex(
    (message, index) => index > 0 && index < end && message.role === 'user' && end - index >= limit,
  )
  if (start === -1) return {messages: messages.slice(0, end), earlier: null}
  return {messages: messages.slice(start, end), earlier: String(start)}
}

function tailPage(messages: ChatMessage[], options: TranscriptTailOptions): TranscriptPage {
  if (options.before === null) return pageBefore(messages, messages.length, options.limit)
  const before = TailCursorSchema.safeParse(options.before)
  if (!before.success) return {messages: [], earlier: null}
  return pageBefore(messages, Math.min(before.data, messages.length), options.limit)
}

function observedSession(session: StoredSession | undefined, cwd: string, sessionId: string): TranscriptHandle {
  const missing: TranscriptFailure = {
    ok: false,
    reason: 'missing',
    detail: `no scripted session ${sessionId} in ${cwd}`,
  }
  return {
    revision: async () => (session === undefined ? missing : {rev: REVISION, changedAt: session.meta.updatedAt}),
    read: async () =>
      session === undefined
        ? missing
        : {ok: true, rev: REVISION, changedAt: session.meta.updatedAt, messages: [...session.messages], replaced: true},
    close: () => {},
  }
}

function scriptedHistory(sessions: StoredSession[]): HarnessHistory {
  const found = (cwd: string, sessionId: string): StoredSession | undefined =>
    sessions.find((session) => session.meta.id === sessionId && session.meta.cwd === cwd)
  return {
    list: async (scope, page) => {
      const metas = sessions.map((session) => session.meta).filter((meta) => inScope(meta, scope))
      const paged = pageAfter(metas, page, (meta) => ({updatedAt: meta.updatedAt, id: meta.id}))
      return {sessions: paged.items, next: paged.next}
    },
    meta: async (cwd, sessionId) => found(cwd, sessionId)?.meta ?? null,
    messages: async (cwd, sessionId) => [...(found(cwd, sessionId)?.messages ?? [])],
    tail: async (cwd, sessionId, options) => tailPage(found(cwd, sessionId)?.messages ?? [], options),
    observe: (cwd, sessionId) => observedSession(found(cwd, sessionId), cwd, sessionId),
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

const InputSchemaSchema = z.record(z.string(), z.unknown())

function recorded(request: StreamOptions, deps: HarnessChatDeps): ModelRequest {
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

export function replyScript(tokensPerSecond: number | undefined): ReplyScript {
  const fake = fakeText(tokensPerSecond === undefined ? {} : {tokensPerSecond})
  const state: ScriptState = {requests: [], held: undefined}
  const gated =
    (reply: Reply): FakeResponseStep =>
    async (call) => {
      const held = state.held
      if (held !== undefined) {
        held.started.resolve()
        await held.released.promise
      }
      return typeof reply === 'function' ? reply(call) : reply
    }
  async function* scriptedRun(deps: HarnessChatDeps, request: StreamOptions): AsyncGenerator<ChatEvent> {
    const count = state.requests.push(recorded(request, deps))
    if (fake.pendingResponses() === 0) throw new Error(`the scripted harness has no reply for request ${count}`)
    for await (const event of fake.chatStream(request)) {
      yield event
      if (event.type === ChatEventType.RUN_STARTED) {
        yield {
          type: ChatEventType.CUSTOM,
          name: 'fake.session-id',
          value: {sessionId: deps.resumeSessionId ?? `fake-${deps.sessionId}`},
        }
      }
    }
  }
  const chatConfig =
    (name: string): HarnessAdapter['chatConfig'] =>
    (deps) => ({adapter: makeTextAdapter(name, (request) => scriptedRun(deps, request))})
  const releaseGate = (): void => {
    const held = state.held
    state.held = undefined
    held?.released.resolve()
  }
  return {
    adapter: (harness) => ({...harness, chatConfig: chatConfig('scripted')}),
    scripted: ({id = FAKE_HARNESS_ID, models = MODELS, commands = COMMANDS, sessions}, project) => {
      const base = {
        id,
        binName: 'true',
        chatConfig: chatConfig(id),
        models,
        commands: async () => commands,
        tty: {command: shellCommand},
      }
      if (sessions === undefined) {
        return defineHarness({...base, capabilities: {...CAPABILITIES, resume: false, transcriptHistory: false}})
      }
      return defineHarness({
        ...base,
        capabilities: {...CAPABILITIES, resume: true, transcriptHistory: true},
        history: scriptedHistory(sessions.map((session) => storedSession(session, project))),
        resume: {command: ({nativeId}) => ({bin: id, args: [nativeId]})},
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
    add: (replies) => {
      fake.appendResponses(replies.map(gated))
    },
  }
}
