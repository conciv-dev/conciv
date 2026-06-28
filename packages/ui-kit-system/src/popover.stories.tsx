import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Popover} from './popover.js'

const meta: Meta = {title: 'ui-kit/Popover'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <Popover.Root>
      <Popover.Trigger class="text-pw-text underline cursor-pointer">Open assistant</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content class="p-4 w-60">
          <Popover.Title class="text-[0.8125rem] text-pw-text-hi font-pw">Assistant</Popover.Title>
          <Popover.Description class="text-[0.75rem] text-pw-text-2 mt-1">
            Ask anything about the running app.
          </Popover.Description>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('Open assistant'))
    await waitFor(() => expect(c.getByText(/Ask anything/)).toBeVisible())
  },
}
