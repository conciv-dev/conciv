import type {Readable, Writable} from 'node:stream'
import type {StreamChunk, UIMessage} from '@tanstack/ai'

// A harness is the underlying coding agent CLI (claude, codex, …). Core resolves a
// HarnessAdapter and feature-detects by capability, degrading gracefully when one is absent.

export type HarnessCapabilities = {
  resume: boolean
  permissionGate: 'hook' | 'none'
  transcriptHistory: boolean
  systemPrompt: 'file' | 'flag' | 'none'
  mcp: 'http' | 'stdio' | 'none'
  // 'native'  → ingests image content blocks (claude: --input-format stream-json on stdin)
  // 'fileRef' → no vision channel; server writes temp files + appends path refs to the prompt
  // false     → no image support
  imageInput: 'native' | 'fileRef' | false
}

// An image content part carried from chat()'s messages to the harness (base64 data source).
export type HarnessImage = {mediaType: string; dataBase64: string}

export type HarnessTurn = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  systemPrompt: string
  permissionUrl?: string
  mcpUrl?: string
  images?: HarnessImage[]
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
  decode: HarnessDecoder
  deliverInput?: HarnessDeliverInput
}

// `history` is present iff `capabilities.transcriptHistory` — the type enforces it, so there is
// no runtime check: a transcriptHistory:true adapter without a history is a compile error.
export type HarnessAdapter = HarnessAdapterBase &
  (
    | {capabilities: HarnessCapabilities & {transcriptHistory: true}; history: HarnessHistory}
    | {capabilities: HarnessCapabilities & {transcriptHistory: false}; history?: undefined}
  )

export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  return adapter
}
