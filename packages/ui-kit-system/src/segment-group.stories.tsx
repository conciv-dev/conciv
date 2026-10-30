import {createSignal, For} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {SegmentGroup} from './segment-group.js'

const meta: Meta = {title: 'ui-kit-system/SegmentGroup'}
export default meta
type Story = StoryObj

const MODES = ['Side', 'Overlay', 'Diff']

export const Default: Story = {
  render: () => {
    const [mode, setMode] = createSignal('Side')
    return (
      <div>
        <SegmentGroup.Root value={mode()} onValueChange={(details) => setMode(details.value ?? 'Side')}>
          <SegmentGroup.Indicator />
          <For each={MODES}>
            {(item) => (
              <SegmentGroup.Item value={item}>
                <SegmentGroup.ItemText>{item}</SegmentGroup.ItemText>
                <SegmentGroup.ItemControl />
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )}
          </For>
        </SegmentGroup.Root>
        <div>Mode: {mode()}</div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Mode: Side')).toBeVisible()
    await userEvent.click(c.getByText('Overlay'))
    await waitFor(() => expect(c.getByText('Mode: Overlay')).toBeVisible())
  },
}

export const Disabled: Story = {
  render: () => (
    <SegmentGroup.Root defaultValue="Side" disabled>
      <SegmentGroup.Indicator />
      <For each={MODES}>
        {(item) => (
          <SegmentGroup.Item value={item}>
            <SegmentGroup.ItemText>{item}</SegmentGroup.ItemText>
            <SegmentGroup.ItemControl />
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('radio', {name: 'Overlay'})).toBeDisabled()
  },
}
