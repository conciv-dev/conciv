import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {Trace as ChatTrace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {ReadBulkCard, readBulkCard} from './read-bulk-card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ReadBulkCard'}
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

const domMeta: ToolViewMeta = {
  summary: 'return the outer HTML of an element or of the whole body',
  category: 'read',
  icon: 'read',
  label: {running: 'Reading the DOM', done: 'Read the DOM'},
  mutating: false,
  mirrors: false,
  inputSchema: {type: 'object', properties: {selector: {type: 'string'}}, required: []},
  outputSchema: {type: 'object', properties: {html: {type: 'string'}}},
}

const queryMeta: ToolViewMeta = {
  summary: 'describe every element matching a selector',
  category: 'read',
  icon: 'read',
  label: {running: 'Querying the page', done: 'Queried the page'},
  mutating: false,
  mirrors: false,
  inputSchema: {type: 'object', properties: {selector: {type: 'string'}}, required: []},
  outputSchema: {type: 'object', properties: {count: {type: 'number'}, elements: {type: 'array'}}},
}

const snapshotMeta: ToolViewMeta = {
  summary: 'take an accessibility snapshot with a ref for every control',
  category: 'read',
  icon: 'read',
  label: {running: 'Capturing a snapshot', done: 'Captured a snapshot'},
  mutating: false,
  mirrors: false,
  inputSchema: {type: 'object', properties: {selector: {type: 'string'}}, required: []},
  outputSchema: {type: 'object', properties: {nodes: {type: 'array'}}},
}

function shadowText(canvasElement: HTMLElement): string {
  return Array.from(canvasElement.querySelectorAll('diffs-container'))
    .map((host) => host.shadowRoot?.textContent ?? '')
    .join('\n')
}

export const DomMarkup: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReadBulkCard
        part={storyPart('page_dom', {selector: '#hero'})}
        result={storyResult({html: '<section id="hero"><h1>Ship it on Friday</h1></section>'})}
        ctx={storyCtx({page_dom: domMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the DOM')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('#hero')).toBeVisible())
    await waitFor(() => expect(shadowText(canvasElement)).toContain('Ship it on Friday'))
  },
}

export const SnapshotNodes: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReadBulkCard
        part={storyPart('page_snapshot', {selector: 'form'})}
        result={storyResult({
          nodes: [
            {ref: 'e12', role: 'textbox', name: 'Email'},
            {ref: 'e13', role: 'button', name: 'Ship it'},
          ],
        })}
        ctx={storyCtx({page_snapshot: snapshotMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('Ship it')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('e12')).toBeVisible())
  },
}

export const QueryMatches: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReadBulkCard
        part={storyPart('page_query', {selector: 'button.primary'})}
        result={storyResult({
          count: 3,
          elements: [{tagName: 'button', className: 'primary'}, {tagName: 'button'}, {tagName: 'button'}],
        })}
        ctx={storyCtx({page_query: queryMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('3 matches')).toBeVisible())
  },
}

export const EmptySnapshot: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <ReadBulkCard
        part={storyPart('page_snapshot', {selector: '#empty'})}
        result={storyResult({nodes: []})}
        ctx={storyCtx({page_snapshot: snapshotMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('the snapshot found no accessible nodes')).toBeVisible())
  },
}

const readBulkTool: ToolCardEntry = {names: ['page_snapshot'], ...readBulkCard}

export const Trace: Story = {
  render: () =>
    traceGallery('1 snap', [
      traceRow(
        readBulkTool,
        storyPart('page_snapshot', {selector: 'form'}),
        storyResult({
          nodes: [
            {ref: 'e12', role: 'textbox', name: 'Email'},
            {ref: 'e13', role: 'button', name: 'Ship it'},
          ],
        }),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('snapshot')).toBeVisible()
    await expect(canvas.getAllByText('form').length).toBeGreaterThan(0)
    await waitFor(() => expect(canvas.getByText('Email')).toBeVisible())
    await expect(canvas.getByText('Ship it')).toBeVisible()
  },
}
