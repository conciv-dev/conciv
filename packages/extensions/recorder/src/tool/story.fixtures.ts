import type {ToolCardProps, ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'

type ToolCallPart = ToolCardProps['part']
type ToolResultPart = NonNullable<ToolCardProps['result']>
export const STORY_FRAME_CLASS =
  'chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

export const storyAddResult = INERT_ADD_RESULT

export function storyCtx(entries: Record<string, ToolViewMeta>): ToolViewCtx {
  const catalog: ToolCatalogView = {loaded: () => true, meta: (name) => entries[name]}
  return {...INERT_TOOL_CTX, catalog}
}

export function storyPart(
  name: string,
  input: Record<string, unknown>,
  state: ToolCallPart['state'] = 'complete',
): ToolCallPart {
  return {type: 'tool-call', id: 's1', name, arguments: JSON.stringify(input), input, state}
}

export function storyResult(payload: unknown, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 's1', content: JSON.stringify(payload), state}
}
