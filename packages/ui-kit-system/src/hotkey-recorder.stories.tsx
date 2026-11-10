import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {FieldShell} from './field-shell.js'
import {HotkeyRecorder} from './hotkey-recorder.js'

const meta: Meta = {title: 'ui-kit-system/HotkeyRecorder'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const NOTE = 'text-[0.75rem] text-chat-text-2'
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control'

function HotkeyStates() {
  const [state, setState] = createStore<{search: string | null; save: string | null; print: string | null}>({
    search: 'Mod+K',
    save: 'Mod+S',
    print: null,
  })
  const conflict = (hotkey: string) => (hotkey === state.search ? 'Already used by Search.' : undefined)
  return (
    <div class={STACK}>
      <FieldShell label="Search" description="Works from any page." layout="row">
        <HotkeyRecorder value={state.search} onValueChange={(value) => setState('search', value)} />
      </FieldShell>
      <FieldShell label="Save" layout="row">
        <HotkeyRecorder value={state.save} conflict={conflict} onValueChange={(value) => setState('save', value)} />
      </FieldShell>
      <FieldShell label="Print" layout="row" error={state.print === null ? 'Pick a shortcut.' : undefined}>
        <HotkeyRecorder value={state.print} onValueChange={(value) => setState('print', value)} />
      </FieldShell>
      <FieldShell label="Undo" layout="row" readOnly>
        <HotkeyRecorder value="Mod+Z" />
      </FieldShell>
      <FieldShell label="Redo" description="Turn on history first." layout="row" disabled>
        <HotkeyRecorder value="Mod+Shift+Z" />
      </FieldShell>
      <p class={NOTE}>Search {String(state.search)}</p>
    </div>
  )
}

export const States: Story = {render: () => <HotkeyStates />}

export const Keyboard: Story = {
  render: () => <HotkeyStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const change = canvas.getByRole('button', {name: 'Change Search'})
    await expect(change).toHaveAccessibleDescription('Works from any page.')
    await expect(canvas.getByRole('button', {name: 'Record Print'})).toHaveAccessibleDescription(/Pick a shortcut\./)

    await userEvent.click(change)
    await expect(canvas.getByText('Press a shortcut. Esc cancels.')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByText('Press a shortcut. Esc cancels.')).toBeNull())
    await expect(change).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(`{${MOD}>}u{/${MOD}}`)
    await expect(canvas.getByRole('group', {name: 'Modifiers'})).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('group', {name: 'Modifiers'})).toBeNull())
    await expect(canvas.getByText(/^Search /)).toHaveTextContent('Search Mod+K')
    await expect(change).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByText('Press a shortcut. Esc cancels.')).toBeVisible()
    await userEvent.keyboard(`{${MOD}>}j{/${MOD}}`)
    const shift = canvas.getByRole('button', {name: /Shift/})
    await expect(shift).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(shift)
    await waitFor(() => expect(shift).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(canvas.getByRole('button', {name: 'Save'}))
    await expect(canvas.getByText(/^Search /)).toHaveTextContent('Search Mod+Shift+J')
    await expect(change).toHaveFocus()

    await userEvent.click(canvas.getByRole('button', {name: 'Change Save'}))
    await userEvent.keyboard(`{${MOD}>}{Shift>}j{/Shift}{/${MOD}}`)
    await expect(canvas.getByRole('status')).toHaveTextContent('Already used by Search.')
    await userEvent.click(canvas.getByRole('button', {name: 'Cancel'}))
    await expect(canvas.getByRole('button', {name: 'Change Save'})).toHaveFocus()

    const [clear] = canvas.getAllByRole('button', {name: 'Clear shortcut'})
    if (!clear) throw new Error('the search recorder renders no clear button')
    await userEvent.click(clear)
    await expect(canvas.getByText(/^Search /)).toHaveTextContent('Search null')
    await expect(canvas.getByRole('button', {name: 'Record Search'})).toHaveFocus()

    await expect(canvas.queryByRole('button', {name: 'Change Undo'})).toBeNull()
    await expect(canvas.queryByRole('button', {name: 'Change Redo'})).toBeNull()
  },
}
