import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {FieldShell} from './field-shell.js'
import {RadioCards} from './radio-cards.js'

const meta: Meta = {title: 'ui-kit-system/RadioCards'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const NOTE = 'text-[0.75rem] text-chat-text-2'
const SHIPPING = [
  {value: 'standard', title: 'Standard', description: 'Arrives in 3 to 5 business days.'},
  {value: 'express', title: 'Express', description: 'Arrives the next business day.'},
  {value: 'pickup', title: 'Pickup', description: 'Collect it from the store.'},
]
const PAYMENT = [
  {value: 'card', title: 'Card', description: 'Charged when the order ships.'},
  {value: 'invoice', title: 'Invoice', description: 'Pay within 30 days.'},
]

function RadioStates() {
  const [state, setState] = createStore({shipping: 'standard', payment: 'invoice'})
  const paymentError = () => (state.payment === 'invoice' ? 'Invoices need a company account.' : undefined)
  return (
    <div class={STACK}>
      <FieldShell label="Shipping" group>
        <RadioCards options={SHIPPING} value={state.shipping} onValueChange={(value) => setState('shipping', value)} />
      </FieldShell>
      <FieldShell label="Payment" description="How you pay for this order." group error={paymentError()}>
        <RadioCards
          options={PAYMENT}
          value={state.payment}
          invalid={paymentError() !== undefined}
          onValueChange={(value) => setState('payment', value)}
        />
      </FieldShell>
      <FieldShell label="Packaging" group>
        <RadioCards
          options={[
            {value: 'box', title: 'Box'},
            {value: 'envelope', title: 'Envelope'},
          ]}
          value="box"
          readOnly
        />
      </FieldShell>
      <FieldShell label="Gift wrap" description="Not available for this item." group disabled>
        <RadioCards
          options={[
            {value: 'none', title: 'None'},
            {value: 'paper', title: 'Paper'},
          ]}
          value="none"
          disabled
        />
      </FieldShell>
      <p class={NOTE}>
        Shipping {state.shipping}, payment {state.payment}
      </p>
    </div>
  )
}

export const States: Story = {render: () => <RadioStates />}

export const Keyboard: Story = {
  render: () => <RadioStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const shipping = within(canvas.getByRole('group', {name: 'Shipping'}))
    const standard = shipping.getByRole('radio', {name: 'Standard'})
    await expect(standard).toHaveAccessibleDescription('Arrives in 3 to 5 business days.')
    await expect(canvas.getByRole('group', {name: 'Payment'})).toHaveAccessibleDescription(
      /Invoices need a company account\./,
    )

    await userEvent.click(shipping.getByText('Standard'))
    await expect(standard).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    const express = shipping.getByRole('radio', {name: 'Express'})
    await waitFor(() => expect(express).toBeChecked())
    await expect(express).toHaveFocus()
    await expect(canvas.getByText('Shipping express, payment invoice')).toBeVisible()

    const payment = within(canvas.getByRole('group', {name: 'Payment'}))
    await userEvent.click(payment.getByText('Card'))
    await waitFor(() => expect(payment.getByRole('radio', {name: 'Card'})).toBeChecked())
    await expect(canvas.queryByText('Invoices need a company account.')).toBeNull()
    await expect(canvas.getByText('Shipping express, payment card')).toBeVisible()

    const packaging = within(canvas.getByRole('group', {name: 'Packaging'}))
    await userEvent.click(packaging.getByText('Envelope'))
    await expect(packaging.getByRole('radio', {name: 'Box'})).toBeChecked()
    await expect(
      within(canvas.getByRole('group', {name: 'Gift wrap'})).getByRole('radio', {name: 'Paper'}),
    ).toBeDisabled()
  },
}
