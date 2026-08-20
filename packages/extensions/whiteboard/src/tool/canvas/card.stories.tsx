import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {Trace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {storyCtx, storyPart, storyResult, storyResultParts, TRACE_FRAME_CLASS, traceTools} from '../story.fixtures.js'

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

const meta: Meta = {title: 'Extensions/Whiteboard/tool/canvas/CanvasOpCard'}
export default meta
type Story = StoryObj

const PREVIEW_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAqElEQVR4nO3QAQkAIADAMNMZzJyGsYXCHTzA2Zhr60Lj+cEngQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnQr0KBbgQbdCjToVqBBtwINuhVo0K1Ag24FGnSrA0kMiZS1pDTBAAAAAElFTkSuQmCC'

export const Read: Story = {
  render: () =>
    traceFrame('1 read', [
      traceRow(
        storyPart('canvas.read', {scope: 'draft'}),
        storyResult({
          scope: 'draft',
          elements: [
            {type: 'rectangle', x: 20, y: 40, width: 120, height: 60},
            {type: 'rectangle', x: 180, y: 40, width: 120, height: 60},
            {type: 'text', x: 24, y: 48, width: 60, height: 20},
            {type: 'arrow', x: 140, y: 70, width: 40, height: 4},
          ],
        }),
      ),
    ]),
}

export const Svg: Story = {
  render: () =>
    traceFrame('1 draw', [
      traceRow(
        storyPart('canvas.svg', {
          svg: '<path d="M10 10 L90 10 L50 90 Z" fill="#c9857f"/>',
          x: 0,
          y: 0,
          width: 100,
        }),
        storyResult({pending: 'p_1'}),
      ),
    ]),
}

export const Diagram: Story = {
  render: () =>
    traceFrame('1 draw', [
      traceRow(
        storyPart('canvas.diagram', {mermaid: 'flowchart LR\n  Draft --> Preview --> Commit'}),
        storyResult({pending: 'p_2'}),
      ),
    ]),
}

export const PreviewImage: Story = {
  render: () =>
    traceFrame('1 preview', [
      traceRow(
        storyPart('canvas.preview', {}),
        storyResultParts([
          {type: 'image', source: {type: 'data', value: PREVIEW_PNG, mimeType: 'image/png'}},
          {type: 'text', content: JSON.stringify({elements: 4})},
        ]),
      ),
    ]),
}

export const PreviewEmpty: Story = {
  render: () =>
    traceFrame('1 preview', [
      traceRow(storyPart('canvas.preview', {}), storyResult({empty: true, reason: 'draft has no elements yet'})),
    ]),
}

export const DeleteConfirmed: Story = {
  render: () =>
    traceFrame('1 delete', [traceRow(storyPart('canvas.delete', {elementId: 'el_1'}), storyResult({deleted: 'el_1'}))]),
}

export const CommitFailed: Story = {
  render: () =>
    traceFrame('1 commit', [
      traceRow(storyPart('canvas.commit', {}), storyResult({committed: false, reason: 'no draft to commit'})),
    ]),
}

export const ExportFailed: Story = {
  render: () =>
    traceFrame('1 failed', [
      traceRow(
        storyPart('canvas.preview', {}),
        storyResult({error: 'preview render failed', reason: 'no renderer', elements: 4}),
      ),
    ]),
}

export const RunningOp: Story = {
  render: () => traceFrame('1 running', [traceRow(storyPart('canvas.draw', {}, 'input-complete'), undefined)]),
}
