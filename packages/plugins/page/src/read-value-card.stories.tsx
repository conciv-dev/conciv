import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {
  STORY_FRAME_CLASS,
  storyCall,
  storyFailedCall,
  StoryTool,
  traceGallery,
  traceRow,
  inPageShell,
} from './story.fixtures.js'

const meta: Meta = {title: 'Plugins/Page/tool/ReadValueCard', decorators: [inPageShell]}
export default meta
type Story = StoryObj

export const ElementAndValue: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool call={storyCall('page_text', {selector: '#headline'}, {text: 'Ship it on Friday'})} />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the text')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('tree')).toBeVisible())
    await expect(canvas.getAllByText(/Ship it on Friday/)[0]).toBeVisible()
  },
}

export const RootArray: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall('page_text', {selector: '.item'}, ['Ship the trace redesign', 'Write the session log spec'])}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('tree')).toBeVisible())
    await expect(canvas.getAllByText(/Ship the trace redesign/)[0]).toBeVisible()
    await expect(canvas.getAllByText(/Write the session log spec/)[0]).toBeVisible()
  },
}

export const RouteObject: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_route',
          {},
          {
            pathname: '/checkout',
            search: '?step=2',
            href: 'https://shop.test/checkout?step=2',
            title: 'Checkout',
            state: 'visible',
          },
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByRole('tree')).toBeVisible())
    await expect(canvas.getAllByText(/\/checkout/)[0]).toBeVisible()
  },
}

export const Trace: Story = {
  render: () =>
    traceGallery('2 reads', [
      traceRow(storyCall('page_text', {selector: '#headline'}, {text: 'Ship it on Friday'}, 'r1')),
      traceRow(storyFailedCall('page_exists', {selector: '#missing'}, 'element not found: #missing', 'r2')),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText('Read the text').length).toBeGreaterThan(0)
    await expect(canvas.getAllByText(/Ship it on Friday/).length).toBeGreaterThan(0)
  },
}
