import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {For} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Button} from './button.js'
import {Dialog} from './dialog.js'

const meta: Meta = {title: 'ui-kit-system/Dialog'}
export default meta
type Story = StoryObj

const ACTIONS = 'flex items-center justify-end gap-1.5'
const RELEASE_NOTES = Array.from(
  {length: 40},
  (_, index) => `Change ${index + 1}: the plugin host keeps each plugin's settings in its own store.`,
)

function PluginSettings() {
  const [state, setState] = createStore({open: false, saves: 0})
  return (
    <div class="flex flex-col gap-2 items-start">
      <Dialog.Root open={state.open} onOpenChange={(details) => setState('open', details.open)}>
        <Dialog.Trigger asChild={(triggerProps) => <Button {...triggerProps()}>Open plugin settings</Button>} />
        <span class="text-[0.75rem] text-chat-text-2">Saves: {state.saves}</span>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content size="lg">
              <Dialog.Header>
                <Dialog.Title>Plugin settings</Dialog.Title>
                <Dialog.CloseTrigger />
              </Dialog.Header>
              <Dialog.Body>
                <Dialog.Description class="text-chat-text-2 m-0">
                  Choose what the plugin may read from this project.
                </Dialog.Description>
              </Dialog.Body>
              <Dialog.Footer class={ACTIONS}>
                <Button variant="outline" onClick={() => setState('open', false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setState('saves', (saves) => saves + 1)
                    setState('open', false)
                  }}
                >
                  Save
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function ReleaseNotes() {
  const [state, setState] = createStore({open: false})
  return (
    <Dialog.Root open={state.open} onOpenChange={(details) => setState('open', details.open)}>
      <Dialog.Trigger asChild={(triggerProps) => <Button {...triggerProps()}>Open release notes</Button>} />
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Release notes</Dialog.Title>
              <Dialog.CloseTrigger />
            </Dialog.Header>
            <Dialog.Body>
              <ul class="m-0 p-0 list-none flex flex-col gap-2">
                <For each={RELEASE_NOTES}>{(note) => <li>{note}</li>}</For>
              </ul>
            </Dialog.Body>
            <Dialog.Footer class={ACTIONS}>
              <Button onClick={() => setState('open', false)}>Done</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ReadyMadeExample() {
  const [state, setState] = createStore({open: false})
  return (
    <div>
      <Button variant="outline" onClick={() => setState('open', true)}>
        Open ready-made dialog
      </Button>
      <Dialog
        open={state.open}
        onOpenChange={(open) => setState('open', open)}
        title="Connect a running session"
        dismissable
        footer={
          <div class={ACTIONS}>
            <Button variant="outline" onClick={() => setState('open', false)}>
              Close
            </Button>
          </div>
        }
      >
        <p class="m-0">Pick a session that is already running to follow it here.</p>
      </Dialog>
    </div>
  )
}

export const Parts: Story = {
  render: () => <PluginSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole('button', {name: 'Open plugin settings'})

    await userEvent.click(trigger)
    const dialog = await page.findByRole('dialog', {name: 'Plugin settings'})
    await expect(dialog).toHaveAccessibleDescription('Choose what the plugin may read from this project.')
    const close = within(dialog).getByRole('button', {name: 'Close'})
    await waitFor(() => expect(close).toHaveFocus())
    await userEvent.click(close)
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
    await expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    const again = await page.findByRole('dialog', {name: 'Plugin settings'})
    await waitFor(() => expect(within(again).getByRole('button', {name: 'Close'})).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull())
    await expect(trigger).toHaveFocus()
    await expect(canvas.getByText('Saves: 0')).toBeVisible()
  },
}

export const LongBody: Story = {
  render: () => <ReleaseNotes />,
}

export const ReadyMade: Story = {
  render: () => <ReadyMadeExample />,
}
