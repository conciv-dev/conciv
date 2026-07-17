import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Menu} from './menu.js'

const meta: Meta = {title: 'ui-kit-system/Menu'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [picked, setPicked] = createSignal('')
    return (
      <div>
        <Menu.Root onSelect={(details) => setPicked(details.value)}>
          <Menu.Trigger class="text-pw-text underline cursor-pointer">Actions</Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content>
              <Menu.Item value="rename">Rename</Menu.Item>
              <Menu.Item value="archive">Archive</Menu.Item>
              <Menu.Separator />
              <Menu.Item value="delete">Delete</Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
        <div>Picked: {picked()}</div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('Actions'))
    await waitFor(() => expect(c.getByText('Archive')).toBeVisible())
    await userEvent.click(c.getByText('Archive'))
    await waitFor(() => expect(c.getByText(/Picked: archive/)).toBeVisible())
  },
}
