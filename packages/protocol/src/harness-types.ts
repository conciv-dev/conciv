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

export type HarnessArgsBuilder = (turn: HarnessTurn) => string[]

export function defineHarnessArgs<T extends HarnessArgsBuilder>(build: T): T {
  return build
}

// Turns the harness's raw stdout lines into the AG-UI StreamChunk stream, surfacing the session id.
export type HarnessDecoder = (
  lines: AsyncIterable<string>,
  opts: {onSessionId(id: string): void},
) => AsyncGenerator<StreamChunk>

export function defineHarnessDecoder<T extends HarnessDecoder>(decode: T): T {
  return decode
}

// Where a harness persists a session's transcript, and how to parse it into UIMessages.
export type HarnessHistory = {
  transcriptPath(cwd: string, sessionId: string): string
  parse(raw: string): UIMessage[]
}

export function defineHarnessHistory<T extends HarnessHistory>(history: T): T {
  return history
}

export type HarnessAdapter = {
  id: string
  binName: string
  capabilities: HarnessCapabilities
  buildArgs: HarnessArgsBuilder
  decode: HarnessDecoder
  history?: HarnessHistory // present iff capabilities.transcriptHistory
}

export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  if (adapter.capabilities.transcriptHistory && !adapter.history) {
    throw new Error(`harness "${adapter.id}": transcriptHistory requires a history implementation`)
  }
  return adapter
}
