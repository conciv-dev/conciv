import {createSignal, For} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import Monitor from 'lucide-solid/icons/monitor'
import Moon from 'lucide-solid/icons/moon'
import Sun from 'lucide-solid/icons/sun'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {SegmentGroup} from './segment-group.js'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/SegmentGroup'}
export default meta
type Story = StoryObj

const DENSITIES = ['Comfortable', 'Cozy', 'Compact']

export const Default: Story = {
  render: () => {
    const [density, setDensity] = createSignal('Cozy')
    return (
      <div>
        <SegmentGroup.Root
          value={density()}
          onValueChange={(details) => setDensity(details.value ?? 'Cozy')}
          aria-label="Thread density"
        >
          <SegmentGroup.Indicator />
          <For each={DENSITIES}>
            {(option) => (
              <SegmentGroup.Item value={option}>
                <SegmentGroup.ItemText>{option}</SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )}
          </For>
        </SegmentGroup.Root>
        <div>Density: {density()}</div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Density: Cozy')).toBeVisible()
    await userEvent.click(canvas.getByText('Compact'))
    await waitFor(() => expect(canvas.getByText('Density: Compact')).toBeVisible())
  },
}

const SCHEMES = [
  {value: 'auto', label: 'Auto', icon: Monitor},
  {value: 'light', label: 'Light', icon: Sun},
  {value: 'dark', label: 'Dark', icon: Moon},
]

export const Scheme: Story = {
  render: () => {
    const [scheme, setScheme] = createSignal('auto')
    return (
      <div>
        <SegmentGroup.Root
          value={scheme()}
          onValueChange={(details) => setScheme(details.value ?? 'auto')}
          aria-label="Appearance"
        >
          <SegmentGroup.Indicator />
          <For each={SCHEMES}>
            {(option) => (
              <SegmentGroup.Item value={option.value}>
                <SegmentGroup.ItemText>
                  <option.icon size={14} aria-hidden="true" />
                  {option.label}
                </SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )}
          </For>
        </SegmentGroup.Root>
        <div>Scheme: {scheme()}</div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Scheme: auto')).toBeVisible()
    await userEvent.click(canvas.getByText('Dark'))
    await waitFor(() => expect(canvas.getByText('Scheme: dark')).toBeVisible())
  },
}

export const Vertical: Story = {
  render: () => (
    <SegmentGroup.Root defaultValue="Appearance" orientation="vertical" aria-label="Settings section">
      <SegmentGroup.Indicator />
      <For each={['Appearance', 'Behaviour', 'Advanced']}>
        {(section) => (
          <SegmentGroup.Item value={section}>
            <SegmentGroup.ItemText>{section}</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  ),
}

export const Disabled: Story = {
  render: () => (
    <SegmentGroup.Root defaultValue="Auto" aria-label="Colour scheme">
      <SegmentGroup.Indicator />
      <For each={['Auto', 'Light', 'Dark']}>
        {(option) => (
          <SegmentGroup.Item value={option} disabled={option === 'Dark'}>
            <SegmentGroup.ItemText>{option}</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  ),
}

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const SCHEME_OPTIONS = [
  {value: 'auto', label: 'Auto', icon: Monitor},
  {value: 'light', label: 'Light', icon: Sun},
  {value: 'dark', label: 'Dark', icon: Moon},
]
const DENSITY_OPTIONS = DENSITIES.map((density) => ({value: density.toLowerCase(), label: density}))

const segmentSchema = z.object({
  scheme: z.string(),
  density: z.string(),
  dock: z.string().refine((value) => value !== 'float', 'Floating needs a wider window.'),
  locale: z.string(),
  motion: z.string(),
})

function SegmentSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {scheme: 'auto', density: 'compact', dock: 'float', locale: 'auto', motion: 'auto'},
    validators: {onMount: segmentSchema, onBlur: segmentSchema},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="scheme">
        {(field) => (
          <field.SegmentField label="Color scheme" description="Auto follows the system." options={SCHEME_OPTIONS} />
        )}
      </form.AppField>
      <form.AppField name="density">
        {(field) => (
          <field.SegmentField
            label="Thread density"
            options={DENSITY_OPTIONS}
            changed={values().density !== 'cozy'}
            onReset={() => form.setFieldValue('density', 'cozy')}
          />
        )}
      </form.AppField>
      <form.AppField name="dock">
        {(field) => (
          <field.SegmentField
            label="Dock"
            options={[
              {value: 'left', label: 'Left'},
              {value: 'right', label: 'Right'},
              {value: 'float', label: 'Float'},
            ]}
          />
        )}
      </form.AppField>
      <form.AppField name="locale">
        {(field) => (
          <field.SegmentField
            label="Number format"
            options={[
              {value: 'auto', label: 'Auto'},
              {value: 'en', label: 'English'},
            ]}
            locked="Set by your organization"
          />
        )}
      </form.AppField>
      <form.AppField name="motion">
        {(field) => (
          <field.SegmentField
            label="Motion"
            options={[
              {value: 'auto', label: 'Auto'},
              {value: 'off', label: 'Off'},
            ]}
            description="Follows the system setting in this browser."
            disabled
          />
        )}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <SegmentSettings />}

export const SettingKeyboard: Story = {
  render: () => <SegmentSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', {name: 'Dock'})).toHaveAccessibleDescription(
      /Floating needs a wider window\./,
    )

    const auto = within(canvas.getByRole('group', {name: 'Color scheme'})).getByRole('radio', {name: 'Auto'})
    await userEvent.click(auto)
    await expect(auto).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    const light = within(canvas.getByRole('group', {name: 'Color scheme'})).getByRole('radio', {name: 'Light'})
    await waitFor(() => expect(light).toBeChecked())
    await expect(canvas.getByText('Committed scheme: light')).toBeVisible()

    const density = within(canvas.getByRole('group', {name: 'Thread density'}))
    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    await waitFor(() => expect(density.getByRole('radio', {name: 'Cozy'})).toBeChecked())
    await expect(density.getByRole('radio', {name: 'Cozy'})).toHaveFocus()
    await expect(canvas.getByText('Committed density: cozy')).toBeVisible()
    await expect(canvas.queryByRole('button', {name: 'Reset to default'})).toBeNull()

    const locked = within(canvas.getByRole('group', {name: 'Number format'}))
    await userEvent.click(locked.getByText('English'))
    await expect(locked.getByRole('radio', {name: 'Auto'})).toBeChecked()
    await expect(within(canvas.getByRole('group', {name: 'Motion'})).getByRole('radio', {name: 'Off'})).toBeDisabled()
  },
}
