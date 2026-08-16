import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ConsoleCard} from './console-card.js'
import {STORY_FRAME_CLASS, storyAddResult, storyCtx, storyPart, storyResult} from './story.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ConsoleCard'}
export default meta
type Story = StoryObj

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
