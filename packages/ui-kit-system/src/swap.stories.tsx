import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Swap} from './swap.js'

const meta: Meta = {title: 'ui-kit-system/Swap'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [on, setOn] = createSignal(false)
    return (
      <button
        type="button"
        class="p-2 border border-pw-line rounded-pw-md inline-flex"
        onClick={() => setOn((v) => !v)}
      >
        <Swap.Root swap={on()}>
          <Swap.Indicator type="on">on</Swap.Indicator>
          <Swap.Indicator type="off">off</Swap.Indicator>
        </Swap.Root>
      </button>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByText('off')).toBeVisible())
    await userEvent.click(c.getByRole('button'))
    await waitFor(() => expect(c.getByText('on')).toBeVisible())
  },
}
