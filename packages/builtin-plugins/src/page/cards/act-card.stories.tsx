import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolCardEntry, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ELEMENT_CAPTURE_FIXTURE_CSS, ELEMENT_CAPTURE_FIXTURE_FULL} from '@conciv/ui-kit-chat/tools'
import {ActCard, actCard} from './act-card.js'
import {
  STORY_FRAME_CLASS,
  storyAddResult,
  storyCtx,
  storyErrorResult,
  storyPart,
  storyResult,
} from './story.fixtures.js'
import {traceGallery, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ActCard'}
export default meta
type Story = StoryObj

const fillMeta: ToolViewMeta = {
  summary: 'type a value into a form field',
  category: 'act',
  icon: 'keyboard',
  label: {running: 'Typing', done: 'Typed'},
  mutating: true,
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
        part={storyPart('page_fill', {selector: '#email', value: 'ada@example.com'})}
        result={storyResult({ok: true, value: 'ada@example.com'})}
        ctx={storyCtx({page_fill: fillMeta})}
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

const actTool: ToolCardEntry = {names: ['page_fill', 'page_check', 'page_wait'], ...actCard}

export const Trace: Story = {
  render: () =>
    traceGallery('3 actions', [
      traceRow(
        actTool,
        storyPart('page_fill', {selector: '#email', value: 'ada@example.com'}, 'complete', 't1'),
        storyResult({ok: true, value: 'ada@example.com'}, 'complete', 't1'),
      ),
      traceRow(
        actTool,
        storyPart('page_check', {selector: '#terms'}, 'complete', 't2'),
        storyResult({checked: true}, 'complete', 't2'),
      ),
      traceRow(
        actTool,
        storyPart('page_wait', {selector: '#done', state: 'visible'}, 'complete', 't3'),
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
