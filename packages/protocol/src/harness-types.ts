import type {Readable, Writable} from 'node:stream'
import type {StreamChunk, UIMessage} from '@tanstack/ai'
import type {UsageSnapshot} from './usage-types.js'

// A harness is the underlying coding agent CLI (claude, codex, …). Core resolves a
// HarnessAdapter and feature-detects by capability, degrading gracefully when one is absent.

export type HarnessCapabilities = {
  resume: boolean
  permissionGate: 'hook' | 'callback' | 'none'
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

// "Open in <harness>": reopen a chat session as the harness's own interactive CLI in a terminal.
// Core owns the open logic (OS detection, cwd, shell quoting, spawning) and hands it to the harness
// via the context's open* methods; the harness only builds the interactive argv.
export type HarnessLaunchResult = {opened: boolean; command: string}
export type HarnessLaunchContext = {
  cwd: string
  sessionId: string | null
  model: string | null // the model the widget currently has selected, mirrored from the chat turn
  mcpUrl: string | null // the mandarax MCP-over-HTTP endpoint, for tool parity (null if not http-capable)
  // Run `argv` in an interactive terminal at cwd. Core shell-quotes it, prepends `cd`, spawns the
  // per-OS terminal, and returns {opened, command} — command is the resolved paste-able fallback.
  openTerminal(argv: string[]): Promise<HarnessLaunchResult>
  openUrl(url: string): Promise<HarnessLaunchResult>
}
export type HarnessLaunch = (ctx: HarnessLaunchContext) => HarnessLaunchResult | Promise<HarnessLaunchResult>

// Builds the CLI argv for one turn.
export type HarnessArgsBuilder = (turn: HarnessTurn) => string[]

// In-process turn runner (SDK transport): core branches to this in place of buildArgs/spawn/decode.
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

// One enumerated session from a harness's transcript store (for the session selector list). The
// enrichment fields (gathered when cheap) are joined onto selector rows / persisted onto the record.
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

// Where a harness persists a session's transcript, and how to parse it into UIMessages.
export type HarnessHistory = {
  transcriptPath(cwd: string, sessionId: string): string
  parse(raw: string): UIMessage[]
  // Optional human-readable session name derived from the transcript (e.g. claude's `summary`
  // record). Harnesses that omit it fall back to a short id in the UI.
  nameFromTranscript?(raw: string): string | null
  // Enumerate the cwd's sessions, newest first, bounded. `home` is injectable for testing. Optional
  // so a transcript adapter without enumeration still typechecks (the selector just stays empty).
  list?(cwd: string, home?: string): HarnessSessionMeta[] | Promise<HarnessSessionMeta[]>
}

type HarnessAdapterBase = {
  id: string
  binName: string
  // Human label for "Open in <displayName>" and other UI; falls back to id when absent.
  displayName?: string
  // How to reopen a session as this harness's interactive CLI. Absent → "open in <harness>" is
  // unavailable (core reports unsupported, the widget hides the button).
  launch?: HarnessLaunch
  buildArgs: HarnessArgsBuilder
  // Builds the argv for a compaction turn. Present iff capabilities.compaction (enforced by the
  // adapter union below), mirroring how transcriptHistory enforces `history`.
  buildCompactArgs?: HarnessArgsBuilder
  decode: HarnessDecoder
  deliverInput?: HarnessDeliverInput
  run?: HarnessRun
  shutdown?: () => void | Promise<void>
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
