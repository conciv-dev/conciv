import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Tabs} from './tabs.js'

const meta: Meta = {title: 'ui-kit/Tabs'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => (
    <Tabs.Root defaultValue="chat">
      <Tabs.List>
        <Tabs.Trigger value="chat">Chat</Tabs.Trigger>
        <Tabs.Trigger value="canvas">Canvas</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Content value="chat">The conversation thread.</Tabs.Content>
      <Tabs.Content value="canvas">The whiteboard surface.</Tabs.Content>
    </Tabs.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('The conversation thread.')).toBeVisible()
    await userEvent.click(c.getByRole('tab', {name: 'Canvas'}))
    await waitFor(() => expect(c.getByText('The whiteboard surface.')).toBeVisible())
  },
}
