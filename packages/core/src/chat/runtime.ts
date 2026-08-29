import {randomUUID} from 'node:crypto'
import {memoryStream, type RunStore, type StreamDurability} from '@tanstack/ai'
import {RunController, type SandboxDefinition} from '@tanstack/ai-sandbox'
import type {UIMessage} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {createRunStore, type ConcivDb} from '@conciv/db'
import type {CodeCapability} from './capabilities.js'
import {FIRST_CHUNK_TIMEOUT_MS, READER_FIRST_APPEND_GRACE_MS} from './run-timing.js'
import type {AskRegistry} from './ask.js'
import type {CommandMemory} from './command-memory.js'
import type {AttachmentExpanders} from './run.js'
import {createRunDrivers, type RunDrivers} from './run-drivers.js'
import {createSessionLocks, type SessionLocks} from './session-locks.js'
import type {SessionStreams} from './subscribe.js'
import type {SessionId} from '@conciv/protocol/chat-types'

export type ChatDeps = {
  cwd: string
  stateRoot: string
  basePath: string
  systemText: string
  claudeHome?: string
  harness: HarnessAdapter
  harnessEnv?: (sessionId?: SessionId) => NodeJS.ProcessEnv
  sandbox: SandboxDefinition
  db: ConcivDb
  asks: AskRegistry
  commandMemory: CommandMemory
  durability: (runId: string) => StreamDurability
  runControl: RunController
  runs: RunStore
  claimStartedAt: () => number
  runDrivers: RunDrivers
  sessionLocks: SessionLocks
  stream: SessionStreams
  snapshot: (sessionId: SessionId) => Promise<UIMessage[]>
  risky: ReadonlySet<string>
  commandAllows: () => readonly string[]
  toolNames: ReadonlySet<string>
  codeModeCapabilities: (sessionId: SessionId) => CodeCapability[]
  attachmentExpanders: AttachmentExpanders
  onRunStart?: (sessionId: SessionId) => void
  onRunEnd?: (sessionId: SessionId) => Promise<void>
  firstChunkTimeoutMs?: number
}

export type ChatEnv = {Variables: {chat: ChatDeps}}

const CLAIM_STEP_MS = 2 ** -10

export function makeRunControl(
  db: ConcivDb,
  firstChunkTimeoutMs?: number,
): {
  claimStartedAt: () => number
  durability: (runId: string) => StreamDurability
  runControl: RunController
  runDrivers: RunDrivers
  runs: RunStore
  sessionLocks: SessionLocks
} {
  const firstChunkDeadlineMs = (firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS) + READER_FIRST_APPEND_GRACE_MS
  const instanceKey = randomUUID()
  const durability = (runId: string): StreamDurability =>
    memoryStream({runId: `${instanceKey}:${runId}`}, {firstChunkDeadlineMs})
  const runs = createRunStore(db)
  let lastStartedAt = 0
  const claimStartedAt = (): number => {
    lastStartedAt = Math.max(Date.now(), lastStartedAt + CLAIM_STEP_MS)
    return lastStartedAt
  }
  return {
    claimStartedAt,
    durability,
    runControl: new RunController({runs, durability}),
    runDrivers: createRunDrivers(),
    runs,
    sessionLocks: createSessionLocks(),
  }
}

export type ToolRunContext = {
  toolCallId?: string
  emitCustomEvent?: (eventName: string, value: Record<string, unknown>) => void
}
