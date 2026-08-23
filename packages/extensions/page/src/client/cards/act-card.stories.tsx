import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_FULL,
  Trace as ChatTrace,
  ToolTraceRow,
  type TraceItem,
} from '@conciv/ui-kit-chat/tools'
import {ActCard, actCard} from './act-card.js'
import {
  STORY_FRAME_CLASS,
  storyAddResult,
  storyCtx,
  storyErrorResult,
  storyPart,
  storyResult,
} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ActCard'}
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

const fillMeta: ToolViewMeta = {
  summary: 'type a value into a form field',
  category: 'act',
  icon: 'keyboard',
  label: {running: 'Typing', done: 'Typed'},
  mutating: true,
  mirrors: true,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, ref: {type: 'string'}, name: {type: 'string'}, value: {type: 'string'}},
    required: ['value'],
  },
  outputSchema: {type: 'object', properties: {ok: {type: 'boolean'}, value: {type: 'string'}}},
}

export const FilledField: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ActCard
        part={storyPart('page.fill', {selector: '#email', value: 'ada@example.com'})}
        result={storyResult({ok: true, value: 'ada@example.com'})}
        ctx={storyCtx({'page.fill': fillMeta})}
        addResult={storyAddResult}
        capture={{after: ELEMENT_CAPTURE_FIXTURE_FULL, css: ELEMENT_CAPTURE_FIXTURE_CSS}}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Typed')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('ada@example.com')).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Email'})).toBeVisible())
  },
}

const actTool: ToolCardEntry = {names: ['page.fill', 'page.check', 'page.wait'], ...actCard}

export const Trace: Story = {
  render: () =>
    traceGallery('3 actions', [
      traceRow(
        actTool,
        storyPart('page.fill', {selector: '#email', value: 'ada@example.com'}, 'complete', 't1'),
        storyResult({ok: true, value: 'ada@example.com'}, 'complete', 't1'),
      ),
      traceRow(
        actTool,
        storyPart('page.check', {selector: '#terms'}, 'complete', 't2'),
        storyResult({checked: true}, 'complete', 't2'),
      ),
      traceRow(
        actTool,
        storyPart('page.wait', {selector: '#done', state: 'visible'}, 'complete', 't3'),
        storyErrorResult('wait timed out for #done (visible)', 't3'),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('fill')).toBeVisible()
    await expect(canvas.getAllByText('#email').length).toBeGreaterThan(0)
    await expect(canvas.getByText(/wait timed out for #done/)).toBeVisible()
  },
}
