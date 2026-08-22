import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Presence} from './presence.js'

const meta: Meta = {title: 'ui-kit-system/Presence'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [present, setPresent] = createSignal(false)
    return (
      <div class="flex flex-col gap-2">
        <button
          type="button"
          class="px-3 py-1 border border-chat-line rounded-chat-surface-md self-start"
          onClick={() => setPresent((v) => !v)}
        >
          Toggle
        </button>
        <Presence present={present()} class="text-chat-text px-3 py-2 rounded-chat-surface-md bg-chat-panel">
          Now you see me
        </Presence>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    const toggle = await waitFor(() => c.getByRole('button', {name: 'Toggle'}))
    await expect(c.getByText('Now you see me')).not.toBeVisible()
    await userEvent.click(toggle)
    await waitFor(() => expect(c.getByText('Now you see me')).toBeVisible())
    await userEvent.click(toggle)
    await waitFor(() => expect(c.getByText('Now you see me')).not.toBeVisible())
  },
}
