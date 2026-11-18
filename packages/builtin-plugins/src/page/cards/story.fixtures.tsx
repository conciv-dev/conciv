import type {JSX} from 'solid-js'
import type {ToolProps} from '@conciv/plugin/experimental'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {ToolCaptureView} from '@conciv/protocol/element-capture-types'
import {ToolDisplay} from '@conciv/ui-kit-chat/tools'
import {CaptureContext} from '../session-captures.js'
import {pageToolCards} from './page-tool-cards.js'

export const STORY_FRAME_CLASS = 'p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

export type StoryCall = ToolProps & {id: string}

export function storyCall(tool: string, input: Record<string, unknown>, payload?: unknown, id = 's1'): StoryCall {
  if (payload === undefined) return {id, tool, input, metadata: {}, status: 'running'}
  return {id, tool, input, metadata: {}, status: 'completed', output: JSON.stringify(payload)}
}

export function storyFailedCall(tool: string, input: Record<string, unknown>, error: string, id = 's1'): StoryCall {
  return {id, tool, input, metadata: {}, status: 'error', error}
}

function pageCard(name: string) {
  return {render: pageToolCards.find((entry) => entry.tools.includes(name))?.card}
}

export function StoryTool(props: {call: StoryCall; captures?: Record<string, ToolCaptureView>}): JSX.Element {
  const lookup = (toolCallId: string) => props.captures?.[toolCallId]
  return (
    <CaptureContext.Provider value={lookup}>
      <ToolDisplay {...props.call} render={pageCard} />
    </CaptureContext.Provider>
  )
}

export function storyCaptures(
  captures: Record<string, ToolCaptureView>,
): (toolCallId: string) => ToolCaptureView | undefined {
  return (toolCallId) => captures[toolCallId]
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
