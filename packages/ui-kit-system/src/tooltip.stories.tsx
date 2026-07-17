import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Tooltip} from './tooltip.js'

const meta: Meta = {title: 'ui-kit-system/Tooltip'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <Tooltip.Root openDelay={0} closeDelay={0}>
      <Tooltip.Trigger class="text-pw-accent-link underline cursor-pointer">Reload</Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content>Regenerate this response</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.hover(c.getByText('Reload'))
    await waitFor(() => expect(c.getByText('Regenerate this response')).toBeVisible())
  },
}
