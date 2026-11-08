import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/ColorPicker'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const PRESETS = ['#7c5cff', '#2f80ed', '#27ae60', '#f2994a', '#eb5757']

const colorSchema = z.object({
  accent: z.string(),
  highlight: z.string(),
  marker: z.string().refine((value) => value.toLowerCase() !== '#ffffff', 'White markers vanish on light pages.'),
  brand: z.string(),
  cursor: z.string(),
})

function ColorSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {accent: '#7c5cff', highlight: '#f2994a', marker: '#ffffff', brand: '#2f80ed', cursor: '#27ae60'},
    validators: {onMount: colorSchema, onBlur: colorSchema},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="accent">
        {(field) => <field.ColorField label="Accent" description="Buttons, links and focus rings." presets={PRESETS} />}
      </form.AppField>
      <form.AppField name="highlight">
        {(field) => (
          <field.ColorField
            label="Grab highlight"
            presets={PRESETS}
            changed={values().highlight !== '#2f80ed'}
            onReset={() => form.setFieldValue('highlight', '#2f80ed')}
          />
        )}
      </form.AppField>
      <form.AppField name="marker">{(field) => <field.ColorField label="Marker" />}</form.AppField>
      <form.AppField name="brand">
        {(field) => <field.ColorField label="Brand" locked="Set by your organization" />}
      </form.AppField>
      <form.AppField name="cursor">
        {(field) => <field.ColorField label="Replay cursor" description="Needs replay on." disabled />}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <ColorSettings />}

export const SettingKeyboard: Story = {
  render: () => <ColorSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const accent = canvas.getByRole('textbox', {name: 'Accent'})
    await expect(accent).toHaveValue('#7C5CFF')
    await expect(accent).toHaveAccessibleDescription('Buttons, links and focus rings.')
    await expect(canvas.getByRole('textbox', {name: 'Marker'})).toHaveAccessibleDescription(
      /White markers vanish on light pages\./,
    )

    await userEvent.clear(accent)
    await userEvent.type(accent, '#112233{Enter}')
    await expect(canvas.getByText('Committed accent: #112233')).toBeVisible()

    const [green] = canvas.getAllByRole('button', {name: 'select #27AE60 as the color'})
    if (!green) throw new Error('the accent field renders no green preset')
    await userEvent.click(green)
    await waitFor(() => expect(accent).toHaveValue('#27AE60'))
    await expect(canvas.getByText('Committed accent: #27AE60')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    const highlight = canvas.getByRole('textbox', {name: 'Grab highlight'})
    await waitFor(() => expect(highlight).toHaveValue('#2F80ED'))
    await expect(canvas.getByText('Committed highlight: #2f80ed')).toBeVisible()

    await expect(canvas.getByRole('textbox', {name: 'Brand'})).toHaveAttribute('readonly')
    await expect(canvas.getByRole('textbox', {name: 'Replay cursor'})).toBeDisabled()
  },
}
