import type {ProcedureContract, InferSchemaInput, InferSchemaOutput} from '@orpc/contract'
import type {contract, DraftRow} from '@conciv/protocol'
import type {ChatMessage} from '@conciv/types/chat-message-types'
import type {ChatCommand, ChatModels} from '@conciv/types/chat-types'
import type {UsageSnapshot} from '@conciv/types/usage-types'
import type {EngineConnection, EngineTokenSource} from '@conciv/client'

export type Promisable<T> = T | Promise<T>

export type Call = {readonly signal: AbortSignal | undefined}

type Handler<P> =
  P extends ProcedureContract<infer Input, infer Output, infer _Errors>
    ? (input: InferSchemaOutput<Input>, call: Call) => Promisable<InferSchemaInput<Output>>
    : never

type Handlers<Router> = {
  [Key in keyof Router]?: Router[Key] extends ProcedureContract<infer _I, infer _O, infer _E>
    ? Handler<Router[Key]>
    : Handlers<Router[Key]>
}

export type FakeEngineHandlers = Handlers<typeof contract>

type Output<P> = P extends ProcedureContract<infer _I, infer O, infer _E> ? InferSchemaInput<O> : never

type PluginContract = (typeof contract)['plugin']

export type FakePluginInfo = Output<PluginContract['list']>['data'][number]

export type FakeBundleBuild = NonNullable<Output<PluginContract['experimental']>['data']>

export type FakeBundleChunks = Output<PluginContract['experimentalChunk']>['data']['chunks']

export type FakeBundle = {
  readonly info: FakePluginInfo
  readonly experimental?: () => Promise<FakeBundleBuild>
  readonly chunk?: (file: string) => Promise<FakeBundleChunks>
}

export type FakePluginCall = {
  readonly emit: (type: `rpc.${string}`, data: Record<string, unknown>) => void
  readonly signal?: AbortSignal | undefined
}

export type FakePluginHandler = (input: unknown, call: FakePluginCall) => unknown

export type FakeReply =
  | {readonly kind: 'text'; readonly text: string; readonly ends: boolean}
  | {readonly kind: 'thinking'; readonly text: string}
  | {readonly kind: 'usage'; readonly usage: UsageSnapshot}
  | {
      readonly kind: 'toolCall'
      readonly id: string
      readonly name: string
      readonly input: unknown
      readonly result: unknown
      readonly failed: boolean
    }
  | {readonly kind: 'execute'; readonly id: string; readonly name: string; readonly input: unknown}
  | {readonly kind: 'failAfter'; readonly message: string; readonly code?: string}
  | {readonly kind: 'hang'}

export type FakeGate = {readonly started: Promise<void>; readonly release: () => void}

export type FakeSession = {readonly id: string; readonly title?: string; readonly messages?: readonly ChatMessage[]}

export type FakePastSession = {
  readonly nativeId: string
  readonly title: string
  readonly updatedAt: number
  readonly cwd?: string
  readonly messages: readonly ChatMessage[]
}

export type FakeHarness = ChatModels & {readonly commands?: readonly ChatCommand[]}

export type FakeEngineReading = {
  readonly stale: boolean
  readonly changed: readonly string[]
  readonly tracked: readonly string[]
  readonly bootedAt: number
  readonly fingerprint: string
}

export type FakeAsk = {readonly title?: string; readonly always?: boolean}

export type FakeTool = {readonly ask?: FakeAsk; readonly run?: (input: unknown) => unknown}

export type FakeOutsideAgent = {readonly client?: string; readonly session?: string}

export type FakeOutsideReply = {
  readonly content: readonly {readonly type: 'text'; readonly text: string}[]
  readonly isError?: boolean
}

export type FakeOutside = {
  call(name: string, input: unknown): Promise<FakeOutsideReply>
  discover(names: readonly string[]): Promise<FakeOutsideReply>
}

export type FakeEngineOptions = {
  readonly directory?: string
  readonly token?: string
  readonly loggedIn?: boolean
  readonly sessions?: readonly FakeSession[]
  readonly pastSessions?: readonly FakePastSession[]
  readonly harnesses?: readonly FakeHarness[]
  readonly settings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  readonly plugins?: Readonly<Record<string, Readonly<Record<string, FakePluginHandler>>>>
  readonly bundles?: readonly FakeBundle[]
  readonly tools?: Readonly<Record<string, FakeTool>>
  readonly tokensPerSecond?: number
  readonly handlers?: FakeEngineHandlers
}

export type FakeSynthetic = {
  readonly text: string
  readonly description?: string
  readonly metadata?: Record<string, unknown>
  readonly resume?: boolean
}

export type FakeSend = {readonly sessionId: string; readonly messages: readonly ChatMessage[]}

export type FakeConnectOptions = {readonly token?: string; readonly tokenSource?: EngineTokenSource}

export type FakeEngine = {
  readonly apiBase: string
  readonly directory: string
  readonly connection: EngineConnection
  connect(options?: FakeConnectOptions): EngineConnection
  reply(...replies: FakeReply[]): void
  gate(): FakeGate
  outside(agent?: FakeOutsideAgent): FakeOutside
  synthetic(sessionId: string, notice: FakeSynthetic): Promise<void>
  setBundles(bundles: readonly FakeBundle[]): void
  emit(type: `rpc.${string}`, data: Record<string, unknown>): void
  drop(): void
  recover(): void
  reconnect(): void
  stale(reading: FakeEngineReading): void
  version(version: string | null): void
  loginCode(): string
  revokeBrowsers(): void
  sent(): readonly FakeSend[]
  drafts(): readonly DraftRow[]
  unanswered(): readonly string[]
  dispose(): void
}
