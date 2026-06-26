import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {HoverCard} from './hover-card.js'

const meta: Meta<typeof HoverCard> = {title: 'ui-kit/HoverCard', component: HoverCard}
export default meta
type Story = StoryObj<typeof HoverCard>

export const Default: Story = {
  render: () => (
    <HoverCard
      label="Context usage"
      trigger={<span class="text-pw-accent-link underline cursor-pointer">Hover me</span>}
    >
      <div class="p-3">
        <div class="text-pw-text-hi font-medium">Context usage</div>
        <div class="text-pw-text-2 mt-1">42% of the window used this turn.</div>
      </div>
    </HoverCard>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = c.getByText('Hover me')
    await expect(trigger).toBeVisible()
    await userEvent.hover(trigger)
    await waitFor(() => expect(c.getByText(/42% of the window/)).toBeVisible())
  },
}
