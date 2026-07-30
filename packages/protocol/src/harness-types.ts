import type {AnyTextAdapter, ModelMessage, UIMessage} from '@tanstack/ai'
import type {SessionId} from './chat-types.js'
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

export type HarnessCommandsContext = {cwd: string; sessionId?: string; mcpUrl?: string}

export type HarnessCommands = (ctx: HarnessCommandsContext) => Promise<HarnessCommand[]>

export type HarnessConnectContext = {
  cwd: string
  concivSessionId: SessionId
  harnessSessionId: string | null
  resume: boolean
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

export type HarnessChatDeps = {
  cwd: string
  sessionId: string
  resumeSessionId: string | null
  model?: string
  env: Record<string, string | undefined>
  kind: 'chat' | 'compact'
  decide(toolName: string, input: unknown, toolUseId: string): Promise<'allow' | 'deny'>
}

export type HarnessChatConfig = {
  adapter: AnyTextAdapter
  modelOptions?: Record<string, unknown>
  prepareMessages?: (messages: ModelMessage[]) => ModelMessage[]
}

export type HarnessSessionMeta = {
  id: string
  derivedTitle: string
  updatedAt: number
  messageCount: number
  model?: string | null
  totalTokens?: number
  lastMessage?: string | null
  createdAt?: number
}

export type TranscriptStat = {mtimeMs: number; size: number}

export type HarnessHistory = {
  messages(cwd: string, sessionId: string, home?: string): Promise<UIMessage[]>
  transcriptStat(cwd: string, sessionId: string, home?: string): Promise<TranscriptStat | null>

  transcriptPath?(cwd: string, sessionId: string, home?: string): string

  nameFromTranscript?(raw: string): string | null

  contextTokens?(raw: string): number | undefined

  list(cwd: string, home?: string): Promise<HarnessSessionMeta[]>
}

type HarnessAdapterBase = {
  id: string
  binName: string

  displayName?: string

  connect?: HarnessConnect
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
  )

export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  return adapter
}
