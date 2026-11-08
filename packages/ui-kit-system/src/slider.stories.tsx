import {createSignal, For, Show} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {useFieldContext} from '@ark-ui/solid/field'
import {FieldShell} from './field-shell.js'
import {NumberInput} from './number-input.js'
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
const MARKER = 'font-chat-mono text-[0.625rem] text-chat-text-3 -translate-x-1/2'

function SliderWithInput(props: {
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  marks?: number[]
  onValueChange?: (value: number) => void
}) {
  const field = useFieldContext()
  return (
    <div class="flex gap-3 items-start">
      <Slider.Root
        class="pt-2.5 flex-1"
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={props.step}
        disabled={field?.().disabled}
        readOnly={field?.().readOnly}
        invalid={field?.().invalid}
        ids={{label: field?.().ids.label}}
        onValueChange={(details) => {
          const [next] = details.value
          if (next !== undefined) props.onValueChange?.(next)
        }}
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumb index={0} aria-describedby={field?.().ariaDescribedby}>
            <Slider.HiddenInput />
          </Slider.Thumb>
        </Slider.Control>
        <Show when={props.marks}>
          {(marks) => (
            <Slider.MarkerGroup class="mx-[0.4375rem] h-3.5 relative" aria-hidden="true">
              <For each={marks()}>
                {(mark) => (
                  <Slider.Marker value={mark} class={MARKER}>
                    {mark}
                  </Slider.Marker>
                )}
              </For>
            </Slider.MarkerGroup>
          )}
        </Show>
      </Slider.Root>
      <NumberInput
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        unit={props.unit}
        onValueChange={(value) => {
          if (value !== undefined) props.onValueChange?.(value)
        }}
      />
    </div>
  )
}

function SliderStates() {
  const [state, setState] = createStore({volume: 40, quality: 70, size: 28})
  return (
    <div class={STACK}>
      <FieldShell label="Volume" description="Applies to every sound.">
        <SliderWithInput
          value={state.volume}
          min={0}
          max={100}
          unit="%"
          onValueChange={(volume) => setState('volume', volume)}
        />
      </FieldShell>
      <FieldShell label="Image quality">
        <SliderWithInput
          value={state.quality}
          min={10}
          max={100}
          step={10}
          unit="%"
          marks={[10, 50, 100]}
          onValueChange={(quality) => setState('quality', quality)}
        />
      </FieldShell>
      <FieldShell label="Font size" error={state.size > 24 ? 'Sizes above 24 px may not fit.' : undefined}>
        <SliderWithInput
          value={state.size}
          min={10}
          max={32}
          unit="px"
          onValueChange={(size) => setState('size', size)}
        />
      </FieldShell>
      <FieldShell label="Opacity" readOnly>
        <SliderWithInput value={80} min={0} max={100} unit="%" />
      </FieldShell>
      <FieldShell label="Balance" description="Connect speakers first." disabled>
        <SliderWithInput value={50} min={0} max={100} />
      </FieldShell>
    </div>
  )
}

export const States: Story = {render: () => <SliderStates />}

export const Keyboard: Story = {
  render: () => <SliderStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const volume = canvas.getByRole('slider', {name: 'Volume'})
    await expect(volume).toHaveAccessibleDescription('Applies to every sound.')
    await expect(canvas.getByRole('slider', {name: 'Font size'})).toHaveAccessibleDescription(
      /Sizes above 24 px may not fit\./,
    )

    await userEvent.tab()
    await expect(volume).toHaveFocus()
    await expect(volume.matches(':focus-visible')).toBe(true)
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(volume).toHaveAttribute('aria-valuenow', '41'))
    await userEvent.keyboard('{End}')
    await waitFor(() => expect(volume).toHaveAttribute('aria-valuenow', '100'))

    await userEvent.tab()
    const volumeNumber = canvas.getByRole('spinbutton', {name: 'Volume'})
    await expect(volumeNumber).toHaveFocus()
    await expect(volumeNumber).toHaveValue('100')
    await userEvent.clear(volumeNumber)
    await userEvent.type(volumeNumber, '25{Enter}')
    await waitFor(() => expect(volume).toHaveAttribute('aria-valuenow', '25'))

    const size = canvas.getByRole('slider', {name: 'Font size'})
    await userEvent.click(size)
    await userEvent.keyboard('{Home}')
    await waitFor(() => expect(size).toHaveAttribute('aria-valuenow', '10'))
    await expect(canvas.queryByText('Sizes above 24 px may not fit.')).toBeNull()

    const opacity = canvas.getByRole('slider', {name: 'Opacity'})
    await userEvent.click(opacity)
    await userEvent.keyboard('{ArrowRight}')
    await expect(opacity).toHaveAttribute('aria-valuenow', '80')
    await expect(canvas.getByRole('slider', {name: 'Balance'})).toHaveAttribute('aria-disabled', 'true')
  },
}
