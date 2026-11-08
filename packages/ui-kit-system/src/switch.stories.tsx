import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {z} from 'zod'
import {useSettingsForm} from './settings-form.js'
import {Switch} from './switch.js'

const meta: Meta = {title: 'ui-kit-system/Switch'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [on, setOn] = createSignal(false)
    return (
      <div>
        <Switch.Root checked={on()} onCheckedChange={(details) => setOn(details.checked)}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Label>Auto-scroll</Switch.Label>
          <Switch.HiddenInput />
        </Switch.Root>
        <div>State: {on() ? 'on' : 'off'}</div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const toggle = c.getByRole('switch', {name: 'Auto-scroll'})
    const control = canvasElement.querySelector('[data-part="control"]')
    if (!(control instanceof HTMLElement)) throw new Error('the switch renders no control')
    const box = control.getBoundingClientRect()
    const y = box.top + box.height / 2
    const drag = (options: {from: number; to: number}) =>
      userEvent.pointer([
        {keys: '[MouseLeft>]', target: control, coords: {clientX: box.left + options.from, clientY: y}},
        {target: control, coords: {clientX: box.left + (options.from + options.to) / 2, clientY: y}},
        {target: control, coords: {clientX: box.left + options.to, clientY: y}},
        {keys: '[/MouseLeft]', target: control},
      ])
    await expect(c.getByText('State: off')).toBeVisible()
    await expect(toggle).not.toBeChecked()

    await userEvent.click(c.getByText('Auto-scroll'))
    await waitFor(() => expect(c.getByText('State: on')).toBeVisible())
    await expect(toggle).toBeChecked()

    await userEvent.click(control)
    await waitFor(() => expect(toggle).not.toBeChecked())

    await drag({from: 8, to: box.width - 2})
    await waitFor(() => expect(toggle).toBeChecked())
    await expect(c.getByText('State: on')).toBeVisible()

    await drag({from: box.width - 8, to: box.width - 13})
    await expect(toggle).toBeChecked()
    await expect(c.getByText('State: on')).toBeVisible()

    await userEvent.pointer([
      {keys: '[MouseLeft>]', target: control, coords: {clientX: box.left + box.width - 8, clientY: y}},
      {target: control, coords: {clientX: box.left + 3, clientY: y}},
      {keys: '[/MouseLeft]', target: control},
    ])
    await waitFor(() => expect(toggle).not.toBeChecked())
    await expect(c.getByText('State: off')).toBeVisible()
  },
}

const STACK = 'flex flex-col gap-5 w-120 max-w-full'

const settingsSchema = z.object({
  console: z.boolean(),
  pause: z.boolean(),
  consent: z.boolean().refine((value) => value, 'Turn this on to send crash reports.'),
  network: z.boolean(),
  upload: z.boolean(),
})

function SwitchSettings() {
  const form = useSettingsForm(() => ({
    defaultValues: {console: true, pause: true, consent: false, network: false, upload: false},
    validators: {onMount: settingsSchema, onBlur: settingsSchema},
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="console">
        {(field) => (
          <field.SwitchField label="Capture console" description="Console messages ride along with the replay." />
        )}
      </form.AppField>
      <form.AppField name="pause">
        {(field) => (
          <field.SwitchField
            label="Pause when the tab is hidden"
            changed={values().pause}
            onReset={() => form.setFieldValue('pause', false)}
          />
        )}
      </form.AppField>
      <form.AppField name="consent">
        {(field) => <field.SwitchField label="Send crash reports" description="Required for the beta channel." />}
      </form.AppField>
      <form.AppField name="network">
        {(field) => <field.SwitchField label="Record network" locked="Set in vite.config.ts" />}
      </form.AppField>
      <form.AppField name="upload">
        {(field) => <field.SwitchField label="Upload replays" description="Needs a cloud project." disabled />}
      </form.AppField>
    </div>
  )
}

export const SettingStates: Story = {render: () => <SwitchSettings />}

export const SettingKeyboard: Story = {
  render: () => <SwitchSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const consoleSwitch = canvas.getByRole('switch', {name: 'Capture console'})
    await expect(consoleSwitch).toHaveAccessibleDescription('Console messages ride along with the replay.')
    await expect(canvas.getByRole('switch', {name: 'Send crash reports'})).toHaveAccessibleDescription(
      /Turn this on to send crash reports\./,
    )
    const network = canvas.getByRole('switch', {name: 'Record network'})
    await expect(network).toHaveAttribute('aria-readonly', 'true')
    await expect(network).toHaveAccessibleDescription('Set in vite.config.ts')
    await expect(canvas.getByRole('switch', {name: 'Upload replays'})).toBeDisabled()

    await userEvent.tab()
    await expect(consoleSwitch).toHaveFocus()
    await expect(consoleSwitch.matches(':focus-visible')).toBe(true)
    await userEvent.keyboard(' ')
    await waitFor(() => expect(consoleSwitch).not.toBeChecked())

    const pause = canvas.getByRole('switch', {name: 'Pause when the tab is hidden'})
    await userEvent.tab()
    await expect(canvas.getByRole('button', {name: 'Reset to default'})).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(pause).not.toBeChecked())
    await expect(pause).toHaveFocus()
    await expect(canvas.queryByRole('button', {name: 'Reset to default'})).toBeNull()
    await userEvent.click(canvas.getByText('Record network'))
    await expect(network).not.toBeChecked()
  },
}
