import {randomUUID} from 'node:crypto'
import {
  InMemoryRunStore,
  memoryStream,
  toolDefinition,
  type AnyTool,
  type ServerTool,
  type StreamDurability,
} from '@tanstack/ai'
import {RunController, type SandboxDefinition} from '@tanstack/ai-sandbox'
import {z} from 'zod'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import type {ConcivDb} from '@conciv/db'
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
  liveRuns: LiveRuns
  stream: SessionStreams
  snapshots: SnapshotCache
  risky: ReadonlySet<string>
  tools: (sessionId: string) => AnyTool[]
  toolNames: ReadonlySet<string>
  extensionServerTools: () => ExtensionServerTool[]
  attachmentExpanders: AttachmentExpanders
  onRunStart?: (sessionId: string) => void
  onRunEnd?: (sessionId: string) => Promise<void>
  firstChunkTimeoutMs?: number
}

export type ChatEnv = {Variables: {chat: ChatDeps}}

export const FIRST_CHUNK_TIMEOUT_MS = 30_000

const READER_FIRST_APPEND_GRACE_MS = 5_000

export function makeRunControl(firstChunkTimeoutMs?: number): {
  durability: (runId: string) => StreamDurability
  runControl: RunController
} {
  const firstChunkDeadlineMs = (firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS) + READER_FIRST_APPEND_GRACE_MS
  const instanceKey = randomUUID()
  const durability = (runId: string): StreamDurability =>
    memoryStream({runId: `${instanceKey}:${runId}`}, {firstChunkDeadlineMs})
  return {durability, runControl: new RunController({runs: new InMemoryRunStore(), durability})}
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
