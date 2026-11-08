import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/RadioCards'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const RUNNERS = [
  {value: 'vitest', title: 'Vitest', description: 'Runs in the browser through the dev server.'},
  {value: 'playwright', title: 'Playwright', description: 'Drives a separate Chromium. Slower to start.'},
  {value: 'none', title: 'None', description: 'Hide the test panel.'},
]
const SANDBOXES = [
  {value: 'local', title: 'Local process', description: 'Runs in this checkout.'},
  {value: 'container', title: 'Container', description: 'Needs Docker running.'},
]

const radioSchema = z.object({
  runner: z.string(),
  replay: z.string(),
  sandbox: z.string().refine((value) => value !== 'container', 'Docker is not running on this machine.'),
  harness: z.string(),
  storage: z.string(),
})

function RadioCardSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {runner: 'vitest', replay: 'full', sandbox: 'container', harness: 'claude', storage: 'disk'},
    validators: {onMount: radioSchema, onBlur: radioSchema},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="runner">
        {(field) => <field.RadioCardsField label="Test runner" options={RUNNERS} />}
      </form.AppField>
      <form.AppField name="replay">
        {(field) => (
          <field.RadioCardsField
            label="Replay detail"
            description="How much of the page each replay keeps."
            options={[
              {value: 'light', title: 'Light', description: 'Clicks and navigation only.'},
              {value: 'full', title: 'Full', description: 'Every DOM change. Larger files.'},
            ]}
            changed={values().replay !== 'light'}
            onReset={() => form.setFieldValue('replay', 'light')}
          />
        )}
      </form.AppField>
      <form.AppField name="sandbox">
        {(field) => <field.RadioCardsField label="Sandbox" options={SANDBOXES} />}
      </form.AppField>
      <form.AppField name="harness">
        {(field) => (
          <field.RadioCardsField
            label="Harness"
            options={[
              {value: 'claude', title: 'Claude Code'},
              {value: 'codex', title: 'Codex'},
            ]}
            locked="Set in conciv.config.ts"
          />
        )}
      </form.AppField>
      <form.AppField name="storage">
        {(field) => (
          <field.RadioCardsField
            label="Storage"
            description="Cloud storage needs a signed-in project."
            options={[
              {value: 'disk', title: 'Disk'},
              {value: 'cloud', title: 'Cloud'},
            ]}
            disabled
          />
        )}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <RadioCardSettings />}

export const SettingKeyboard: Story = {
  render: () => <RadioCardSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const runner = within(canvas.getByRole('group', {name: 'Test runner'}))
    const vitest = runner.getByRole('radio', {name: 'Vitest'})
    await expect(vitest).toHaveAccessibleDescription('Runs in the browser through the dev server.')
    await expect(canvas.getByRole('group', {name: 'Sandbox'})).toHaveAccessibleDescription(
      /Docker is not running on this machine\./,
    )

    await userEvent.click(runner.getByText('Vitest'))
    await expect(vitest).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    const playwright = runner.getByRole('radio', {name: 'Playwright'})
    await waitFor(() => expect(playwright).toBeChecked())
    await expect(playwright).toHaveFocus()
    await expect(canvas.getByText('Committed runner: playwright')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    const light = within(canvas.getByRole('group', {name: 'Replay detail'})).getByRole('radio', {name: 'Light'})
    await waitFor(() => expect(light).toBeChecked())
    await expect(light).toHaveFocus()
    await expect(canvas.getByText('Committed replay: light')).toBeVisible()

    const harness = within(canvas.getByRole('group', {name: 'Harness'}))
    await userEvent.click(harness.getByText('Codex'))
    await expect(harness.getByRole('radio', {name: 'Claude Code'})).toBeChecked()
    await expect(
      within(canvas.getByRole('group', {name: 'Storage'})).getByRole('radio', {name: 'Cloud'}),
    ).toBeDisabled()
  },
}
