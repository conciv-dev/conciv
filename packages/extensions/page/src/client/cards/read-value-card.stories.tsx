import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ReadValueCard} from './read-value-card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ReadValueCard'}
export default meta
type Story = StoryObj

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
        part={storyPart('page.text', {selector: '#headline'})}
        result={storyResult({text: 'Ship it on Friday'})}
        ctx={storyCtx({'page.text': textMeta})}
        addResult={storyAddResult}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the text')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('#headline')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('Ship it on Friday')).toBeVisible())
  },
}
