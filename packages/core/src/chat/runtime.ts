import type {AnyTool} from '@tanstack/ai'
import type {SandboxDefinition} from '@tanstack/ai-sandbox'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {ConcivDb} from '@conciv/db'
import type {Changes} from './changes.js'

export type ChatDeps = {
  cwd: string
  stateRoot: string
  systemText: string
  claudeHome?: string
  harness: HarnessAdapter
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  sandbox: SandboxDefinition
  db: ConcivDb
  changes: Changes
  risky: ReadonlySet<string>
  tools: (sessionId: string) => AnyTool[]
  onRunStart?: (sessionId: string) => void
  onRunEnd?: (sessionId: string) => Promise<void>
}

export type ChatEnv = {Variables: {chat: ChatDeps}}
