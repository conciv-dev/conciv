import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {AssistantModal} from './assistant-modal.js'

const meta: Meta = {title: 'primitives/AssistantModal'}
export default meta
type Story = StoryObj

export const TriggerOpensPanel: Story = {
  render: () => (
    <AssistantModal.Root>
      <AssistantModal.Trigger class="text-pw-on-accent rounded-pw-pill bg-pw-accent size-10">AI</AssistantModal.Trigger>
      <AssistantModal.Content class="p-3 w-72">
        <div class="text-[0.8125rem] text-pw-text">The chat panel lives here.</div>
      </AssistantModal.Content>
    </AssistantModal.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('AI'))
    await waitFor(() => expect(c.getByText('The chat panel lives here.')).toBeVisible())
  },
}
