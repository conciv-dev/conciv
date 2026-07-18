import {toolDefinition, type AnyTool} from '@tanstack/ai'
import type {SandboxDefinition} from '@tanstack/ai-sandbox'
import type {z} from 'zod'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import type {ConcivDb} from '@conciv/db'
import type {Changes} from './attach.js'
import type {AttachmentExpanders} from './run.js'

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
  attachmentExpanders: AttachmentExpanders
  onRunStart?: (sessionId: string) => void
  onRunEnd?: (sessionId: string) => Promise<void>
  firstChunkTimeoutMs?: number
}

export type ChatEnv = {Variables: {chat: ChatDeps}}

type Registrable = {name: string; description: string; inputSchema: z.ZodObject<z.ZodRawShape>}

type ToolRun = (args: unknown) => Promise<unknown>

export function toChatTool(tool: Registrable, run: ToolRun): AnyTool {
  return toolDefinition({name: tool.name, description: tool.description, inputSchema: tool.inputSchema}).server(run)
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
      ...extensionTools.map((tool) => toChatTool(tool, (args) => tool.execute(args, request))),
    ]
  }
}
