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
    const toggle = c.getByRole('switch', {name: 'Auto-scroll'})
    const control = canvasElement.querySelector('[data-part="control"]')
    if (!(control instanceof HTMLElement)) throw new Error('the switch renders no control')
    const box = control.getBoundingClientRect()
    const y = box.top + box.height / 2
    const drag = (options: {from: number; to: number}) =>
      userEvent.pointer([
        {keys: '[MouseLeft>]', target: control, coords: {clientX: box.left + options.from, clientY: y}},
        {target: control, coords: {clientX: box.left + (options.from + options.to) / 2, clientY: y}},
        {target: control, coords: {clientX: box.left + options.to, clientY: y}},
        {keys: '[/MouseLeft]', target: control},
      ])
    await expect(c.getByText('State: off')).toBeVisible()
    await expect(toggle).not.toBeChecked()

    await userEvent.click(c.getByText('Auto-scroll'))
    await waitFor(() => expect(c.getByText('State: on')).toBeVisible())
    await expect(toggle).toBeChecked()

    await userEvent.click(control)
    await waitFor(() => expect(toggle).not.toBeChecked())

    await drag({from: 8, to: box.width - 2})
    await waitFor(() => expect(toggle).toBeChecked())
    await expect(c.getByText('State: on')).toBeVisible()

    await drag({from: box.width - 8, to: box.width - 13})
    await expect(toggle).toBeChecked()
    await expect(c.getByText('State: on')).toBeVisible()
  },
}
