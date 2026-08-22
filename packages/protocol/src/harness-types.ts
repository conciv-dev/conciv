import type {AnyTextAdapter, ModelMessage, UIMessage} from '@tanstack/ai'
import type {HarnessSessionId, SessionId} from './chat-types.js'
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

export type HarnessConnectPlan = {
  argv: string[]
  env: Record<string, string>
  files: HarnessConnectFile[]
}

export type HarnessConnect = {plan(ctx: HarnessConnectContext): HarnessConnectPlan}

export type HarnessInitDetection = {bin: string; configDir: string[]}

export type HarnessInitCommand = {bin: string; args: string[]}

export type HarnessInitCard = {title: string; body: string; snippet: string}

export type HarnessInitProject = {cwd: string; stateDir: string}

export type HarnessInitPlan = {root: string; files: HarnessConnectFile[]; commands: HarnessInitCommand[]}

type HarnessInitBase<Id extends string> = {
  harnessId: Id
  detection: HarnessInitDetection
  agentsMdNote?: string
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

export type TerminalOpenRequest = {bin: string; args: string[]}

export type TerminalOpener = (request: TerminalOpenRequest) => Promise<boolean>

export type HarnessLiveSession = {
  sessionId: HarnessSessionId
  pid: number
  cwd: string
  name: string
  status: 'idle' | 'busy' | 'shell'
  startedAt?: number
}

export type HarnessAttachInstall = {
  root: string
  stateDir: string
  mcpUrl: string
  hookUrl: string
}

export type HarnessAttachResult = {ok: boolean; reloadCommand: string; detail?: string}

export type HarnessAttachRemoval = {root: string; stateDir: string}

export type HarnessAttach = {
  candidates(cwd: string, home?: string): Promise<HarnessLiveSession[]>
  install(opts: HarnessAttachInstall): Promise<HarnessAttachResult>
  uninstall(opts: HarnessAttachRemoval): Promise<void>
}

export type HarnessChatDeps = {
  cwd: string
  sessionId: SessionId
  resumeSessionId: HarnessSessionId | null
  model?: string
  env: Record<string, string | undefined>
  kind: 'chat' | 'compact'
  hasTools?: boolean
  decide(toolName: string, input: unknown, toolUseId: string): Promise<'allow' | 'deny'>
}

export type HarnessChatConfig = {
  adapter: AnyTextAdapter
  modelOptions?: Record<string, unknown>
  prepareMessages?: (messages: ModelMessage[]) => ModelMessage[]
}

export type HarnessSessionMeta = {
  id: HarnessSessionId
  derivedTitle: string
  updatedAt: number
  messageCount: number
  model?: string | null
  totalTokens?: number
  lastMessage?: string | null
  createdAt?: number
}

export type HarnessSessionSummary = {meta: HarnessSessionMeta; tail: UIMessage[]}

export const TRANSCRIPT_FAILURES = ['missing', 'unreadable', 'corrupt'] as const

export type TranscriptFailureReason = (typeof TRANSCRIPT_FAILURES)[number]

export type TranscriptRevision = {rev: string; changedAt: number}

export type TranscriptFailure = {ok: false; reason: TranscriptFailureReason; detail: string}

export type TranscriptChunk = {
  ok: true
  rev: string
  changedAt: number
  messages: UIMessage[]
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
      transcriptPath(cwd: string, sessionId: HarnessSessionId, home?: string): string

      transcriptRoot(cwd: string, home?: string): string
    }

export type HarnessHistory = HarnessTranscriptPaths & {
  messages(cwd: string, sessionId: HarnessSessionId, home?: string): Promise<UIMessage[]>
  observe(cwd: string, sessionId: HarnessSessionId, home?: string): TranscriptHandle

  withinProject?(cwd: string, sessionId: HarnessSessionId, home?: string): boolean

  nameFromTranscript?(raw: string): string | null

  contextTokens?(raw: string): number | undefined

  list(cwd: string, home?: string): Promise<HarnessSessionMeta[]>

  meta?(cwd: string, sessionId: HarnessSessionId, home?: string): Promise<HarnessSessionMeta | null>

  summary?(cwd: string, sessionId: HarnessSessionId, home?: string): Promise<HarnessSessionSummary | null>
}

type HarnessAdapterBase = {
  id: string
  binName: string

  displayName?: string

  connect?: HarnessConnect
  attach?: HarnessAttach
  chatConfig: (deps: HarnessChatDeps) => HarnessChatConfig

  models?: HarnessModels
  defaultModel?: string

  tty?: {command(ctx: HarnessConnectContext): TtyCommand}
}

export type HarnessAdapter = HarnessAdapterBase &
  (
    | {capabilities: HarnessCapabilities & {transcriptHistory: true}; history: HarnessHistory}
    | {capabilities: HarnessCapabilities & {transcriptHistory: false}; history?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {slashCommands: 'live' | 'files'}; commands: HarnessCommands}
    | {capabilities: HarnessCapabilities & {slashCommands: 'none'}; commands?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {init: 'files'}; init: HarnessInit}
    | {capabilities: HarnessCapabilities & {init: 'none'}; init?: undefined}
  )

export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  return adapter
}
