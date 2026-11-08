import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {Button} from './button.js'
import {ConfirmDialog} from './confirm-dialog.js'

const meta: Meta = {title: 'ui-kit-system/ConfirmDialog'}
export default meta
type Story = StoryObj

function ResetAll() {
  const [state, setState] = createStore({open: false, resets: 0})
  return (
    <div class="flex flex-col gap-2 items-start">
      <Button variant="outline-danger" onClick={() => setState('open', true)}>
        Reset all settings
      </Button>
      <span class="text-[0.75rem] text-chat-text-2">Resets: {state.resets}</span>
      <ConfirmDialog
        open={state.open}
        onOpenChange={(open) => setState('open', open)}
        title="Reset all settings?"
        description="Every setting on this page goes back to its default. Locked settings stay as they are."
        confirmLabel="Reset all"
        onConfirm={() => setState('resets', (resets) => resets + 1)}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <ResetAll />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole('button', {name: 'Reset all settings'})

    await userEvent.click(trigger)
    const dialog = await page.findByRole('alertdialog', {name: 'Reset all settings?'})
    await expect(dialog).toHaveAccessibleDescription(/Every setting on this page goes back to its default\./)
    const cancel = within(dialog).getByRole('button', {name: 'Cancel'})
    await waitFor(() => expect(cancel).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('alertdialog')).toBeNull())
    await expect(trigger).toHaveFocus()
    await expect(canvas.getByText('Resets: 0')).toBeVisible()

    await userEvent.keyboard('{Enter}')
    const again = await page.findByRole('alertdialog', {name: 'Reset all settings?'})
    await waitFor(() => expect(within(again).getByRole('button', {name: 'Cancel'})).toHaveFocus())
    await userEvent.tab()
    await expect(within(again).getByRole('button', {name: 'Reset all'})).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(page.queryByRole('alertdialog')).toBeNull())
    await expect(canvas.getByText('Resets: 1')).toBeVisible()
    await expect(trigger).toHaveFocus()
  },
}
