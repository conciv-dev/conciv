import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/Select'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const LEVELS = [
  {value: 'error', label: 'Errors only'},
  {value: 'warn', label: 'Warnings and errors'},
  {value: 'info', label: 'Everything'},
]
const DEVICES = [
  {value: 'iphone-16', label: 'iPhone 16'},
  {value: 'pixel-9', label: 'Pixel 9'},
]

function validateSelects({value}: {value: {device: string}}) {
  return {fields: {device: value.device.length === 0 ? 'Pick a device to boot.' : undefined}}
}

function SelectSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {level: 'warn', retention: '30', device: '', region: 'eu', model: 'default'},
    validators: {onMount: validateSelects, onBlur: validateSelects},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="level">
        {(field) => (
          <field.SelectField label="Console level" description="Which messages ride along." options={LEVELS} />
        )}
      </form.AppField>
      <form.AppField name="retention">
        {(field) => (
          <field.SelectField
            label="Keep replays for"
            options={[
              {value: '7', label: '7 days'},
              {value: '30', label: '30 days'},
            ]}
            changed={values().retention !== '7'}
            onReset={() => form.setFieldValue('retention', '7')}
          />
        )}
      </form.AppField>
      <form.AppField name="device">
        {(field) => <field.SelectField label="Simulator device" options={DEVICES} placeholder="Choose a device" />}
      </form.AppField>
      <form.AppField name="region">
        {(field) => (
          <field.SelectField
            label="Data region"
            options={[
              {value: 'eu', label: 'Europe'},
              {value: 'us', label: 'United States'},
            ]}
            locked="Set by your organization"
          />
        )}
      </form.AppField>
      <form.AppField name="model">
        {(field) => (
          <field.SelectField
            label="Model"
            description="Sign in to choose a model."
            options={[{value: 'default', label: 'Default'}]}
            disabled
          />
        )}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <SelectSettings />}

export const SettingKeyboard: Story = {
  render: () => <SelectSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const level = canvas.getByRole('combobox', {name: 'Console level'})
    await expect(level).toHaveAccessibleDescription('Which messages ride along.')
    await expect(canvas.getByRole('combobox', {name: 'Simulator device'})).toHaveAccessibleDescription(
      /Pick a device to boot\./,
    )

    await userEvent.click(level)
    await expect(page.getByRole('option', {name: 'Warnings and errors'})).toBeVisible()
    await userEvent.click(page.getByRole('option', {name: 'Everything'}))
    await waitFor(() => expect(level).toHaveTextContent('Everything'))
    await expect(level).toHaveFocus()
    await expect(canvas.getByText('Committed level: info')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    const retention = canvas.getByRole('combobox', {name: 'Keep replays for'})
    await waitFor(() => expect(retention).toHaveTextContent('7 days'))
    await expect(retention).toHaveFocus()
    await expect(canvas.getByText('Committed retention: 7')).toBeVisible()

    await expect(canvas.getByRole('combobox', {name: 'Model'})).toBeDisabled()
  },
}
