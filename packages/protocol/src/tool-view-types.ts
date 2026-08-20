import type {Component} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolIconKey, ToolLabel} from './tool-icon-types.js'
import type {ToolCaptureView} from './element-capture-types.js'
import type {UiAnswerValue} from './ui-types.js'

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
  addResult: (toolCallId: string, value: UiAnswerValue) => void
  dismissUi?: (toolCallId: string) => void

  respondApproval?: (approvalId: string, approved: boolean) => void
  durationFor?: (toolCallId: string) => number | undefined
  captureFor?: (toolCallId: string) => ToolCaptureView | undefined
}

export type ToolCardProps = {
  part: ToolCallPart
  result: ToolResultPart | undefined
  ctx: ToolViewCtx
  addResult: (value: UiAnswerValue) => void
  durationMs?: number
  capture?: ToolCaptureView
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
export type ToolCardEntry = {
  names: string[]
  render: ToolUIComponent
  streamTitle?: string
  display?: 'standalone'
}
