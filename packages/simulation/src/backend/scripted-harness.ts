import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import {defineHarness, type HarnessAdapter} from '@conciv/harness'
import {pageAfter} from '@conciv/harness/page'
import type {ChatMessage} from '@conciv/types/chat-message-types'
import {HarnessSessionId, type ReasoningEffort} from '@conciv/types/chat-types'
import type {
  HarnessCapabilities,
  HarnessCommand,
  HarnessConnectContext,
  HarnessHistory,
  HarnessListScope,
  HarnessModel,
  HarnessSessionMeta,
  TranscriptPage,
  TranscriptTailOptions,
} from '@conciv/types/harness-types'
import type {TtyCommand} from '@conciv/types/terminal-types'
import {simulationErrors} from '@conciv/errors'

const EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

const ENGINE_MODELS: HarnessModel[] = [
  {id: 'opus', name: 'Opus 5.5', group: 'Claude', efforts: EFFORTS},
  {id: 'sonnet', name: 'Sonnet 5.5', group: 'Claude', efforts: EFFORTS},
  {id: 'claude-opus-4-7', name: 'Opus 4.7', group: 'Older versions', efforts: EFFORTS},
  {id: 'claude-haiku-4-5', name: 'Haiku 4.5', group: 'Older versions'},
]

const ENGINE_COMMANDS: HarnessCommand[] = [
  {name: 'model', description: 'Set the AI model'},
  {name: 'deploy', description: 'Ship the branch'},
]

const SHELL_START =
  'printf "model %s %sx%s\\n" "$CONCIV_MODEL" "$(tput cols)" "$(tput lines)"; exec bash --noprofile --norc -i'

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
  terminal?: boolean
  contextTokens?: number
  contextWindow?: number
}

export const ENGINE_HARNESS: ScriptedHarness = {
  id: 'engine',
  models: ENGINE_MODELS,
  commands: ENGINE_COMMANDS,
  terminal: true,
}

type StoredSession = {meta: HarnessSessionMeta; messages: ChatMessage[]}

const CAPABILITIES = {
  permissionGate: 'none',
  compaction: false,
  systemPrompt: 'flag',
  mcp: 'none',
  init: 'none',
  login: 'none',
  imageInput: false,
  slashCommands: 'live',
} satisfies Omit<HarnessCapabilities, 'resume' | 'transcriptHistory'>

const TailCursorSchema = z.string().regex(/^\d+$/).transform(Number)

const ContextTokensSchema = z.coerce.number().int().nonnegative()

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

function storedSession(session: ScriptedSession, project: string): StoredSession {
  const id = HarnessSessionId.safeParse(session.id)
  if (!id.success) {
    throw simulationErrors.SCRIPTED_SESSION_ID({id: session.id})
  }
  return {
    meta: {id: id.data, cwd: session.cwd ?? project, derivedTitle: session.derivedTitle, updatedAt: session.updatedAt},
    messages: session.messages,
  }
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

function transcriptRoot(cwd: string): string {
  return join(cwd, '.conciv', 'scripted-transcripts')
}

function transcriptPath(cwd: string, sessionId: string): string {
  return join(transcriptRoot(cwd), `${sessionId}.txt`)
}

export async function writeContextTokens(cwd: string, sessionId: string, contextTokens: number): Promise<void> {
  const path = transcriptPath(cwd, sessionId)
  await mkdir(dirname(path), {recursive: true})
  await writeFile(path, String(contextTokens), 'utf8')
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
  }
}

function countedHistory(sessions: StoredSession[]): HarnessHistory {
  return {
    ...scriptedHistory(sessions),
    transcriptRoot: async (cwd) => transcriptRoot(cwd),
    transcriptPath: async (cwd, sessionId) => transcriptPath(cwd, sessionId),
    contextTokens: (line) => (line.trim() === '' ? undefined : ContextTokensSchema.safeParse(line.trim()).data),
  }
}

export function scriptedHarness(
  {id, models = [], commands = [], sessions, terminal = false, contextTokens}: ScriptedHarness,
  project: string,
): HarnessAdapter {
  const base = {
    id,
    binName: 'true',
    chatConfig: async () => {
      throw simulationErrors.OUTSIDE_SIMULATION({id})
    },
    models,
    commands: async () => commands,
    ...(terminal ? {tty: {command: shellCommand}} : {}),
  }
  if (sessions === undefined && contextTokens === undefined) {
    return defineHarness({...base, capabilities: {...CAPABILITIES, resume: false, transcriptHistory: false}})
  }
  const stored = (sessions ?? []).map((session) => storedSession(session, project))
  return defineHarness({
    ...base,
    capabilities: {...CAPABILITIES, resume: true, transcriptHistory: true},
    history: contextTokens === undefined ? scriptedHistory(stored) : countedHistory(stored),
    resume: {command: ({nativeId}) => ({bin: id, args: [nativeId]})},
  })
}
