import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {STORY_FRAME_CLASS, StoryTool, storyCall} from './story.fixtures.js'
import {traceGallery, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ConsoleCard'}
export default meta
type Story = StoryObj

const NOON = Date.UTC(2026, 7, 8, 12, 0, 0)

export const LogLines: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_console',
          {},
          {
            entries: [
              {level: 'log', ts: NOON, text: 'checkout mounted'},
              {level: 'warn', ts: NOON + 1200, text: 'slow response from /api/cart'},
              {level: 'error', ts: NOON + 2400, text: 'TypeError: cart.items is undefined'},
            ],
          },
        )}
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
      <StoryTool call={storyCall('page_console', {}, {entries: []})} />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('the page logged nothing to the console')).toBeVisible())
  },
}

export const Trace: Story = {
  render: () =>
    traceGallery('1 log', [
      traceRow(
        storyCall(
          'page_console',
          {},
          {
            entries: [
              {level: 'log', ts: NOON, text: 'checkout mounted'},
              {level: 'warn', ts: NOON + 1200, text: 'slow response from /api/cart'},
              {level: 'error', ts: NOON + 2400, text: 'TypeError: cart.items is undefined'},
            ],
          },
        ),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the console')).toBeVisible()
    await expect(canvas.getAllByText('3 lines').length).toBeGreaterThan(0)
  },
}
