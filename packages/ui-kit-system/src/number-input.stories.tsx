import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/NumberInput'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'

function validateNumbers({value}: {value: {port: number; timeout: number; retries: number}}) {
  return {
    fields: {port: portError(value.port), timeout: timeoutError(value.timeout), retries: retriesError(value.retries)},
  }
}

function portError(port: number) {
  if (!Number.isFinite(port)) return 'Enter a port.'
  if (!Number.isInteger(port)) return 'Invalid input: expected int, received number'
  if (port < 1024 || port > 65535) return 'Use a port from 1024 to 65535.'
  return undefined
}

function timeoutError(timeout: number) {
  if (!Number.isFinite(timeout)) return 'Enter a timeout.'
  if (timeout < 1) return 'Too small: expected number to be >=1'
  if (timeout > 600) return 'Too big: expected number to be <=600'
  return undefined
}

function retriesError(retries: number) {
  if (!Number.isFinite(retries)) return 'Enter a count.'
  if (retries > 5) return 'At most 5 retries.'
  return undefined
}

function NumberSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {port: 4700, timeout: 90, retries: 9, workers: 4, fps: 30},
    validators: {onMount: validateNumbers, onBlur: validateNumbers},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="port">
        {(field) => (
          <field.NumberField label="Port" description="Where the dev server listens." min={1024} max={65535} />
        )}
      </form.AppField>
      <form.AppField name="timeout">
        {(field) => (
          <field.NumberField
            label="Turn timeout"
            unit="s"
            min={1}
            max={600}
            changed={values().timeout !== 60}
            onReset={() => form.setFieldValue('timeout', 60)}
          />
        )}
      </form.AppField>
      <form.AppField name="retries">{(field) => <field.NumberField label="Retries" min={0} />}</form.AppField>
      <form.AppField name="workers">
        {(field) => <field.NumberField label="Test workers" locked="Set by CI" />}
      </form.AppField>
      <form.AppField name="fps">
        {(field) => <field.NumberField label="Replay frame rate" unit="fps" description="Needs replay on." disabled />}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <NumberSettings />}

export const SettingKeyboard: Story = {
  render: () => <NumberSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const port = canvas.getByRole('spinbutton', {name: 'Port'})
    await expect(port).toHaveAccessibleDescription('Where the dev server listens.')
    await expect(canvas.getByRole('spinbutton', {name: 'Retries'})).toHaveAccessibleDescription(/At most 5 retries\./)

    await userEvent.click(port)
    await userEvent.keyboard('{ArrowUp}')
    await waitFor(() => expect(port).toHaveValue('4701'))
    await expect(canvas.getByText('Committed nothing yet')).toBeVisible()
    await userEvent.keyboard('{PageUp}')
    await waitFor(() => expect(port).toHaveValue('4711'))
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByText('Committed port: 4711')).toBeVisible()
    await expect(port).toHaveFocus()

    await userEvent.clear(port)
    await userEvent.type(port, '80')
    await userEvent.tab()
    await expect(canvas.getByText('Use a port from 1024 to 65535.')).toBeVisible()
    await expect(port).toHaveAttribute('aria-invalid', 'true')
    await expect(canvas.getByText('Committed port: 4711')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    const timeout = canvas.getByRole('spinbutton', {name: 'Turn timeout'})
    await waitFor(() => expect(timeout).toHaveValue('60'))
    await expect(timeout).toHaveFocus()
    await expect(canvas.getByText('Committed timeout: 60')).toBeVisible()

    await expect(canvas.getByRole('spinbutton', {name: 'Test workers'})).toHaveAttribute('readonly')
    await expect(canvas.getByRole('spinbutton', {name: 'Replay frame rate'})).toBeDisabled()
  },
}
