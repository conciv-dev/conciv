import {For} from 'solid-js'
import {createStore} from 'solid-js/store'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import Monitor from 'lucide-solid/icons/monitor'
import Moon from 'lucide-solid/icons/moon'
import Sun from 'lucide-solid/icons/sun'
import {z} from 'zod'
import {mapValues} from 'es-toolkit'
import {Button} from './button.js'
import {ClipboardCopyButton} from './clipboard-copy-button.js'
import {ConfirmDialog} from './confirm-dialog.js'
import {FieldShell} from './field-shell.js'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/Settings form'}
export default meta
type Story = StoryObj

const DEVICES = [
  {value: 'iphone-17-pro', label: 'iPhone 17 Pro'},
  {value: 'iphone-17', label: 'iPhone 17'},
  {value: 'iphone-air', label: 'iPhone Air'},
  {value: 'iphone-16e', label: 'iPhone 16e'},
  {value: 'iphone-se', label: 'iPhone SE'},
]

const BOOT_DEVICES = [
  {value: 'ipad-pro-13', label: 'iPad Pro 13', meta: 'iOS 26.1'},
  {value: 'ipad-air-11', label: 'iPad Air 11', meta: 'iOS 26.1'},
  {value: 'ipad-mini', label: 'iPad mini', meta: 'iOS 18.4'},
  {value: 'iphone-17-pro', label: 'iPhone 17 Pro', meta: 'iOS 26.1'},
  {value: 'iphone-se', label: 'iPhone SE', meta: 'iOS 18.4'},
  {value: 'vision-pro', label: 'Apple Vision Pro', meta: 'visionOS 26'},
]

const CAPTURE = [
  {value: 'console', label: 'Console'},
  {value: 'network', label: 'Network'},
  {value: 'storage', label: 'Storage'},
  {value: 'errors', label: 'Errors'},
]

const MASKING = [
  {value: 'none', title: 'None', description: 'Record everything as typed.'},
  {value: 'inputs', title: 'Inputs', description: 'Replace text typed into fields with dots.'},
  {value: 'sensitive', title: 'Sensitive', description: 'Also hide emails, tokens and card numbers on the page.'},
]

const SCHEMES = [
  {value: 'auto', label: 'Auto', icon: Monitor},
  {value: 'light', label: 'Light', icon: Sun},
  {value: 'dark', label: 'Dark', icon: Moon},
]

const PRESETS = ['#c9857f', '#5fb3d9', '#6fbf8b', '#d6a25e', '#b48ad9']

const schema = z.object({
  scheme: z.enum(['auto', 'light', 'dark']),
  console: z.boolean(),
  network: z.boolean(),
  upload: z.boolean(),
  masking: z.enum(['none', 'inputs', 'sensitive']),
  simulator: z.string(),
  bootDevice: z.string(),
  windowMinutes: z.number().int().min(1, 'Keep at least 1 minute.').max(60, 'Keep at most 60 minutes.'),
  port: z
    .number('Enter a port.')
    .int()
    .min(1024, 'Use a port from 1024 to 65535.')
    .max(65535, 'Use a port from 1024 to 65535.'),
  bundleId: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/, 'Use reverse-DNS, like dev.conciv.app.'),
  designUrl: z.string(),
  instructions: z.string().max(2000, 'Keep it under 2,000 characters.'),
  token: z.string(),
  ignore: z.array(z.string()),
  capture: z.array(z.string()).min(1, 'Pick at least one.'),
  highlight: z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a hex color.'),
  hotkey: z.string().nullable(),
})

type Settings = z.infer<typeof schema>

const DEFAULTS: Settings = {
  scheme: 'auto',
  console: true,
  network: false,
  upload: false,
  masking: 'inputs',
  simulator: 'iphone-17-pro',
  bootDevice: 'ipad-pro-13',
  windowMinutes: 10,
  port: 4610,
  bundleId: 'dev.conciv.app',
  designUrl: 'figma.com/design/Abc123/App',
  instructions: 'Prefer SwiftUI. Never touch the Xcode project file by hand.',
  token: 'figd_0000000000000000',
  ignore: ['.ad-banner', '#cookie-bar'],
  capture: ['console', 'network', 'errors'],
  highlight: '#c9857f',
  hotkey: 'Mod+Shift+R',
}

const LIST = 'flex flex-col gap-5 w-120 max-w-full'
const SECTION = 'flex flex-col gap-5 pb-5 [border-block-end:1px_solid_var(--chat-line-soft)]'
const LOG =
  'flex flex-col gap-1 m-0 p-3 rounded-chat-surface-md bg-chat-sunken font-chat-mono text-[0.6875rem] text-chat-text-2 list-none'

