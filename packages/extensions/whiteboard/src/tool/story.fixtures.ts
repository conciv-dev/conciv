import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
export const STORY_FRAME_CLASS =
  'chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

export const storyAddResult = INERT_ADD_RESULT

export function storyCtx(): ToolViewCtx {
  const catalog: ToolCatalogView = {loaded: () => true, meta: () => undefined}
  return {...INERT_TOOL_CTX, catalog}
}

export function storyPart(
  name: string,
  input: Record<string, unknown>,
  state: ToolCallPart['state'] = 'complete',
): ToolCallPart {
  return {type: 'tool-call', id: 's1', name, arguments: JSON.stringify(input), input, state}
}

export function storyResultParts(parts: unknown[], state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 's1', content: JSON.stringify(parts), state}
}

export function storyResult(payload: unknown, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 's1', content: JSON.stringify(payload), state}
}
