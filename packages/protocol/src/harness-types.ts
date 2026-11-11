import type {z} from 'zod'
import type {ChatMessage} from './chat-message-types.js'
import type {HarnessListCursorSchema, HarnessSessionId, ReasoningEffort, SessionId} from './chat-types.js'

export type HarnessCapabilities = {
  resume: boolean
  permissionGate: 'callback' | 'none'
  transcriptHistory: boolean

  compaction: boolean
  systemPrompt: 'file' | 'flag' | 'none'
  mcp: 'http' | 'stdio' | 'none'

  slashCommands: 'live' | 'files' | 'none'

  imageInput: 'native' | 'fileRef' | false

  init: 'files' | 'none'
}

export type HarnessImage = {mediaType: string; dataBase64: string}

export const FILE_REF_PREFIX = '\n\nAttached image files (read them with the Read tool before answering):'

export type HarnessModel = {
  id: string
  name: string
  description?: string
  group?: string
  disabled?: boolean
  contextWindow?: number
  efforts?: ReasoningEffort[]
}

export type HarnessModels = HarnessModel[] | (() => HarnessModel[] | Promise<HarnessModel[]>)

export type HarnessCommand = {name: string; description?: string; argumentHint?: string}

export type HarnessCommandsContext = {cwd: string; sessionId: SessionId; mcpUrl?: string}

export type HarnessCommands = (ctx: HarnessCommandsContext) => Promise<HarnessCommand[]>

export type HarnessConnectContext = {
  cwd: string
  stateDir: string
  concivSessionId: SessionId
  harnessSessionId: HarnessSessionId | null
  resume: boolean
  owned: boolean
  model: string | null
  mcpUrl: string | null
  hookUrl: string | null
}

export type HarnessConnectFile = {path: string; contents: string; mode?: number}

export type HarnessInitDetection = {bin: string; configDir: string[]}

export type HarnessInitCommand = {bin: string; args: string[]}

export type HarnessInitCard = {title: string; body: string; snippet: string}

export type HarnessInitProject = {cwd: string; stateDir: string}

export type HarnessInitPlan = {root: string; files: HarnessConnectFile[]; commands: HarnessInitCommand[]}

export const INIT_HARNESS_IDS = ['claude', 'codex', 'gemini-cli', 'opencode', 'pi'] as const

export type InitHarnessId = (typeof INIT_HARNESS_IDS)[number]

type HarnessInitBase<Id extends string> = {
  harnessId: Id
  detection: HarnessInitDetection
  agentsMdNote?: string
  hub?: {
    name: string
    shellEnv: string
    add: (command: string[], env: Readonly<Record<string, string>>) => string[]
    remove?: string[]
  }
}

export type HarnessInit<Id extends string = string> = HarnessInitBase<Id> & {
  init: 'files'
  title: string
  running: string
  completed: string
  planSummary: string
  plan(project: HarnessInitProject): HarnessInitPlan
  installed(project: HarnessInitProject & {home: string}): boolean
  manualCard(root: string): HarnessInitCard
}

export type HarnessInitContribution<Id extends string = string> =
  | HarnessInit<Id>
  | (HarnessInitBase<Id> & {init: 'none'})

export type HarnessChatDeps = {
  cwd: string
  sessionId: SessionId
  resumeSessionId: HarnessSessionId | null
  model?: string
  effort?: ReasoningEffort
  env: Record<string, string | undefined>
  kind: 'chat' | 'compact' | 'page-queue'
  hasTools?: boolean
}

export type HarnessSessionMeta = {
  id: HarnessSessionId
  cwd: string
  derivedTitle: string
  updatedAt: number
  sizeBytes?: number
  model?: string | null
  totalTokens?: number
  lastMessage?: string | null
  createdAt?: number
}

export type HarnessResumeInput = {cwd: string; nativeId: HarnessSessionId}

export type HarnessResume = {command(input: HarnessResumeInput): {bin: string; args: string[]}}

export type HarnessListCursor = z.infer<typeof HarnessListCursorSchema>

export type HarnessListPage = {after: HarnessListCursor | null; limit: number}

export type HarnessListScope = {cwd: string} | {everywhere: true}

export type HarnessSessionPage = {sessions: HarnessSessionMeta[]; next: HarnessListCursor | null}

export const TRANSCRIPT_FAILURES = ['missing', 'unreadable', 'corrupt'] as const

export type TranscriptFailureReason = (typeof TRANSCRIPT_FAILURES)[number]

export type TranscriptRevision = {rev: string; changedAt: number}

export type TranscriptFailure = {ok: false; reason: TranscriptFailureReason; detail: string}

export type TranscriptChunk = {
  ok: true
  rev: string
  changedAt: number
  messages: ChatMessage[]
  replaced: boolean
}

export type TranscriptHandle = {
  revision(): Promise<TranscriptRevision | TranscriptFailure>
  read(): Promise<TranscriptChunk | TranscriptFailure>
  close(): void
}

export type HarnessTranscriptPaths =
  | {transcriptPath?: undefined; transcriptRoot?: undefined}
  | {
      transcriptPath(cwd: string, sessionId: HarnessSessionId): string

      transcriptRoot(cwd: string): string
    }

export type TranscriptCursor = string

export type TranscriptPage = {messages: ChatMessage[]; earlier: TranscriptCursor | null}

export type TranscriptTailOptions = {limit: number; before: TranscriptCursor | null; signal?: AbortSignal}

export type HarnessHistory = HarnessTranscriptPaths & {
  messages(cwd: string, sessionId: HarnessSessionId, options?: {signal?: AbortSignal}): Promise<ChatMessage[]>
  tail(cwd: string, sessionId: HarnessSessionId, options: TranscriptTailOptions): Promise<TranscriptPage>
  observe(cwd: string, sessionId: HarnessSessionId): TranscriptHandle

  withinProject?(cwd: string, sessionId: HarnessSessionId): boolean

  nameFromTranscript?(raw: string): string | null

  contextTokens?(raw: string): number | undefined

  list(scope: HarnessListScope, page: HarnessListPage): Promise<HarnessSessionPage>

  meta(cwd: string, sessionId: HarnessSessionId): Promise<HarnessSessionMeta | null>
}
