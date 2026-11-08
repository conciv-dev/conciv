import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/ComboboxSelect'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const DEVICES = [
  {value: 'iphone-16', label: 'iPhone 16', meta: 'iOS 18.2'},
  {value: 'iphone-16-pro', label: 'iPhone 16 Pro', meta: 'iOS 18.2'},
  {value: 'ipad-air', label: 'iPad Air', meta: 'iPadOS 18.2'},
  {value: 'pixel-9', label: 'Pixel 9', meta: 'Android 15'},
]

function validateCombobox({value}: {value: {tablet: string}}) {
  return {fields: {tablet: value.tablet === 'ipad-air' ? 'iPad Air is not installed.' : undefined}}
}

function ComboboxSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {
      device: 'iphone-16',
      fallback: 'pixel-9',
      tablet: 'ipad-air',
      pinned: 'iphone-16-pro',
      cloud: 'iphone-16',
    },
    validators: {onMount: validateCombobox, onBlur: validateCombobox},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="device">
        {(field) => (
          <field.ComboboxField
            label="Simulator device"
            description="Type to filter installed runtimes."
            options={DEVICES}
            emptyText="No installed device matches"
          />
        )}
      </form.AppField>
      <form.AppField name="fallback">
        {(field) => (
          <field.ComboboxField
            label="Fallback device"
            options={DEVICES}
            changed={values().fallback !== 'iphone-16'}
            onReset={() => form.setFieldValue('fallback', 'iphone-16')}
          />
        )}
      </form.AppField>
      <form.AppField name="tablet">
        {(field) => <field.ComboboxField label="Tablet device" options={DEVICES} />}
      </form.AppField>
      <form.AppField name="pinned">
        {(field) => <field.ComboboxField label="Pinned device" options={DEVICES} locked="Set in conciv.config.ts" />}
      </form.AppField>
      <form.AppField name="cloud">
        {(field) => (
          <field.ComboboxField label="Cloud device" description="Needs a cloud project." options={DEVICES} disabled />
        )}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <ComboboxSettings />}

export const SettingKeyboard: Story = {
  render: () => <ComboboxSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const device = canvas.getByRole('combobox', {name: 'Simulator device'})
    await expect(device).toHaveAccessibleDescription('Type to filter installed runtimes.')
    await expect(canvas.getByRole('combobox', {name: 'Tablet device'})).toHaveAccessibleDescription(
      /iPad Air is not installed\./,
    )

    await userEvent.click(device)
    await userEvent.clear(device)
    await userEvent.type(device, 'pix')
    await expect(page.getByRole('option', {name: /Pixel 9/})).toBeVisible()
    await expect(page.queryByRole('option', {name: /iPhone 16 Pro/})).toBeNull()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(device).toHaveValue('Pixel 9'))
    await expect(device).toHaveFocus()
    await expect(canvas.getByText('Committed device: pixel-9')).toBeVisible()

    await userEvent.clear(device)
    await userEvent.type(device, 'zzz')
    await expect(page.getByText('No installed device matches')).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    const fallback = canvas.getByRole('combobox', {name: 'Fallback device'})
    await waitFor(() => expect(fallback).toHaveValue('iPhone 16'))
    await expect(fallback).toHaveFocus()
    await expect(canvas.getByText('Committed fallback: iphone-16')).toBeVisible()

    await expect(canvas.getByRole('combobox', {name: 'Pinned device'})).toHaveAttribute('readonly')
    await expect(canvas.getByRole('combobox', {name: 'Cloud device'})).toBeDisabled()
  },
}