function SettingsFormDemo() {
  const [log, setLog] = createStore<{entries: string[]; committed: Record<string, string>; confirmOpen: boolean}>({
    entries: [],
    committed: mapValues(DEFAULTS, (value) => JSON.stringify(value)),
    confirmOpen: false,
  })
  const form = useSettingsForm(() => ({
    defaultValues: DEFAULTS,
    validators: {onBlur: schema},
    listeners: {
      onBlur: ({fieldApi}) => {
        const value = JSON.stringify(fieldApi.state.value)
        if (fieldApi.state.meta.errors.length > 0 || log.committed[fieldApi.name] === value) return
        setLog('committed', fieldApi.name, value)
        setLog('entries', (entries) => [...entries, `${fieldApi.name}: ${value}`])
      },
    },
  }))
  const reset = (name: keyof Settings) => form.resetField(name)
  const values = form.useStore((state) => state.values)
  const changed = (name: keyof Settings) => JSON.stringify(values()[name]) !== JSON.stringify(DEFAULTS[name])
  return (
    <div class={LIST}>
      <section class={SECTION} aria-label="Appearance">
        <form.AppField name="scheme">
          {(field) => (
            <field.SegmentField
              label="Color mode"
              description="Auto follows the page, then your system."
              options={SCHEMES}
              changed={changed('scheme')}
              onReset={() => reset('scheme')}
            />
          )}
        </form.AppField>
        <form.AppField name="highlight">
          {(field) => (
            <field.ColorField
              label="Highlight color"
              description="Outline drawn around picked elements."
              presets={PRESETS}
              changed={changed('highlight')}
              onReset={() => reset('highlight')}
            />
          )}
        </form.AppField>
      </section>
      <section class={SECTION} aria-label="Recording">
        <form.AppField name="console">
          {(field) => (
            <field.SwitchField
              label="Capture console"
              description="Console messages ride along with the replay."
              changed={changed('console')}
              onReset={() => reset('console')}
            />
          )}
        </form.AppField>
        <form.AppField name="network">
          {(field) => <field.SwitchField label="Record network" locked="Set in vite.config.ts" />}
        </form.AppField>
        <form.AppField name="upload">
          {(field) => <field.SwitchField label="Upload replays" description="Needs a cloud project." disabled />}
        </form.AppField>
        <form.AppField name="masking">
          {(field) => (
            <field.RadioCardsField
              label="Mask in replays"
              options={MASKING}
              changed={changed('masking')}
              onReset={() => reset('masking')}
            />
          )}
        </form.AppField>
        <form.AppField name="capture">
          {(field) => (
            <field.CheckboxGroupField
              label="Capture with the replay"
              options={CAPTURE}
              changed={changed('capture')}
              onReset={() => reset('capture')}
            />
          )}
        </form.AppField>
        <form.AppField name="windowMinutes">
          {(field) => (
            <field.SliderField
              label="Keep the last"
              description="Older events are dropped."
              min={1}
              max={60}
              unit="min"
              marks={[1, 15, 30, 45, 60]}
              changed={changed('windowMinutes')}
              onReset={() => reset('windowMinutes')}
            />
          )}
        </form.AppField>
        <form.AppField name="ignore">
          {(field) => (
            <field.TagsField
              label="Ignore selectors"
              description="Enter or comma adds, Backspace removes the last."
              placeholder="Add selector"
              changed={changed('ignore')}
              onReset={() => reset('ignore')}
            />
          )}
        </form.AppField>
        <form.AppField name="hotkey">
          {(field) => (
            <field.HotkeyField
              label="Start or stop recording"
              conflict={(hotkey) =>
                hotkey === 'Mod+Shift+C' ? 'Also used by Compare with the design. Saving moves it here.' : undefined
              }
              changed={changed('hotkey')}
              onReset={() => reset('hotkey')}
            />
          )}
        </form.AppField>
      </section>
      <section class={SECTION} aria-label="Simulator">
        <form.AppField name="simulator">
          {(field) => (
            <field.SelectField
              label="Simulator"
              description="Device the app boots on."
              options={DEVICES}
              changed={changed('simulator')}
              onReset={() => reset('simulator')}
            />
          )}
        </form.AppField>
        <form.AppField name="bootDevice">
          {(field) => (
            <field.ComboboxField
              label="Preview device"
              description="Type to filter the installed runtimes."
              options={BOOT_DEVICES}
              placeholder="Search devices"
              changed={changed('bootDevice')}
              onReset={() => reset('bootDevice')}
            />
          )}
        </form.AppField>
        <form.AppField name="port">
          {(field) => (
            <field.NumberField
              label="Port"
              description="Where the simulator bridge listens."
              min={1024}
              max={65535}
              changed={changed('port')}
              onReset={() => reset('port')}
            />
          )}
        </form.AppField>
        <form.AppField name="bundleId">
          {(field) => (
            <field.TextField label="Bundle id" mono changed={changed('bundleId')} onReset={() => reset('bundleId')} />
          )}
        </form.AppField>
        <form.AppField name="designUrl">
          {(field) => (
            <field.TextField
              label="Design file"
              description="Figma or image URL the design check compares against."
              mono
              addonStart="https://"
              action={<ClipboardCopyButton text={`https://${field().state.value}`} class="size-8" />}
              changed={changed('designUrl')}
              onReset={() => reset('designUrl')}
            />
          )}
        </form.AppField>
        <form.AppField name="token">
          {(field) => (
            <field.PasswordField
              label="Figma token"
              description="Kept in ~/.conciv on this machine, never in the project file."
              copyable
              changed={changed('token')}
              onReset={() => reset('token')}
            />
          )}
        </form.AppField>
        <form.AppField name="instructions">
          {(field) => (
            <field.TextAreaField
              label="Extra instructions for the agent"
              description="Added to the system prompt when this extension is on."
              maxLength={2000}
              changed={changed('instructions')}
              onReset={() => reset('instructions')}
            />
          )}
        </form.AppField>
      </section>
      <FieldShell label="Reset all settings" description="Chats and history are kept." layout="row">
        <Button variant="outline-danger" onClick={() => setLog('confirmOpen', true)}>
          Reset all
        </Button>
      </FieldShell>
      <ConfirmDialog
        open={log.confirmOpen}
        onOpenChange={(open) => setLog('confirmOpen', open)}
        title="Reset all settings for this project?"
        description="Views, shortcuts and extension settings go back to their defaults. Values set in vite.config.ts stay."
        confirmLabel="Reset all"
        onConfirm={() => {
          form.reset()
          setLog(
            'committed',
            mapValues(DEFAULTS, (value) => JSON.stringify(value)),
          )
          setLog('entries', (entries) => [...entries, 'reset all'])
        }}
      />
      <ol class={LOG} role="log" aria-label="Committed values">
        <For each={log.entries} fallback={<li>No commits yet</li>}>
          {(entry) => <li>{entry}</li>}
        </For>
      </ol>
    </div>
  )
}

