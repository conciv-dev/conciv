import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {Trace as ChatTrace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {ReactCard} from './react-card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ReactCard'}
export default meta
type Story = StoryObj

const TRACE_FRAME_CLASS =
  'chat-theme-terminal p-4 w-[28rem] [background:var(--chat-panel)] [font-family:var(--chat-font)]'

function traceRow(
  entry: ToolCardEntry,
  part: ToolCallPart,
  result: ToolResultPart | undefined,
  ctx: ToolViewCtx = storyCtx({}),
): TraceItem {
  return {
    key: part.id,
    render: (branch) => (
      <ToolTraceRow part={part} result={result} ctx={ctx} tools={() => [entry]} last={branch.last} ring={branch.ring} />
    ),
  }
}

function traceGallery(summary: string, items: TraceItem[]): JSX.Element {
  return (
    <div class={TRACE_FRAME_CLASS}>
      <ChatTrace summary={summary} compactLine={summary} items={items} defaultOpen />
    </div>
  )
}

const locateMeta: ToolViewMeta = {
  summary: 'find the source location that rendered an element',
  category: 'react',
  icon: 'react',
  label: {running: 'Locating the source', done: 'Located the source'},
  mutating: false,
  mirrors: false,
  inputSchema: {type: 'object', properties: {selector: {type: 'string'}}, required: []},
  outputSchema: {type: 'object', properties: {component: {type: 'string'}}},
}

const inspectMeta: ToolViewMeta = {
  summary: 'read props, state, hooks and context of a live component',
  category: 'react',
  icon: 'react',
  label: {running: 'Inspecting a component', done: 'Inspected a component'},
  mutating: false,
  mirrors: false,
  inputSchema: {type: 'object', properties: {selector: {type: 'string'}}, required: []},
  outputSchema: {type: 'object', properties: {component: {type: 'string'}}},
}

const trackMeta: ToolViewMeta = {
  summary: 'record and report React re-renders',
  category: 'react',
  icon: 'react',
  label: {running: 'Tracking renders', done: 'Tracked renders'},
  mutating: false,
  mirrors: false,
  inputSchema: {type: 'object', properties: {action: {type: 'string'}}, required: []},
  outputSchema: {type: 'object', properties: {components: {type: 'array'}}},
}

export const LocatedSource: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReactCard
        part={storyPart('page.locate', {selector: '#checkout'})}
        result={storyResult({
          component: 'CheckoutButton',
          stack: ['CheckoutButton', 'CheckoutForm'],
          frames: [{fileName: 'src/checkout/button.tsx', line: 42, fn: 'CheckoutButton'}],
          source: {file: 'src/checkout/button.tsx', line: 42, column: 3},
        })}
        ctx={storyCtx({'page.locate': locateMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Located the source')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('CheckoutButton')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('src/checkout/button.tsx:42')).toBeVisible())
  },
}

export const InspectedProps: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReactCard
        part={storyPart('page.inspect', {selector: '#checkout'})}
        result={storyResult({
          component: 'CheckoutButton',
          props: {label: 'Ship it', disabled: false},
          state: null,
          hooks: [{id: 0, value: 'idle'}],
        })}
        ctx={storyCtx({'page.inspect': inspectMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('CheckoutButton')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('props')).toBeVisible())
  },
}

export const RenderCounts: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReactCard
        part={storyPart('page.track', {action: 'report'})}
        result={storyResult({
          tracking: true,
          tracked: 2,
          timingsAvailable: false,
          components: [
            {component: 'CheckoutForm', renders: 12, lastReason: 'props changed'},
            {component: 'PriceLabel', renders: 1, lastReason: 'parent render'},
          ],
          note: 'render durations need a profiling build (react-dom/profiling or <Profiler>)',
        })}
        ctx={storyCtx({'page.track': trackMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('12 renders')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('1 render')).toBeVisible())
  },
}

export const NoRenders: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReactCard
        part={storyPart('page.track', {action: 'report'})}
        result={storyResult({tracking: true, tracked: 0, timingsAvailable: true, components: []})}
        ctx={storyCtx({'page.track': trackMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('no re-renders were recorded')).toBeVisible())
  },
}

const reactTool: ToolCardEntry = {names: ['page.tree'], render: ReactCard}

export const Trace: Story = {
  render: () =>
    traceGallery('1 tree', [
      traceRow(
        reactTool,
        storyPart('page.tree', {selector: '#checkout'}),
        storyResult({
          nodes: [
            {
              component: 'CheckoutForm',
              ref: 'e1',
              children: [
                {component: 'EmailField', ref: 'e2', children: []},
                {component: 'SubmitButton', ref: 'e3', children: []},
              ],
            },
          ],
          truncated: 0,
        }),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('tree')).toBeVisible()
    await expect(canvas.getByText('3 nodes')).toBeVisible()
  },
}
