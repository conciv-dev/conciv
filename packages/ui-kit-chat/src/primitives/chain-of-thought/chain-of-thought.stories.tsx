import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ChainOfThought} from './chain-of-thought.js'

const meta: Meta = {title: 'primitives/ChainOfThought'}
export default meta
type Story = StoryObj

export const TogglesCollapsed: Story = {
  render: () => (
    <ChainOfThought.Root class="text-pw-text-2">
      <ChainOfThought.AccordionTrigger class="text-[0.75rem] text-pw-text-2">Reasoning</ChainOfThought.AccordionTrigger>
      <ChainOfThought.Parts class="text-[0.75rem] mt-1">
        <div>Step 1: read the file</div>
        <div>Step 2: spot the missing await</div>
      </ChainOfThought.Parts>
    </ChainOfThought.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    // Anchor on the (always-mounted) trigger's collapsed state, then confirm the body is unmounted —
    // the queryBy null can't pass prematurely because aria-expanded='false' proves the tree rendered.
    const trigger = await waitFor(() => c.getByRole('button', {name: 'Reasoning'}))
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(c.queryByText('Step 1: read the file')).toBeNull()
    await userEvent.click(trigger)
    await waitFor(() => expect(c.getByText('Step 1: read the file')).toBeVisible())
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  },
}

export const OpenWhileStreaming: Story = {
  render: () => (
    <ChainOfThought.Root streaming class="text-pw-text-2">
      <ChainOfThought.AccordionTrigger class="text-[0.75rem]">Thinking…</ChainOfThought.AccordionTrigger>
      <ChainOfThought.Parts class="text-[0.75rem] mt-1">
        <div>still working</div>
      </ChainOfThought.Parts>
    </ChainOfThought.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('still working')).toBeVisible()
  },
}
