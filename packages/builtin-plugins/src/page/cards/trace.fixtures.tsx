import type {JSX} from 'solid-js'
import {Trace, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {StoryTool, type StoryCall} from './story.fixtures.js'

const TRACE_FRAME_CLASS = 'p-4 w-[28rem] [background:var(--chat-panel)] [font-family:var(--chat-font)]'

export function traceRow(call: StoryCall): TraceItem {
  return {key: call.id, render: () => <StoryTool call={{...call, defaultOpen: call.status !== 'error'}} />}
}

export function traceGallery(summary: string, items: TraceItem[]): JSX.Element {
  return (
    <div class={TRACE_FRAME_CLASS}>
      <Trace summary={summary} compactLine={summary} items={items} defaultOpen />
    </div>
  )
}
