import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {FieldShell} from './field-shell.js'
import {NumberInput} from './number-input.js'

const meta: Meta = {title: 'ui-kit-system/NumberInput'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const NOTE = 'text-[0.75rem] text-chat-text-2'

function quantityError(quantity: number | undefined) {
  if (quantity === undefined) return 'Enter a quantity.'
  if (quantity < 1) return 'Order at least 1.'
  return undefined
}

function weightError(weight: number | undefined) {
  if (weight !== undefined && weight > 100) return 'Enter at most 100 kg.'
  return undefined
}

function NumberStates() {
  const [state, setState] = createStore<{quantity: number | undefined; weight: number | undefined; committed: string}>({
    quantity: 3,
    weight: 120,
    committed: 'nothing yet',
  })
  return (
    <div class={STACK}>
      <FieldShell label="Quantity" description="How many to order." layout="row" error={quantityError(state.quantity)}>
        <NumberInput
          value={state.quantity}
          min={1}
          max={99}
          onValueChange={(quantity) => setState('quantity', quantity)}
          onValueCommit={(quantity) => setState('committed', String(quantity))}
        />
      </FieldShell>
      <FieldShell label="Weight" layout="row" error={weightError(state.weight)}>
        <NumberInput value={state.weight} min={0} unit="kg" onValueChange={(weight) => setState('weight', weight)} />
      </FieldShell>
      <FieldShell label="In stock" layout="row" readOnly>
        <NumberInput value={42} />
      </FieldShell>
      <FieldShell label="Gift boxes" description="Choose a gift option first." layout="row" disabled>
        <NumberInput value={0} unit="pcs" />
      </FieldShell>
      <p class={NOTE}>Committed {state.committed}</p>
    </div>
  )
}

export const States: Story = {render: () => <NumberStates />}

export const Keyboard: Story = {
  render: () => <NumberStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const quantity = canvas.getByRole('spinbutton', {name: 'Quantity'})
    await expect(quantity).toHaveAccessibleDescription('How many to order.')
    const weight = canvas.getByRole('spinbutton', {name: 'Weight'})
    await expect(weight).toHaveAccessibleDescription(/Enter at most 100 kg\./)
    await expect(weight).toHaveAttribute('aria-invalid', 'true')

    await userEvent.click(quantity)
    await userEvent.keyboard('{ArrowUp}')
    await waitFor(() => expect(quantity).toHaveValue('4'))
    await userEvent.keyboard('{PageUp}')
    await waitFor(() => expect(quantity).toHaveValue('14'))
    await expect(canvas.getByText('Committed nothing yet')).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByText('Committed 14')).toBeVisible()
    await expect(quantity).toHaveFocus()

    await userEvent.clear(quantity)
    await userEvent.type(quantity, '0')
    await expect(canvas.getByText('Order at least 1.')).toBeVisible()
    await expect(quantity).toHaveAttribute('aria-invalid', 'true')
    await userEvent.tab()
    await expect(canvas.getByText('Committed 0')).toBeVisible()

    await userEvent.clear(weight)
    await userEvent.type(weight, '80')
    await waitFor(() => expect(weight).not.toHaveAttribute('aria-invalid', 'true'))
    await expect(canvas.queryByText('Enter at most 100 kg.')).toBeNull()

    const stock = canvas.getByRole('spinbutton', {name: 'In stock'})
    await expect(stock).toHaveAttribute('readonly')
    await userEvent.click(stock)
    await userEvent.keyboard('{ArrowUp}')
    await expect(stock).toHaveValue('42')
    await expect(canvas.getByRole('spinbutton', {name: 'Gift boxes'})).toBeDisabled()
  },
}
