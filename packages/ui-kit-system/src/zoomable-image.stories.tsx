import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ZoomableImage} from './zoomable-image.js'

const meta: Meta = {title: 'ui-kit-system/ZoomableImage'}
export default meta
type Story = StoryObj

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1500"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#3b82f6"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><rect width="2400" height="1500" fill="url(#g)"/><circle cx="1200" cy="750" r="420" fill="#fff" fill-opacity=".35"/></svg>`
const WIDE_IMAGE = `data:image/svg+xml,${encodeURIComponent(SVG)}`

export const Default: Story = {
  render: () => (
    <div class="p-4 flex flex-col w-96">
      <ZoomableImage src={WIDE_IMAGE} alt="Page screenshot" />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', {name: 'Open Page screenshot'}))
    await waitFor(() => expect(canvas.getByRole('dialog', {name: 'Page screenshot'})).toBeVisible())
    await userEvent.keyboard('{Escape}')
  },
}
