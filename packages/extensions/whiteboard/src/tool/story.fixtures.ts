import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {whiteboardToolClients} from './client.js'

type ToolCallPartState = ToolCallPart['state']
type ToolResultPartState = ToolResultPart['state']

export const STORY_FRAME_CLASS = 'p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

export const TRACE_FRAME_CLASS =
  'p-4 max-w-[28rem] w-full [background:var(--chat-panel)] [font-family:var(--chat-font)]'

export const storyAddResult = INERT_ADD_RESULT

export function storyCtx(): ToolViewCtx {
  const catalog: ToolCatalogView = {loaded: () => true, meta: () => undefined}
  return {...INERT_TOOL_CTX, catalog}
}

export function storyPart(
  name: string,
  input: Record<string, unknown>,
  state: ToolCallPartState = 'complete',
): ToolCallPart {
  return {type: 'tool-call', id: 's1', name, arguments: JSON.stringify(input), input, state}
}

export function storyResultParts(parts: unknown[], state: ToolResultPartState = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 's1', content: JSON.stringify(parts), state}
}

export function storyResult(payload: unknown, state: ToolResultPartState = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 's1', content: JSON.stringify(payload), state}
}

export function storyErrorResult(message: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 's1', content: message, state: 'error'}
}

export function traceTools(): ToolCardEntry[] {
  return whiteboardToolClients.flatMap((tool) =>
    tool.__render
      ? [{names: [tool.name], render: tool.__render.render, hasEmbeddedBody: tool.__render.hasEmbeddedBody}]
      : [],
  )
}
