import type {Readable, Writable} from 'node:stream'
import type {StreamChunk, UIMessage} from '@tanstack/ai'
import type {UsageSnapshot} from './usage-types.js'
import type {TtyCommand, TtyCommandOpts} from './terminal-types.js'

export type HarnessCapabilities = {
  resume: boolean
  permissionGate: 'hook' | 'callback' | 'none'
  transcriptHistory: boolean

  compaction: boolean
  systemPrompt: 'file' | 'flag' | 'none'
  mcp: 'http' | 'stdio' | 'none'

  slashCommands: 'live' | 'files' | 'none'

  imageInput: 'native' | 'fileRef' | false
}

export type HarnessImage = {mediaType: string; dataBase64: string}

export type HarnessModel = {id: string; name: string; description?: string; group?: string; disabled?: boolean}

export type HarnessModels = HarnessModel[] | (() => HarnessModel[] | Promise<HarnessModel[]>)

export type HarnessCommand = {name: string; description?: string; argumentHint?: string}

export type HarnessCommandsContext = {cwd: string; sessionId?: string; mcpUrl?: string}

export type HarnessCommands = (ctx: HarnessCommandsContext) => Promise<HarnessCommand[]>

export type HarnessTurn = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  systemPrompt: string
  permissionUrl?: string
  mcpUrl?: string

  sessionId?: string
  images?: HarnessImage[]

  model?: string

  kind?: 'chat' | 'compact'
}

export type HarnessChild = {pid: number; stdout: Readable; stderr: Readable; stdin?: Writable; kill(): void}

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

export type HarnessArgsBuilder = (turn: HarnessTurn) => string[]

export type HarnessRunContext = {
  sessionId: string
  env: Record<string, string | undefined>
  onSessionId(id: string): void
  onUsage?(usage: UsageSnapshot): void
  signal: AbortSignal
  decide(toolName: string, input: unknown, toolUseId: string): Promise<'allow' | 'deny'>
  runId?: string
  threadId?: string
  logger?: HarnessDecodeLogger
}
export type HarnessRun = (turn: HarnessTurn, ctx: HarnessRunContext) => AsyncGenerator<StreamChunk>

export type HarnessDeliverInput = (child: HarnessChild, turn: HarnessTurn) => void | Promise<void>

export type HarnessDecodeLogger = {provider(msg: string, meta?: unknown): void}

export type HarnessDecodeOpts = {
  onSessionId(id: string): void

  onUsage?(usage: UsageSnapshot): void
  runId?: string
  threadId?: string
  logger?: HarnessDecodeLogger
}

export type HarnessDecoder = (lines: AsyncIterable<string>, opts: HarnessDecodeOpts) => AsyncGenerator<StreamChunk>

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
  transcriptPath(cwd: string, sessionId: string): string
  parse(raw: string): UIMessage[]

  nameFromTranscript?(raw: string): string | null

  list?(cwd: string, home?: string): HarnessSessionMeta[] | Promise<HarnessSessionMeta[]>
}

type HarnessAdapterBase = {
  id: string
  binName: string

  displayName?: string

  launch?: HarnessLaunch
  buildArgs: HarnessArgsBuilder

  buildCompactArgs?: HarnessArgsBuilder
  decode: HarnessDecoder
  deliverInput?: HarnessDeliverInput
  run?: HarnessRun
  shutdown?: () => void | Promise<void>

  models?: HarnessModels
  defaultModel?: string

  tty?: {command(opts: TtyCommandOpts): TtyCommand}
  release?: (sessionId: string) => void
}

export type HarnessAdapter = HarnessAdapterBase &
  (
    | {capabilities: HarnessCapabilities & {transcriptHistory: true}; history: HarnessHistory}
    | {capabilities: HarnessCapabilities & {transcriptHistory: false}; history?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {compaction: true}; buildCompactArgs: HarnessArgsBuilder}
    | {capabilities: HarnessCapabilities & {compaction: false}; buildCompactArgs?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {slashCommands: 'live' | 'files'}; commands: HarnessCommands}
    | {capabilities: HarnessCapabilities & {slashCommands: 'none'}; commands?: undefined}
  )

export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  return adapter
}
