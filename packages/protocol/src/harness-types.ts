import type {Readable, Writable} from 'node:stream'
import type {StreamChunk, UIMessage} from '@tanstack/ai'
import type {UsageSnapshot} from './usage-types.js'

// A harness is the underlying coding agent CLI (claude, codex, …). Core resolves a
// HarnessAdapter and feature-detects by capability, degrading gracefully when one is absent.

export type HarnessCapabilities = {
  resume: boolean
  permissionGate: 'hook' | 'none'
  transcriptHistory: boolean
  // Native context compaction (the agent rewrites its own context to a summary, freeing the window).
  // true → the adapter must supply `buildCompactArgs` (type-enforced below). false → core falls back
  // to a summarize-prompt turn, which produces a summary but does not free the resumed context.
  compaction: boolean
  systemPrompt: 'file' | 'flag' | 'none'
  mcp: 'http' | 'stdio' | 'none'
  // 'native'  → ingests image content blocks (claude: --input-format stream-json on stdin)
  // 'fileRef' → no vision channel; server writes temp files + appends path refs to the prompt
  // false     → no image support
  imageInput: 'native' | 'fileRef' | false
}

// An image content part carried from chat()'s messages to the harness (base64 data source).
export type HarnessImage = {mediaType: string; dataBase64: string}

// A model the harness can run. `id` is what the CLI receives (e.g. claude --model <id>); `name`
// is the display label; `group` buckets the combobox by provider/family.
export type HarnessModel = {id: string; name: string; description?: string; group?: string; disabled?: boolean}

// A harness's models: either a static list or a (possibly async) resolver, so an adapter that
// can enumerate its CLI's models at runtime returns a function instead of a literal array.
export type HarnessModels = HarnessModel[] | (() => HarnessModel[] | Promise<HarnessModel[]>)

export type HarnessTurn = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  systemPrompt: string
  permissionUrl?: string
  mcpUrl?: string
  images?: HarnessImage[]
  // The selected model id, forwarded by buildArgs to the CLI's model flag. Absent → CLI default.
  model?: string
  // 'compact' → core wants this turn to compact the resumed context, not chat. The adapter's
  // buildCompactArgs builds it (only reached for compaction-capable harnesses). Default 'chat'.
  kind?: 'chat' | 'compact'
}

export type HarnessChild = {pid: number; stdout: Readable; stderr: Readable; stdin?: Writable; kill(): void}

// Builds the CLI argv for one turn.
export type HarnessArgsBuilder = (turn: HarnessTurn) => string[]

// Optional: write the turn's input to the child after spawn (e.g. claude native images →
// a stream-json user message on stdin). Harnesses that take everything via argv omit it.
export type HarnessDeliverInput = (child: HarnessChild, turn: HarnessTurn) => void | Promise<void>

// Minimal logger shape the adapter threads in (matches @tanstack/ai InternalLogger surface we use).
export type HarnessDecodeLogger = {provider(msg: string, meta?: unknown): void}

export type HarnessDecodeOpts = {
  onSessionId(id: string): void
  // Live usage as the harness learns it mid-turn (claude message_start carries full context at the
  // start of the response). Core injects it onto the stream for the widget's tracker.
  onUsage?(usage: UsageSnapshot): void
  runId?: string
  threadId?: string
  logger?: HarnessDecodeLogger
}

// Turns the harness's raw stdout lines into the AG-UI StreamChunk stream, surfacing the session id.
export type HarnessDecoder = (lines: AsyncIterable<string>, opts: HarnessDecodeOpts) => AsyncGenerator<StreamChunk>

// Where a harness persists a session's transcript, and how to parse it into UIMessages.
export type HarnessHistory = {
  transcriptPath(cwd: string, sessionId: string): string
  parse(raw: string): UIMessage[]
}

type HarnessAdapterBase = {
  id: string
  binName: string
  buildArgs: HarnessArgsBuilder
  // Builds the argv for a compaction turn. Present iff capabilities.compaction (enforced by the
  // adapter union below), mirroring how transcriptHistory enforces `history`.
  buildCompactArgs?: HarnessArgsBuilder
  decode: HarnessDecoder
  deliverInput?: HarnessDeliverInput
  // Models this harness can run + the id to pre-select. Both optional: a harness with no model
  // choice omits them and the widget hides its selector.
  models?: HarnessModels
  defaultModel?: string
}

// `history` is present iff `capabilities.transcriptHistory` and `buildCompactArgs` iff
// `capabilities.compaction` — the type enforces both, so there is no runtime check: a
// transcriptHistory:true adapter without a history (or a compaction:true adapter without
// buildCompactArgs) is a compile error.
export type HarnessAdapter = HarnessAdapterBase &
  (
    | {capabilities: HarnessCapabilities & {transcriptHistory: true}; history: HarnessHistory}
    | {capabilities: HarnessCapabilities & {transcriptHistory: false}; history?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {compaction: true}; buildCompactArgs: HarnessArgsBuilder}
    | {capabilities: HarnessCapabilities & {compaction: false}; buildCompactArgs?: undefined}
  )

export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  return adapter
}
