import type {ConfigProvider} from 'effect'
import type {z} from 'zod'
import type {ChatMessage} from './chat-message-types.js'
import type {HarnessListCursorSchema, HarnessSessionId, ReasoningEffort, SessionId} from './chat-types.js'
import type {TtyCommand} from './terminal-types.js'

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

export type HarnessModels =
  | HarnessModel[]
  | ((options: {signal: AbortSignal}) => HarnessModel[] | Promise<HarnessModel[]>)

export type HarnessCommand = {name: string; description?: string; argumentHint?: string}

export type HarnessCommandsContext = {cwd: string; sessionId: SessionId; mcpUrl?: string}

export type HarnessCommands = (ctx: HarnessCommandsContext) => Promise<HarnessCommand[]>

export type HarnessConnectContext = {
  cwd: string
  stateDir: string
  concivSessionId: SessionId
  harnessSessionId: HarnessSessionId | null
  resume: boolean
  model: string | null
  mcpUrl: string | null
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
  installed(project: HarnessInitProject & {home: string; configProvider?: ConfigProvider.ConfigProvider}): boolean
  manualCard(root: string): HarnessInitCard
}

export type HarnessInitContribution<Id extends string = string> =
  | HarnessInit<Id>
  | (HarnessInitBase<Id> & {init: 'none'})

export type HarnessPermissionAsk = {
  action: string
  resources: readonly string[]
  metadata: Record<string, unknown>
}

export type HarnessPermissionVerdict = {allowed: true} | {allowed: false; message: string}

export type HarnessChatDeps = {
  cwd: string
  sessionId: SessionId
  askPermission: (ask: HarnessPermissionAsk) => Promise<HarnessPermissionVerdict>
  resumeSessionId: HarnessSessionId | null
  model?: string
  effort?: ReasoningEffort
  env: Record<string, string | undefined>
  kind: 'chat' | 'compact' | 'page-queue'
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

export type HarnessTranscriptPaths =
  | {transcriptPath?: undefined; transcriptRoot?: undefined}
  | {
      transcriptPath(cwd: string, sessionId: HarnessSessionId): Promise<string>

      transcriptRoot(cwd: string): Promise<string>
    }

export type TranscriptCursor = string

export type TranscriptPage = {messages: ChatMessage[]; earlier: TranscriptCursor | null}

export type TranscriptTailOptions = {limit: number; before: TranscriptCursor | null; signal?: AbortSignal}

export type HarnessHistory = HarnessTranscriptPaths & {
  messages(cwd: string, sessionId: HarnessSessionId, options?: {signal?: AbortSignal}): Promise<ChatMessage[]>
  tail(cwd: string, sessionId: HarnessSessionId, options: TranscriptTailOptions): Promise<TranscriptPage>

  withinProject?(cwd: string, sessionId: HarnessSessionId): Promise<boolean>

  contextTokens?(line: string): number | undefined

  list(scope: HarnessListScope, page: HarnessListPage): Promise<HarnessSessionPage>

  meta(cwd: string, sessionId: HarnessSessionId): Promise<HarnessSessionMeta | null>
}

export type ServerSessions = {
  resumeToken(sessionId: SessionId): Promise<HarnessSessionId | null>
  recordToken(sessionId: SessionId, token: HarnessSessionId): Promise<void>
  model(sessionId: SessionId): Promise<string | null>
}

export type ServerHarness = {
  id: string
  ttyCommand?: (ctx: HarnessConnectContext) => TtyCommand
  transcriptExists?: (token: HarnessSessionId) => Promise<boolean>
}
