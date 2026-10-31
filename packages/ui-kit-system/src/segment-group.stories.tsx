import {createSignal, For} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import Monitor from 'lucide-solid/icons/monitor'
import Moon from 'lucide-solid/icons/moon'
import Sun from 'lucide-solid/icons/sun'
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
