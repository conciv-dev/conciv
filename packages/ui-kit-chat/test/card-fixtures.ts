import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {INERT_TOOL_CTX} from '../src/store/tool-context.js'

export function catalogOf(entries: Record<string, ToolViewMeta>): ToolCatalogView {
  return {loaded: () => true, meta: (name) => entries[name]}
}

export function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
  return {...INERT_TOOL_CTX, catalog}
}

export function cardPart(
  name: string,
  input: Record<string, unknown>,
  state: ToolCallPart['state'] = 'complete',
): ToolCallPart {
  return {type: 'tool-call', id: 'e1', name, arguments: JSON.stringify(input), input, state}
}

export function cardResult(content: string, state: ToolResultPart['state']): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'e1', content, state}
}
