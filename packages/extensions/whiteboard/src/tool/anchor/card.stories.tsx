import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {Trace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {storyCtx, storyErrorResult, storyPart, storyResult, TRACE_FRAME_CLASS, traceTools} from '../story.fixtures.js'

function traceFrame(summary: string, items: TraceItem[]): JSX.Element {
  return (
    <div class={TRACE_FRAME_CLASS}>
      <Trace summary={summary} compactLine={summary} items={items} defaultOpen />
    </div>
  )
}

function traceRow(part: ToolCallPart, result: ToolResultPart | undefined): TraceItem {
  return {
    key: part.id,
    render: (branch) => (
      <ToolTraceRow part={part} result={result} ctx={storyCtx()} tools={traceTools} ring={branch.ring} />
    ),
  }
}

const meta: Meta = {title: 'Extensions/Whiteboard/tool/anchor/AnchorResolveCard'}
export default meta
type Story = StoryObj

export const Fresh: Story = {
  render: () =>
    traceFrame('1 resolve', [traceRow(storyPart('anchor_resolve', {cid: 'c_1'}), storyResult({status: 'fresh'}))]),
}

export const Drifted: Story = {
  render: () =>
    traceFrame('1 resolve', [
      traceRow(
        storyPart('anchor_resolve', {cid: 'c_2'}),
        storyResult({
          status: 'drifted',
          diff: {before: 'export function SessionPanel() {', after: 'export function SessionPanel(props) {'},
        }),
      ),
    ]),
}

export const NotFound: Story = {
  render: () =>
    traceFrame('1 failed', [
      traceRow(storyPart('anchor_resolve', {cid: 'c_9'}), storyErrorResult('comment c_9 not found')),
    ]),
}
