import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {HoverCard} from './hover-card.js'

const meta: Meta = {title: 'ui-kit-system/HoverCard'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <HoverCard.Root openDelay={0} closeDelay={120}>
      <HoverCard.Trigger class="text-chat-accent-link underline cursor-pointer" aria-label="Context usage">
        Hover me
      </HoverCard.Trigger>
      <HoverCard.Positioner>
        <HoverCard.Content class="text-[0.75rem] w-60">
          <div class="p-3">
            <div class="text-chat-text-hi font-medium">Context usage</div>
            <div class="text-chat-text-2 mt-1">42% of the window used this turn.</div>
          </div>
        </HoverCard.Content>
      </HoverCard.Positioner>
    </HoverCard.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = c.getByText('Hover me')
    await expect(trigger).toBeVisible()
    await userEvent.hover(trigger)
    await waitFor(() => expect(c.getByText(/42% of the window/)).toBeVisible())
  },
}
