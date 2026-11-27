import type {JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@conciv/types/chat-message-types'
import type {ElementCapture, ToolCaptureView} from './element-capture-types.js'
import type {ToolProps} from '@conciv/frontend-plugin-api'
import {ToolDisplay, Trace, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {pageToolCards} from './cards.js'

export type StoryCall = ToolProps & {id: string}

const TRACE_FRAME_CLASS = 'p-4 w-[28rem] [background:var(--chat-panel)] [font-family:var(--chat-font)]'

export const STORY_FRAME_CLASS = 'p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

export const SESSION_STAGE_CLASS = 'p-4 w-[40rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]'

export const SESSION_STAGE_ROOT_CLASS = 'flex w-full'

export const SESSION_STAGE_PANEL_CLASS = 'min-w-0'

export const SESSION_STAGE_RESIZE_TRIGGER_CLASS =
  'flex items-center justify-center w-4 shrink-0 cursor-col-resize [background:transparent] [border:none] p-0 rounded-chat-sm focus-visible:[outline:0.125rem_solid_var(--chat-accent)]'

export const SESSION_STAGE_RESIZE_INDICATOR_CLASS =
  'w-1 h-8 rounded-[var(--chat-radius-pill)] [background:var(--chat-line)]'

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

export const ELEMENT_CAPTURE_FIXTURE_CSS =
  'html { padding: 0px; margin: 0px; }body { padding: 0px; margin: 0px; min-height: 100vh; }\n.capture-form { font-family: sans-serif; padding: 12px; background: rgb(245, 245, 247); }.capture-form .cta { background: rgb(37, 99, 235); color: white; border-width: medium; border-style: none; border-color: currentcolor; border-image: initial; border-radius: 6px; padding: 8px 16px; font-weight: 600; }.capture-form input { border: 1px solid rgb(209, 213, 219); border-radius: 4px; padding: 6px 10px; }'

export const ELEMENT_CAPTURE_FIXTURE_FULL: ElementCapture = {
  kind: 'after',
  ts: 1786232403193,
  descriptor: {
    tagName: 'input',
    role: 'textbox',
    accessibleName: 'Email',
    value: 'ada@example.com',
    rect: {x: 175.875, y: 13, width: 167, height: 29},
    selectorPath: 'input#email',
  },
  node: {
    type: 2,
    tagName: 'html',
    attributes: {lang: 'en'},
    childNodes: [
      {
        type: 2,
        tagName: 'body',
        attributes: {},
        childNodes: [
          {
            type: 2,
            tagName: 'div',
            attributes: {class: 'capture-form'},
            childNodes: [
              {
                type: 2,
                tagName: 'section',
                attributes: {id: 'panel'},
                childNodes: [
                  {
                    type: 2,
                    tagName: 'input',
                    attributes: {id: 'email', type: 'text', value: 'ada@example.com', 'data-rr-target': 'true'},
                    childNodes: [],
                    id: 1,
                  },
                ],
                id: 2,
              },
            ],
            id: 3,
          },
        ],
        id: 4,
      },
    ],
    id: 5,
  },
  cssBundleId: 'css18rhxa7dr',
}
