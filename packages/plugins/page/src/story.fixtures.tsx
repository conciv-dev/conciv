import type {JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {ToolCaptureView} from '@conciv/protocol/element-capture-types'
import type {ToolProps} from '@conciv/plugin/experimental'
import {ToolDisplay, Trace, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {pageToolCards} from './cards.js'

export type StoryCall = ToolProps & {id: string}

const TRACE_FRAME_CLASS = 'p-4 w-[28rem] [background:var(--chat-panel)] [font-family:var(--chat-font)]'

export const STORY_FRAME_CLASS = 'p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

function pageCard(name: string) {
  return {render: pageToolCards.find((entry) => entry.tools.includes(name))?.card}
}

export function StoryTool(props: {call: StoryCall}): JSX.Element {
  return <ToolDisplay {...props.call} render={pageCard} />
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

export function traceRow(call: StoryCall): TraceItem {
  return {key: call.id, render: () => <StoryTool call={{...call, defaultOpen: call.status !== 'error'}} />}
}

export function storyCall(tool: string, input: Record<string, unknown>, payload?: unknown, id = 's1'): StoryCall {
  if (payload === undefined) return {id, tool, input, metadata: {}, status: 'running'}
  return {id, tool, input, metadata: {}, status: 'completed', output: JSON.stringify(payload)}
}

export function storyFailedCall(tool: string, input: Record<string, unknown>, error: string, id = 's1'): StoryCall {
  return {id, tool, input, metadata: {}, status: 'error', error}
}

export function traceGallery(summary: string, items: TraceItem[]): JSX.Element {
  return (
    <div class={TRACE_FRAME_CLASS}>
      <Trace summary={summary} compactLine={summary} items={items} defaultOpen />
    </div>
  )
}
