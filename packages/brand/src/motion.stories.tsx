import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent} from 'storybook/test'
import {ConcivLockup} from './solid/conciv-lockup.js'

const meta: Meta<typeof ConcivLockup> = {title: 'brand/Motion', component: ConcivLockup}
export default meta
type Story = StoryObj<typeof ConcivLockup>

export const HoverToWake: Story = {
  render: () => (
    <a href="#brand" aria-label="conciv home">
      <ConcivLockup class="h-14" interactive />
    </a>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const logo = await canvas.findByRole('img', {name: 'conciv'})
    await expect(logo).toBeVisible()
    await userEvent.hover(logo)
  },
}
