import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {ComboboxSelect} from './combobox-select.js'
import {FieldShell} from './field-shell.js'

const meta: Meta = {title: 'ui-kit-system/ComboboxSelect'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const NOTE = 'text-[0.75rem] text-chat-text-2'
const CITIES = [
  {value: 'lisbon', label: 'Lisbon', meta: 'Portugal'},
  {value: 'lyon', label: 'Lyon', meta: 'France'},
  {value: 'osaka', label: 'Osaka', meta: 'Japan'},
  {value: 'oslo', label: 'Oslo', meta: 'Norway'},
]

function ComboboxStates() {
  const [state, setState] = createStore({departure: 'lisbon', arrival: 'lisbon'})
  const arrivalError = () => (state.arrival === state.departure ? 'Pick a city other than the departure.' : undefined)
  return (
    <div class={STACK}>
      <FieldShell label="Departure" description="Type to filter the list.">
        <ComboboxSelect
          options={CITIES}
          value={state.departure}
          emptyText="No city matches"
          onValueChange={(value) => setState('departure', value)}
        />
      </FieldShell>
      <FieldShell label="Arrival" error={arrivalError()}>
        <ComboboxSelect options={CITIES} value={state.arrival} onValueChange={(value) => setState('arrival', value)} />
      </FieldShell>
      <FieldShell label="Home city" readOnly>
        <ComboboxSelect options={CITIES} value="oslo" />
      </FieldShell>
      <FieldShell label="Stopover" description="Direct flights only." disabled>
        <ComboboxSelect options={CITIES} value={undefined} placeholder="None" />
      </FieldShell>
      <p class={NOTE}>Departure {state.departure}</p>
    </div>
  )
}

export const States: Story = {render: () => <ComboboxStates />}

export const Keyboard: Story = {
  render: () => <ComboboxStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const departure = canvas.getByRole('combobox', {name: 'Departure'})
    await expect(departure).toHaveAccessibleDescription('Type to filter the list.')
    const arrival = canvas.getByRole('combobox', {name: 'Arrival'})
    await expect(arrival).toHaveAccessibleDescription(/Pick a city other than the departure\./)
    await expect(arrival).toHaveAttribute('aria-invalid', 'true')

    await userEvent.click(departure)
    await userEvent.clear(departure)
    await userEvent.type(departure, 'osa')
    await expect(page.getByRole('option', {name: /Osaka/})).toBeVisible()
    await expect(page.queryByRole('option', {name: /Oslo/})).toBeNull()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(departure).toHaveValue('Osaka'))
    await expect(departure).toHaveFocus()
    await expect(canvas.getByText('Departure osaka')).toBeVisible()
    await expect(canvas.queryByText('Pick a city other than the departure.')).toBeNull()

    await userEvent.clear(departure)
    await userEvent.type(departure, 'zzz')
    await expect(page.getByText('No city matches')).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect(canvas.getByRole('combobox', {name: 'Home city'})).toHaveAttribute('readonly')
    await expect(canvas.getByRole('combobox', {name: 'Stopover'})).toBeDisabled()
  },
}
