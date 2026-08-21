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

const meta: Meta = {title: 'Extensions/Whiteboard/tool/comment/CommentOpCard'}
export default meta
type Story = StoryObj

const NOW = Date.UTC(2026, 7, 18, 14, 32)

export const CreatePreview: Story = {
  render: () =>
    traceFrame('1 comment', [
      traceRow(
        storyPart('comment.create', {
          cid: 'c_42',
          kind: 'source-linked',
          parts: [{type: 'text', text: 'This card overlaps the header on narrow widths.'}],
          x: 240,
          y: 120,
          elementId: 'el_9',
          authorKind: 'ai',
          authorModel: 'claude-sonnet-5',
        }),
        storyResult({cid: 'c_42'}),
      ),
    ]),
}

export const ListResults: Story = {
  render: () =>
    traceFrame('1 list', [
      traceRow(
        storyPart('comment.list', {scope: 'session'}),
        storyResult({
          comments: [
            {
              cid: 'c_1',
              status: 'open',
              authorKind: 'human',
              parts: [{type: 'text', text: 'Can we widen the sidebar?'}],
              anchorComponent: 'SessionPanel',
              createdAt: NOW - 6 * 60_000,
            },
            {
              cid: 'c_2',
              status: 'resolved',
              authorKind: 'ai',
              authorModel: 'claude-sonnet-5',
              parts: [{type: 'text', text: 'Widened to 480px and re-checked the wrap.'}],
              anchorFile: 'src/panel/session-panel.tsx',
              createdAt: NOW - 4 * 60_000,
            },
          ],
        }),
      ),
    ]),
}

export const ReadThread: Story = {
  render: () =>
    traceFrame('1 read', [
      traceRow(
        storyPart('comment.read', {cid: 'c_1'}),
        storyResult({
          comment: {
            cid: 'c_1',
            status: 'open',
            authorKind: 'human',
            parts: [{type: 'text', text: 'Can we widen the sidebar?'}],
            anchorComponent: 'SessionPanel',
            createdAt: NOW - 6 * 60_000,
          },
          replies: [
            {
              cid: 'c_1_r1',
              parentId: 'c_1',
              authorKind: 'ai',
              authorModel: 'claude-sonnet-5',
              parts: [{type: 'text', text: 'Widened to 480px and re-checked the wrap.'}],
              createdAt: NOW - 4 * 60_000,
            },
          ],
        }),
      ),
    ]),
}

export const ResolveConfirmed: Story = {
  render: () =>
    traceFrame('1 resolve', [
      traceRow(storyPart('comment.resolve', {cid: 'c_1'}), storyResult({cid: 'c_1', status: 'resolved'})),
    ]),
}

export const DeleteConfirmed: Story = {
  render: () =>
    traceFrame('1 delete', [
      traceRow(storyPart('comment.delete', {cid: 'c_42'}), storyResult({cid: 'c_42', deleted: true})),
    ]),
}

export const PinLocked: Story = {
  render: () =>
    traceFrame('1 pin', [
      traceRow(
        storyPart('pin.setState', {cid: 'c_42', pinState: 'locked'}),
        storyResult({cid: 'c_42', pinState: 'locked'}),
      ),
    ]),
}

export const NotFound: Story = {
  render: () =>
    traceFrame('1 failed', [
      traceRow(storyPart('comment.resolve', {cid: 'c_9'}), storyErrorResult('comment c_9 not found')),
    ]),
}
