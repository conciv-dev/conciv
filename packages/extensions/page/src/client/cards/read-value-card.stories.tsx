import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {Trace as ChatTrace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {ReadValueCard, readValueCard} from './read-value-card.js'
import {
  STORY_FRAME_CLASS,
  storyAddResult,
  storyCtx,
  storyErrorResult,
  storyPart,
  storyResult,
} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ReadValueCard'}
export default meta
type Story = StoryObj

const TRACE_FRAME_CLASS = 'p-4 w-[28rem] [background:var(--chat-panel)] [font-family:var(--chat-font)]'

function traceRow(
  entry: ToolCardEntry,
  part: ToolCallPart,
  result: ToolResultPart | undefined,
  ctx: ToolViewCtx = storyCtx({}),
): TraceItem {
  return {
    key: part.id,
    render: (branch) => <ToolTraceRow part={part} result={result} ctx={ctx} tools={() => [entry]} ring={branch.ring} />,
  }
}

function traceGallery(summary: string, items: TraceItem[]): JSX.Element {
  return (
    <div class={TRACE_FRAME_CLASS}>
      <ChatTrace summary={summary} compactLine={summary} items={items} defaultOpen />
    </div>
  )
}

const textMeta: ToolViewMeta = {
  summary: 'read the visible text of an element',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading text', done: 'Read the text'},
  mutating: false,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, ref: {type: 'string'}, name: {type: 'string'}},
    required: [],
  },
  outputSchema: {type: 'object', properties: {text: {type: 'string'}}},
}

export const ElementAndValue: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReadValueCard
        part={storyPart('page_text', {selector: '#headline'})}
        result={storyResult({text: 'Ship it on Friday'})}
        ctx={storyCtx({page_text: textMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the text')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('tree')).toBeVisible())
    await expect(canvas.getAllByText(/Ship it on Friday/)[0]).toBeVisible()
  },
}

export const RootArray: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReadValueCard
        part={storyPart('page_text', {selector: '.item'})}
        result={storyResult(['Ship the trace redesign', 'Write the session log spec'])}
        ctx={storyCtx({})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('tree')).toBeVisible())
    await expect(canvas.getAllByText(/Ship the trace redesign/)[0]).toBeVisible()
    await expect(canvas.getAllByText(/Write the session log spec/)[0]).toBeVisible()
  },
}

export const RouteObject: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReadValueCard
        part={storyPart('page_route', {})}
        result={storyResult({pathname: '/checkout', search: '?step=2', href: 'https://shop.test/checkout?step=2'})}
        ctx={storyCtx({})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('tree')).toBeVisible())
    await expect(canvas.getAllByText(/\/checkout/)[0]).toBeVisible()
  },
}

const readValueTool: ToolCardEntry = {
  names: ['page_text', 'page_exists'],
  ...readValueCard,
}

export const Trace: Story = {
  render: () =>
    traceGallery('2 reads', [
      traceRow(
        readValueTool,
        storyPart('page_text', {selector: '#headline'}, 'complete', 'r1'),
        storyResult({text: 'Ship it on Friday'}, 'complete', 'r1'),
      ),
      traceRow(
        readValueTool,
        storyPart('page_exists', {selector: '#missing'}, 'complete', 'r2'),
        storyErrorResult('element not found: #missing', 'r2'),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('text').length).toBeGreaterThan(0)
    await expect(canvas.getAllByText(/Ship it on Friday/).length).toBeGreaterThan(0)
  },
}
