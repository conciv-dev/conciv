import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {Button} from './button.js'
import {ConfirmDialog} from './confirm-dialog.js'

const meta: Meta = {title: 'ui-kit-system/ConfirmDialog'}
export default meta
type Story = StoryObj

function DeleteProject() {
  const [state, setState] = createStore({open: false, deletions: 0})
  return (
    <div class="flex flex-col gap-2 items-start">
      <Button variant="outline-danger" onClick={() => setState('open', true)}>
        Delete project
      </Button>
      <span class="text-[0.75rem] text-chat-text-2">Deletions: {state.deletions}</span>
      <ConfirmDialog
        open={state.open}
        onOpenChange={(open) => setState('open', open)}
        title="Delete this project?"
        description="The project and its files are removed for good. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => setState('deletions', (deletions) => deletions + 1)}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <DeleteProject />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole('button', {name: 'Delete project'})

    await userEvent.click(trigger)
    const dialog = await page.findByRole('alertdialog', {name: 'Delete this project?'})
    await expect(dialog).toHaveAccessibleDescription(/The project and its files are removed for good\./)
    const cancel = within(dialog).getByRole('button', {name: 'Cancel'})
    await waitFor(() => expect(cancel).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('alertdialog')).toBeNull())
    await expect(trigger).toHaveFocus()
    await expect(canvas.getByText('Deletions: 0')).toBeVisible()

    await userEvent.keyboard('{Enter}')
    const again = await page.findByRole('alertdialog', {name: 'Delete this project?'})
    await waitFor(() => expect(within(again).getByRole('button', {name: 'Cancel'})).toHaveFocus())
    await userEvent.tab()
    await expect(within(again).getByRole('button', {name: 'Delete'})).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(page.queryByRole('alertdialog')).toBeNull())
    await expect(canvas.getByText('Deletions: 1')).toBeVisible()
    await expect(trigger).toHaveFocus()
  },
}
