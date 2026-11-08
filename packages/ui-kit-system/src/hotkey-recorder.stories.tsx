import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/HotkeyRecorder'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'

const hotkeySchema = z.object({
  open: z.string().nullable(),
  palette: z.string().nullable(),
  grab: z
    .string()
    .nullable()
    .refine((value) => value !== null, 'Pick a shortcut.'),
  stop: z.string().nullable(),
  replay: z.string().nullable(),
})

const HOTKEY_DEFAULTS: z.input<typeof hotkeySchema> = {
  open: 'Mod+K',
  palette: 'Mod+Shift+O',
  grab: null,
  stop: 'Escape',
  replay: 'Mod+R',
}

function HotkeySettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: HOTKEY_DEFAULTS,
    validators: {onMount: hotkeySchema, onBlur: hotkeySchema},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  const conflict = (hotkey: string) => (hotkey === values().open ? 'Already opens chat.' : undefined)
  return (
    <div class={STACK}>
      <form.AppField name="open">
        {(field) => <field.HotkeyField label="Open chat" description="Works from any page." />}
      </form.AppField>
      <form.AppField name="palette">
        {(field) => (
          <field.HotkeyField
            label="Command palette"
            conflict={conflict}
            changed={values().palette !== 'Mod+P'}
            onReset={() => form.setFieldValue('palette', 'Mod+P')}
          />
        )}
      </form.AppField>
      <form.AppField name="grab">{(field) => <field.HotkeyField label="Grab element" />}</form.AppField>
      <form.AppField name="stop">
        {(field) => <field.HotkeyField label="Stop the turn" locked="Built in" />}
      </form.AppField>
      <form.AppField name="replay">
        {(field) => <field.HotkeyField label="Toggle replay" description="Needs replay on." disabled />}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <HotkeySettings />}

export const SettingKeyboard: Story = {
  render: () => <HotkeySettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const change = canvas.getByRole('button', {name: 'Change Open chat'})
    await expect(change).toHaveAccessibleDescription('Works from any page.')
    await expect(canvas.getByRole('button', {name: 'Record Grab element'})).toHaveAccessibleDescription(
      /Pick a shortcut\./,
    )

    await userEvent.click(change)
    await expect(canvas.getByText('Press a shortcut. Esc cancels.')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByText('Press a shortcut. Esc cancels.')).toBeNull())
    await expect(change).toHaveFocus()
    await expect(change.matches(':focus-visible')).toBe(true)

    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByText('Press a shortcut. Esc cancels.')).toBeVisible()
    await userEvent.keyboard('{Meta>}j{/Meta}')
    const shift = canvas.getByRole('button', {name: /Shift/})
    await expect(shift).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(shift)
    await waitFor(() => expect(shift).toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(canvas.getByRole('button', {name: 'Save'}))
    await expect(canvas.getByText(/^Committed/)).toHaveTextContent('Committed open: Mod+Shift+[KeyJ]')
    await expect(change).toHaveFocus()

    await userEvent.click(canvas.getByRole('button', {name: 'Change Command palette'}))
    await userEvent.keyboard('{Meta>}{Shift>}j{/Shift}{/Meta}')
    await expect(canvas.getByRole('status')).toHaveTextContent('Already opens chat.')
    await userEvent.click(canvas.getByRole('button', {name: 'Cancel'}))
    await expect(canvas.getByRole('button', {name: 'Change Command palette'})).toHaveFocus()

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    await expect(canvas.getByText(/^Committed/)).toHaveTextContent('Committed palette: Mod+P')
    await expect(canvas.getByRole('button', {name: 'Change Command palette'})).toHaveFocus()

    await userEvent.click(canvas.getAllByRole('button', {name: 'Clear shortcut'})[0] ?? change)
    await expect(canvas.getByText(/^Committed/)).toHaveTextContent('Committed open: null')
    await expect(canvas.getByRole('button', {name: 'Record Open chat'})).toBeVisible()

    await expect(canvas.queryByRole('button', {name: 'Change Stop the turn'})).toBeNull()
    await expect(canvas.queryByRole('button', {name: 'Change Toggle replay'})).toBeNull()
  },
}
