import type {ToolCallPart, ToolResultPart} from './chat-message-types.js'
import type {PermissionReply} from './chat-types.js'
import type {UiAnswerValue} from './ui-types.js'

export type ToolViewError = {code: string; message: string}

export type ToolViewMeta = {
  summary: string
  category?: string
  hint?: string
  positional?: string
  mutating: boolean
  approval?: 'ask'
  inputSchema?: unknown
  outputSchema?: unknown
  errors?: readonly ToolViewError[]
}

export type ToolCatalogView = {
  loaded: () => boolean
  meta: (name: string) => ToolViewMeta | undefined
}

export const INERT_TOOL_CATALOG: ToolCatalogView = {loaded: () => true, meta: () => undefined}

export type ToolViewCtx = {
  catalog: ToolCatalogView
  addResult: (toolCallId: string, value: UiAnswerValue) => Promise<void>

  respondApproval?: (approvalId: string, reply: PermissionReply) => void
}

export type ToolCardProps = {
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolViewCtx
  addResult: (value: UiAnswerValue) => Promise<void>
  durationMs?: number
}
