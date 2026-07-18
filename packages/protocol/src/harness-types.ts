import type {AnyTextAdapter, ModelMessage, UIMessage} from '@tanstack/ai'
import type {TtyCommand, TtyCommandOpts} from './terminal-types.js'

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

export type HarnessLaunchResult = {opened: boolean; command: string}
export type HarnessLaunchContext = {
  cwd: string
  sessionId: string | null
  model: string | null
  mcpUrl: string | null

  openTerminal(argv: string[]): Promise<HarnessLaunchResult>
  openUrl(url: string): Promise<HarnessLaunchResult>
}
export type HarnessLaunch = (ctx: HarnessLaunchContext) => HarnessLaunchResult | Promise<HarnessLaunchResult>

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

export type HarnessHistory = {
  transcriptPath(cwd: string, sessionId: string, home?: string): string
  parse(raw: string): UIMessage[]

  nameFromTranscript?(raw: string): string | null

  contextTokens?(raw: string): number | undefined

  list?(cwd: string, home?: string): HarnessSessionMeta[] | Promise<HarnessSessionMeta[]>
}

type HarnessAdapterBase = {
  id: string
  binName: string

  displayName?: string

  launch?: HarnessLaunch
  chatConfig: (deps: HarnessChatDeps) => HarnessChatConfig

  models?: HarnessModels
  defaultModel?: string

  tty?: {command(opts: TtyCommandOpts): TtyCommand}
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
