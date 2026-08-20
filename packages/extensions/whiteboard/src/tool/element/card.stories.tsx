import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {Trace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {storyCtx, storyPart, storyResult, TRACE_FRAME_CLASS, traceTools} from '../story.fixtures.js'

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

const meta: Meta = {title: 'Extensions/Whiteboard/tool/element/ElementReferenceCard'}
export default meta
type Story = StoryObj

export const Found: Story = {
  render: () =>
    traceFrame('1 reference', [
      traceRow(
        storyPart('element.reference', {file: 'src/panel/session-panel.tsx', component: 'SessionPanel'}),
        storyResult({found: true, file: 'src/panel/session-panel.tsx', line: 42, column: 3}),
      ),
    ]),
}

export const NotFound: Story = {
  render: () =>
    traceFrame('1 reference', [
      traceRow(
        storyPart('element.reference', {file: 'src/panel/session-panel.tsx', component: 'MissingWidget'}),
        storyResult({found: false}),
      ),
    ]),
}
