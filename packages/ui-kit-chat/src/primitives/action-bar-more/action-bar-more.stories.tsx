import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ActionBarMore} from './action-bar-more.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/ActionBarMore'}
export default meta
type Story = StoryObj

export const OverflowMenu: Story = {
  render: () => {
    const [picked, setPicked] = createSignal('')
    return (
      <div>
        <ActionBarMore.Root>
          <ActionBarMore.Trigger class="text-pw-text px-2 py-1 border border-pw-line rounded-pw-sm">
            ⋯
          </ActionBarMore.Trigger>
          <ActionBarMore.Content>
            <ActionBarMore.Item value="copy" onSelect={() => setPicked('copy')}>
              Copy message
            </ActionBarMore.Item>
            <ActionBarMore.Separator />
            <ActionBarMore.Item value="export" onSelect={() => setPicked('export')}>
              Export markdown
            </ActionBarMore.Item>
          </ActionBarMore.Content>
        </ActionBarMore.Root>
        <div>Picked: {picked()}</div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('⋯'))
    await waitFor(() => expect(c.getByText('Export markdown')).toBeVisible())
    await userEvent.click(c.getByText('Export markdown'))
    await waitFor(() => expect(c.getByText(/Picked: export/)).toBeVisible())
  },
}
