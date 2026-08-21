import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER,
  ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE,
  Trace as ChatTrace,
  ToolTraceRow,
  type TraceItem,
} from '@conciv/ui-kit-chat/tools'
import {EditLiveCard} from './edit-live-card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/EditLiveCard'}
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

const settextMeta: ToolViewMeta = {
  summary: 'replace the text content of an element',
  category: 'edit-live',
  icon: 'edit',
  label: {running: 'Setting text', done: 'Set the text'},
  mutating: true,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, ref: {type: 'string'}, name: {type: 'string'}, text: {type: 'string'}},
    required: ['text'],
  },
  outputSchema: {type: 'object', properties: {ok: {type: 'boolean'}}},
}

const evalMeta: ToolViewMeta = {
  summary: 'run javascript in the page and return its result',
  category: 'edit-live',
  icon: 'script',
  label: {running: 'Running a script', done: 'Ran a script'},
  mutating: true,
  mirrors: false,
  inputSchema: {type: 'object', properties: {code: {type: 'string'}}, required: ['code']},
  outputSchema: {type: 'object', properties: {result: {}}},
}

export const TextChangeWithDiff: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <EditLiveCard
        part={storyPart('page.settext', {selector: '#cta', text: 'Order placed'})}
        result={storyResult({ok: true})}
        ctx={storyCtx({'page.settext': settextMeta})}
        addResult={storyAddResult}
        capture={{
          before: ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE,
          after: ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER,
          css: ELEMENT_CAPTURE_FIXTURE_CSS,
        }}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Set the text')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('tab', {name: 'Before'})).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('tab', {name: 'After'})).toBeVisible())
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll('diffs-container'))
          .map((host) => host.shadowRoot?.textContent ?? '')
          .join('\n'),
      ).toContain('Order placed'),
    )
    await userEvent.click(canvas.getByRole('tab', {name: 'Before'}))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Submit order'})).toBeVisible())
    await userEvent.click(canvas.getByRole('tab', {name: 'After'}))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Order placed'})).toBeVisible())
    await userEvent.click(canvas.getByRole('tab', {name: 'Before'}))
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Submit order'})).toBeVisible())
  },
}

export const EvalCodeBlock: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <EditLiveCard
        part={storyPart('page.eval', {code: 'return document.title'})}
        result={storyResult({result: 'Storefront'})}
        ctx={storyCtx({'page.eval': evalMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ran a script')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll('diffs-container'))
          .map((host) => host.shadowRoot?.textContent ?? '')
          .join('\n'),
      ).toContain('document.title'),
    )
    await expect(canvas.queryByText('return document.title')).toBeNull()
  },
}

const editLiveTool: ToolCardEntry = {
  names: ['page.setattr', 'page.eval'],
  render: EditLiveCard,
}

export const Trace: Story = {
  render: () =>
    traceGallery('2 edits', [
      traceRow(
        editLiveTool,
        storyPart('page.setattr', {selector: '#cta', attribute: 'disabled', value: 'true'}, 'complete', 'e1'),
        storyResult({ok: true}, 'complete', 'e1'),
      ),
      traceRow(
        editLiveTool,
        storyPart('page.eval', {code: 'return document.title'}, 'complete', 'e2'),
        storyResult({result: 'Storefront'}, 'complete', 'e2'),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('setattr')).toBeVisible()
    await expect(canvas.getAllByText('#cta').length).toBeGreaterThan(0)
    await expect(canvas.getByText('exec')).toBeVisible()
  },
}
