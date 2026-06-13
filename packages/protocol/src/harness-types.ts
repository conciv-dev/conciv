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

export type HarnessAdapter = {
  id: string // 'claude' | 'codex' | …
  binName: string // default binary on PATH
  capabilities: HarnessCapabilities
  buildArgs(turn: HarnessTurn): string[]
  decode(lines: AsyncIterable<string>, opts: {onSessionId(id: string): void}): AsyncGenerator<StreamChunk>
  transcriptPath?(cwd: string, sessionId: string): string // present iff transcriptHistory
  parseHistory?(raw: string): UIMessage[] // present iff transcriptHistory
}

// Generic typed factory: every harness adapter is authored through this helper (never a bare
// object literal), so the contract is enforced + inferred, not hand-typed. <T extends
// HarnessAdapter> preserves the adapter's exact literal type (no widening). Dev-time invariant:
// declared capabilities must match the provided methods.
export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  if (adapter.capabilities.transcriptHistory && !(adapter.transcriptPath && adapter.parseHistory)) {
    throw new Error(`harness "${adapter.id}": transcriptHistory requires transcriptPath + parseHistory`)
  }
  return adapter
}
