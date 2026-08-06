import {randomUUID} from 'node:crypto'
import {
  InMemoryRunStore,
  memoryStream,
  toolDefinition,
  type AnyTool,
  type RunStore,
  type ServerTool,
  type StreamDurability,
} from '@tanstack/ai'
import {RunController, type SandboxDefinition} from '@tanstack/ai-sandbox'
import {z} from 'zod'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import type {ConcivDb} from '@conciv/db'
import type {CodeCapability} from './capabilities.js'
import {FIRST_CHUNK_TIMEOUT_MS, READER_FIRST_APPEND_GRACE_MS} from './run-timing.js'
import type {AskRegistry} from './ask.js'
import type {AttachmentExpanders} from './run.js'
import type {LiveRuns} from './live-runs.js'
import type {SessionStreams} from './subscribe.js'
import type {SnapshotCache} from './transcript.js'

export type ChatDeps = {
  cwd: string
  stateRoot: string
  basePath: string
  systemText: string
  claudeHome?: string
  harness: HarnessAdapter
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  sandbox: SandboxDefinition
  db: ConcivDb
  asks: AskRegistry
  durability: (runId: string) => StreamDurability
  runControl: RunController
  runs: RunStore
  claimStartedAt: () => number
  liveRuns: LiveRuns
  stream: SessionStreams
  snapshots: SnapshotCache
  risky: ReadonlySet<string>
  mutatingToolCall: (toolName: string, input: unknown) => boolean
  commandAllows: () => readonly string[]
  tools: (sessionId: string) => AnyTool[]
  toolNames: ReadonlySet<string>
  codeModeCapabilities: (sessionId: string) => CodeCapability[]
  attachmentExpanders: AttachmentExpanders
  onRunStart?: (sessionId: string) => void
  onRunEnd?: (sessionId: string) => Promise<void>
  firstChunkTimeoutMs?: number
}

export type ChatEnv = {Variables: {chat: ChatDeps}}

const CLAIM_STEP_MS = 2 ** -10

export function makeRunControl(firstChunkTimeoutMs?: number): {
  claimStartedAt: () => number
  durability: (runId: string) => StreamDurability
  runControl: RunController
  runs: RunStore
} {
  const firstChunkDeadlineMs = (firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS) + READER_FIRST_APPEND_GRACE_MS
  const instanceKey = randomUUID()
  const durability = (runId: string): StreamDurability =>
    memoryStream({runId: `${instanceKey}:${runId}`}, {firstChunkDeadlineMs})
  const runs = new InMemoryRunStore()
  let lastStartedAt = 0
  const claimStartedAt = (): number => {
    lastStartedAt = Math.max(Date.now(), lastStartedAt + CLAIM_STEP_MS)
    return lastStartedAt
  }
  return {claimStartedAt, durability, runControl: new RunController({runs, durability}), runs}
}

type Registrable = {name: string; description: string; inputSchema: z.ZodObject<z.ZodRawShape>}

export type ToolRunContext = {emitCustomEvent?: (eventName: string, value: Record<string, unknown>) => void}

type ToolRun = (args: unknown, context?: ToolRunContext) => Promise<unknown>

export function toChatTool(
  tool: Registrable,
  run: ToolRun,
  opts?: {lazy?: boolean},
): ServerTool<z.ZodObject<z.ZodRawShape>, z.ZodUnknown> {
  return toolDefinition({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: z.unknown(),
    lazy: opts?.lazy,
  }).server(run)
}

export function buildChatTools(
  makeCtx: (sessionId: string) => ConcivToolContext,
  extensionTools: ExtensionServerTool[],
  sessionModel: (sessionId: string) => string | null,
): (sessionId: string) => AnyTool[] {
  return (sessionId) => {
    const ctx = makeCtx(sessionId)
    const request: ToolRequest = {sessionId, model: sessionModel(sessionId)}
    return [
      ...concivTools(ctx).map((tool) => toChatTool(tool, (args) => tool.execute(args))),
      ...extensionTools.map((tool) => toChatTool(tool, (args) => tool.execute(args, request), {lazy: true})),
    ]
  }
}
