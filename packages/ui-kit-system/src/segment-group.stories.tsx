import {createSignal, For, Show, type Component} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import Monitor from 'lucide-solid/icons/monitor'
import Moon from 'lucide-solid/icons/moon'
import Sun from 'lucide-solid/icons/sun'
import {createStore} from 'solid-js/store'
import {useFieldsetContext} from '@ark-ui/solid/fieldset'
import {FieldShell} from './field-shell.js'
import {SegmentGroup} from './segment-group.js'

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
    <SegmentGroup.Root defaultValue="Appearance" orientation="vertical" aria-label="Section">
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
const NOTE = 'text-[0.75rem] text-chat-text-2'
const THEMES = [
  {value: 'auto', label: 'Auto', icon: Monitor},
  {value: 'light', label: 'Light', icon: Sun},
  {value: 'dark', label: 'Dark', icon: Moon},
]
const SIZES = [
  {value: 'small', label: 'Small'},
  {value: 'medium', label: 'Medium'},
  {value: 'large', label: 'Large'},
]

type Segment = {value: string; label: string; icon?: Component<{class?: string; 'aria-hidden'?: 'true'}>}

function Segments(props: {
  options: Segment[]
  value: string
  disabled?: boolean
  readOnly?: boolean
  onValueChange?: (value: string) => void
}) {
  const fieldset = useFieldsetContext()
  return (
    <SegmentGroup.Root
      class="self-start"
      value={props.value}
      disabled={props.disabled}
      readOnly={props.readOnly}
      ids={{label: fieldset?.().ids.legend}}
      onValueChange={(details) => {
        if (details.value !== null) props.onValueChange?.(details.value)
      }}
    >
      <SegmentGroup.Indicator />
      <For each={props.options}>
        {(option) => (
          <SegmentGroup.Item value={option.value}>
            <SegmentGroup.ItemText>
              <Show when={option.icon}>
                {(icon) => {
                  const Icon = icon()
                  return <Icon class="size-3.5" aria-hidden="true" />
                }}
              </Show>
              {option.label}
            </SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  )
}

function SegmentStates() {
  const [state, setState] = createStore({theme: 'auto', size: 'large'})
  const sizeError = () => (state.size === 'large' ? 'Large is out of stock.' : undefined)
  return (
    <div class={STACK}>
      <FieldShell label="Theme" description="Auto follows the system." group>
        <Segments options={THEMES} value={state.theme} onValueChange={(theme) => setState('theme', theme)} />
      </FieldShell>
      <FieldShell label="Size" group error={sizeError()}>
        <Segments options={SIZES} value={state.size} onValueChange={(size) => setState('size', size)} />
      </FieldShell>
      <FieldShell label="Units" group>
        <Segments
          options={[
            {value: 'metric', label: 'Metric'},
            {value: 'imperial', label: 'Imperial'},
          ]}
          value="metric"
          readOnly
        />
      </FieldShell>
      <FieldShell label="Layout" description="Needs a wider window." group disabled>
        <Segments
          options={[
            {value: 'list', label: 'List'},
            {value: 'grid', label: 'Grid'},
          ]}
          value="list"
          disabled
        />
      </FieldShell>
      <p class={NOTE}>
        Theme {state.theme}, size {state.size}
      </p>
    </div>
  )
}

export const States: Story = {render: () => <SegmentStates />}

export const Keyboard: Story = {
  render: () => <SegmentStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', {name: 'Size'})).toHaveAccessibleDescription(/Large is out of stock\./)

    const theme = within(canvas.getByRole('group', {name: 'Theme'}))
    const auto = theme.getByRole('radio', {name: 'Auto'})
    await userEvent.click(auto)
    await expect(auto).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    const light = theme.getByRole('radio', {name: 'Light'})
    await waitFor(() => expect(light).toBeChecked())
    await expect(light).toHaveFocus()
    await expect(canvas.getByText('Theme light, size large')).toBeVisible()

    const size = within(canvas.getByRole('group', {name: 'Size'}))
    await userEvent.click(size.getByText('Medium'))
    await waitFor(() => expect(size.getByRole('radio', {name: 'Medium'})).toBeChecked())
    await expect(canvas.queryByText('Large is out of stock.')).toBeNull()

    const units = within(canvas.getByRole('group', {name: 'Units'}))
    await userEvent.click(units.getByText('Imperial'))
    await expect(units.getByRole('radio', {name: 'Metric'})).toBeChecked()
    await expect(within(canvas.getByRole('group', {name: 'Layout'})).getByRole('radio', {name: 'Grid'})).toBeDisabled()
  },
}
