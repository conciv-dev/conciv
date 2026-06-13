import type {Readable} from 'node:stream'
import type {StreamChunk, UIMessage} from '@tanstack/ai'

// Harness adapter contract. A harness is the underlying coding agent CLI (claude, codex, …).
// Core resolves a HarnessAdapter and feature-detects by capability, degrading gracefully
// when a harness lacks resume / a permission gate / transcript history / a system-prompt flag.

export type HarnessCapabilities = {
  resume: boolean // can --resume a prior session
  permissionGate: 'hook' | 'none' // can call back mid-turn for tool approval
  transcriptHistory: boolean // can hydrate prior turns from disk
  systemPrompt: 'file' | 'flag' | 'none'
}

export type HarnessTurn = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  systemPrompt: string
  permissionUrl?: string // provided by core iff permissionGate === 'hook'
}

export type HarnessChild = {pid: number; stdout: Readable; stderr: Readable; kill(): void}

// Argv builder as its own named interface — maps a HarnessTurn to the CLI's argument vector.
export type HarnessArgsBuilder = (turn: HarnessTurn) => string[]

export function defineHarnessArgs<T extends HarnessArgsBuilder>(build: T): T {
  return build
}

// Output decoder as its own named interface — turns the harness's raw stdout lines into the
// AG-UI StreamChunk stream the widget speaks, surfacing the session id as it appears.
export type HarnessDecoder = (
  lines: AsyncIterable<string>,
  opts: {onSessionId(id: string): void},
) => AsyncGenerator<StreamChunk>

export function defineHarnessDecoder<T extends HarnessDecoder>(decode: T): T {
  return decode
}

// Transcript-history capability as its own interface. A harness that persists sessions to disk
// implements this so core can hydrate prior turns: `transcriptPath` says where the JSONL lives,
// `parse` turns that raw transcript into human-readable UIMessages. Grouped (not two stray
// optional methods) so the contract is cohesive and every history-capable harness implements
// exactly this shape.
export type HarnessHistory = {
  transcriptPath(cwd: string, sessionId: string): string
  parse(raw: string): UIMessage[]
}

export type HarnessAdapter = {
  id: string // 'claude' | 'codex' | …
  binName: string // default binary on PATH
  capabilities: HarnessCapabilities
  buildArgs: HarnessArgsBuilder
  decode: HarnessDecoder
  history?: HarnessHistory // present iff capabilities.transcriptHistory
}

// Generic typed factory for a HarnessHistory implementation (every interface gets a define*).
export function defineHarnessHistory<T extends HarnessHistory>(history: T): T {
  return history
}

// Generic typed factory: every harness adapter is authored through this helper (never a bare
// object literal), so the contract is enforced + inferred, not hand-typed. <T extends
// HarnessAdapter> preserves the adapter's exact literal type (no widening). Dev-time invariant:
// declared capabilities must match the provided members.
export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  if (adapter.capabilities.transcriptHistory && !adapter.history) {
    throw new Error(`harness "${adapter.id}": transcriptHistory requires a history implementation`)
  }
  return adapter
}
