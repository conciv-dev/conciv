import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Slider} from './slider.js'

const meta: Meta = {title: 'ui-kit-system/Slider'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [value, setValue] = createSignal([40])
    return (
      <div class="w-60">
        <Slider.Root value={value()} onValueChange={(details) => setValue(details.value)}>
          <Slider.Label>Opacity</Slider.Label>
          <Slider.Control>
            <Slider.Track>
              <Slider.Range />
            </Slider.Track>
            <Slider.Thumb index={0}>
              <Slider.HiddenInput />
            </Slider.Thumb>
          </Slider.Control>
        </Slider.Root>
        <div>Value: {value()[0]}</div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Value: 40')).toBeVisible()
    c.getByRole('slider').focus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(c.getByText('Value: 41')).toBeVisible())
  },
}

export const Disabled: Story = {
  render: () => (
    <div class="w-60">
      <Slider.Root defaultValue={[60]} disabled>
        <Slider.Label>Opacity</Slider.Label>
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumb index={0}>
            <Slider.HiddenInput />
          </Slider.Thumb>
        </Slider.Control>
      </Slider.Root>
    </div>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByRole('slider')).toHaveAttribute('aria-disabled', 'true')
  },
}
