import type {Readable} from 'node:stream'
import type {StreamChunk, UIMessage} from '@tanstack/ai'

// A harness is the underlying coding agent CLI (claude, codex, …). Core resolves a
// HarnessAdapter and feature-detects by capability, degrading gracefully when one is absent.

export type HarnessCapabilities = {
  resume: boolean
  permissionGate: 'hook' | 'none'
  transcriptHistory: boolean
  systemPrompt: 'file' | 'flag' | 'none'
}

export type HarnessTurn = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  systemPrompt: string
  permissionUrl?: string
}

export type HarnessChild = {pid: number; stdout: Readable; stderr: Readable; kill(): void}

// Builds the CLI argv for one turn.
export type HarnessArgsBuilder = (turn: HarnessTurn) => string[]

// Turns the harness's raw stdout lines into the AG-UI StreamChunk stream, surfacing the session id.
export type HarnessDecoder = (
  lines: AsyncIterable<string>,
  opts: {onSessionId(id: string): void},
) => AsyncGenerator<StreamChunk>

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
