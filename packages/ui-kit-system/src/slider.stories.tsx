import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {useSettingsForm} from './settings-form.js'
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

const STACK = 'flex flex-col gap-5 w-120 max-w-full'

const sliderSchema = z.object({
  volume: z.number(),
  quality: z.number(),
  memory: z.number().max(8, 'More than 8 GB starves the simulator.'),
  cpu: z.number(),
  zoom: z.number(),
})

function SliderSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {volume: 40, quality: 90, memory: 12, cpu: 4, zoom: 100},
    validators: {onMount: sliderSchema, onBlur: sliderSchema},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="volume">
        {(field) => (
          <field.SliderField label="Sound volume" description="Chimes when a turn ends." min={0} max={100} unit="%" />
        )}
      </form.AppField>
      <form.AppField name="quality">
        {(field) => (
          <field.SliderField
            label="Screenshot quality"
            min={10}
            max={100}
            step={10}
            unit="%"
            marks={[10, 50, 100]}
            changed={values().quality !== 70}
            onReset={() => form.setFieldValue('quality', 70)}
          />
        )}
      </form.AppField>
      <form.AppField name="memory">
        {(field) => <field.SliderField label="Simulator memory" min={2} max={16} unit="GB" />}
      </form.AppField>
      <form.AppField name="cpu">
        {(field) => <field.SliderField label="Simulator cores" min={1} max={8} locked="Set by your organization" />}
      </form.AppField>
      <form.AppField name="zoom">
        {(field) => (
          <field.SliderField label="Replay zoom" min={50} max={200} unit="%" description="Needs replay on." disabled />
        )}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <SliderSettings />}

export const SettingKeyboard: Story = {
  render: () => <SliderSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const volume = canvas.getByRole('slider', {name: 'Sound volume'})
    await expect(volume).toHaveAccessibleDescription('Chimes when a turn ends.')
    await expect(canvas.getByRole('slider', {name: 'Simulator memory'})).toHaveAccessibleDescription(
      /More than 8 GB starves the simulator\./,
    )

    await userEvent.tab()
    await expect(volume).toHaveFocus()
    await expect(volume.matches(':focus-visible')).toBe(true)
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(volume).toHaveAttribute('aria-valuenow', '41'))
    await expect(canvas.getByText('Committed volume: 41')).toBeVisible()
    await userEvent.keyboard('{End}')
    await waitFor(() => expect(volume).toHaveAttribute('aria-valuenow', '100'))
    await expect(canvas.getByText('Committed volume: 100')).toBeVisible()

    await userEvent.tab()
    const volumeNumber = canvas.getByRole('spinbutton', {name: 'Sound volume'})
    await expect(volumeNumber).toHaveFocus()
    await expect(volumeNumber).toHaveValue('100')
    await userEvent.clear(volumeNumber)
    await userEvent.type(volumeNumber, '25{Enter}')
    await waitFor(() => expect(volume).toHaveAttribute('aria-valuenow', '25'))
    await expect(canvas.getByText('Committed volume: 25')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    const quality = canvas.getByRole('slider', {name: 'Screenshot quality'})
    await waitFor(() => expect(quality).toHaveAttribute('aria-valuenow', '70'))
    await expect(quality).toHaveFocus()
    await expect(canvas.getByText('Committed quality: 70')).toBeVisible()

    const cores = canvas.getByRole('slider', {name: 'Simulator cores'})
    await expect(cores).toHaveAttribute('aria-readonly', 'true')
    await userEvent.click(cores)
    await userEvent.keyboard('{ArrowRight}')
    await expect(cores).toHaveAttribute('aria-valuenow', '4')
    await expect(canvas.getByRole('slider', {name: 'Replay zoom'})).toHaveAttribute('aria-disabled', 'true')
  },
}
