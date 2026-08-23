import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {Trace as ChatTrace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {consoleCard} from './console-card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const ConsoleCard = consoleCard.render

const meta: Meta = {title: 'Extensions/Page/tool/ConsoleCard'}
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

const consoleMeta: ToolViewMeta = {
  summary: 'read the buffered browser console output',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading the console', done: 'Read the console'},
  mutating: false,
  mirrors: false,
  inputSchema: {type: 'object', properties: {since: {type: 'number'}}, required: []},
  outputSchema: {type: 'object', properties: {entries: {type: 'array'}}},
}

const NOON = Date.UTC(2026, 7, 8, 12, 0, 0)

export const LogLines: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ConsoleCard
        part={storyPart('page.console', {})}
        result={storyResult({
          entries: [
            {level: 'log', ts: NOON, text: 'checkout mounted'},
            {level: 'warn', ts: NOON + 1200, text: 'slow response from /api/cart'},
            {level: 'error', ts: NOON + 2400, text: 'TypeError: cart.items is undefined'},
          ],
        })}
        ctx={storyCtx({'page.console': consoleMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the console')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('3 lines')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('checkout mounted')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('TypeError: cart.items is undefined')).toBeVisible())
  },
}

export const NoOutput: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ConsoleCard
        part={storyPart('page.console', {})}
        result={storyResult({entries: []})}
        ctx={storyCtx({'page.console': consoleMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('the page logged nothing to the console')).toBeVisible())
  },
}

const consoleTool: ToolCardEntry = {names: ['page.console'], ...consoleCard}

export const Trace: Story = {
  render: () =>
    traceGallery('1 log', [
      traceRow(
        consoleTool,
        storyPart('page.console', {}),
        storyResult({
          entries: [
            {level: 'log', ts: NOON, text: 'checkout mounted'},
            {level: 'warn', ts: NOON + 1200, text: 'slow response from /api/cart'},
            {level: 'error', ts: NOON + 2400, text: 'TypeError: cart.items is undefined'},
          ],
        }),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('log')).toBeVisible()
    await expect(canvas.getAllByText('3 lines').length).toBeGreaterThan(0)
  },
}