export const Default: Story = {
  render: () => <SettingsFormDemo />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const log = canvas.getByRole('log', {name: 'Committed values'})

    const port = canvas.getByRole('spinbutton', {name: 'Port'})
    await userEvent.tripleClick(port)
    await userEvent.keyboard('80')
    await userEvent.tab()
    await expect(await canvas.findByText('Use a port from 1024 to 65535.')).toBeVisible()
    await expect(port).toHaveAttribute('aria-invalid', 'true')
    await expect(within(log).queryByText(/^port:/)).toBeNull()

    await userEvent.tripleClick(port)
    await userEvent.keyboard('4700{Enter}')
    await expect(await within(log).findByText('port: 4700')).toBeVisible()
    await expect(canvas.queryByText('Use a port from 1024 to 65535.')).toBeNull()
    await expect(port).toHaveFocus()

    const consoleSwitch = canvas.getByRole('switch', {name: 'Capture console'})
    await userEvent.click(consoleSwitch)
    await expect(await within(log).findByText('console: false')).toBeVisible()
    const consoleField = consoleSwitch.closest('[data-part="root"][data-scope="field"]')
    if (!(consoleField instanceof HTMLElement)) throw new Error('the switch sits outside its field shell')
    await expect(consoleSwitch).toHaveFocus()
    await userEvent.tab({shift: true})
    const reset = within(consoleField).getByRole('button', {name: 'Reset to default'})
    await expect(reset).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(consoleSwitch).toBeChecked())
    await expect(consoleSwitch).toHaveFocus()
    await expect(consoleSwitch.matches(':focus-visible')).toBe(true)
    await expect(within(consoleField).queryByRole('button', {name: 'Reset to default'})).toBeNull()

    const bundle = canvas.getByRole('textbox', {name: 'Bundle id'})
    await userEvent.clear(bundle)
    await userEvent.type(bundle, 'conciv app')
    await userEvent.tab()
    await expect(await canvas.findByText('Use reverse-DNS, like dev.conciv.app.')).toBeVisible()
    await expect(bundle).toHaveAccessibleDescription('Use reverse-DNS, like dev.conciv.app.')

    await userEvent.click(canvas.getByRole('button', {name: 'Reset all'}))
    const dialog = await within(document.body).findByRole('alertdialog', {name: 'Reset all settings for this project?'})
    await waitFor(() => expect(within(dialog).getByRole('button', {name: 'Cancel'})).toHaveFocus())
    await userEvent.click(within(dialog).getByRole('button', {name: 'Reset all'}))
    await expect(await within(log).findByText('reset all')).toBeVisible()
    await expect(bundle).toHaveValue('dev.conciv.app')
  },
}
