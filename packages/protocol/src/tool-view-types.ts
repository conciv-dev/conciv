import type {Component} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolIconKey, ToolLabel} from './tool-icon-types.js'

export type ToolAccent = 'page' | 'code' | 'test' | 'read' | 'neutral'

export type ToolViewError = {code: string; message: string}

export type ToolViewMeta = {
  summary: string
  category?: string
  hint?: string
  positional?: string
  icon?: ToolIconKey
  label?: ToolLabel
  mutating: boolean
  mirrors: boolean
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
  apiBase: string
  harnessId: string
  sendMessage: (text: string) => void
  catalog: ToolCatalogView

  respondApproval?: (approvalId: string, approved: boolean) => void
  durationFor?: (toolCallId: string) => number | undefined
}

export type ToolCardProps = {
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolViewCtx
  durationMs?: number
}

export type ToolRenderResultOptions = {expanded: boolean; isPartial: boolean}

export type ToolRenderContext<TArgs = unknown> = ToolViewCtx & {
  args: TArgs
  part: ToolCallPart
  toolCallId: string
  durationMs?: number
  expanded: boolean
  isPartial: boolean
  isError: boolean
}

export type ToolUIComponent = Component<ToolCardProps>
export type ToolCardEntry = {names: string[]; render: ToolUIComponent; streamTitle?: string}
