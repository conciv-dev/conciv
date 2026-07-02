import type {Component} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

export type ToolAccent = 'page' | 'code' | 'test' | 'read' | 'neutral'

export type ToolViewCtx = {
  apiBase: string
  harnessId: string
  sendMessage: (text: string) => void

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
