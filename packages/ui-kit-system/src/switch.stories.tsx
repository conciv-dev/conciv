import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Switch} from './switch.js'

const meta: Meta = {title: 'ui-kit-system/Switch'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [on, setOn] = createSignal(false)
    return (
      <div>
        <Switch.Root checked={on()} onCheckedChange={(details) => setOn(details.checked)}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Label>Auto-scroll</Switch.Label>
          <Switch.HiddenInput />
        </Switch.Root>
        <div>State: {on() ? 'on' : 'off'}</div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('State: off')).toBeVisible()
    await userEvent.click(c.getByText('Auto-scroll'))
    await waitFor(() => expect(c.getByText('State: on')).toBeVisible())
  },
}
