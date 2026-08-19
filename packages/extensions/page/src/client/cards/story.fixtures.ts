import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCaptureView} from '@conciv/protocol/element-capture-types'
import type {ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
export const STORY_FRAME_CLASS =
  'chat-theme-terminal p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

export const storyAddResult = INERT_ADD_RESULT

export function storyCtx(
  entries: Record<string, ToolViewMeta>,
  captures?: Record<string, ToolCaptureView>,
): ToolViewCtx {
  const catalog: ToolCatalogView = {loaded: () => true, meta: (name) => entries[name]}
  return {...INERT_TOOL_CTX, catalog, captureFor: (toolCallId) => captures?.[toolCallId]}
}

export function storyPart(
  name: string,
  input: Record<string, unknown>,
  state: ToolCallPart['state'] = 'complete',
  id = 's1',
): ToolCallPart {
  return {type: 'tool-call', id, name, arguments: JSON.stringify(input), input, state}
}

export function storyResult(
  payload: unknown,
  state: ToolResultPart['state'] = 'complete',
  toolCallId = 's1',
): ToolResultPart {
  return {type: 'tool-result', toolCallId, content: JSON.stringify(payload), state}
}

export function storyErrorResult(message: string, toolCallId = 's1'): ToolResultPart {
  return {type: 'tool-result', toolCallId, content: JSON.stringify({message}), state: 'error', error: message}
}
