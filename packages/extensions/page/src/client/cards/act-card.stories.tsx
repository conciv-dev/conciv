import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ELEMENT_CAPTURE_FIXTURE_CSS, ELEMENT_CAPTURE_FIXTURE_FULL} from '@conciv/ui-kit-chat'
import {ActCard} from './act-card.js'
import {STORY_FRAME_CLASS, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'extension-page/client/cards/ActCard'}
export default meta
type Story = StoryObj

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
