import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {createSignal, Show} from 'solid-js'
import {CollapsibleCard} from '../src/tools/styled/collapsible-card.js'
import {mountView} from './mount-view.js'

it('renders a header-only row with no expand affordance when the card has no body content', async () => {
  mountView(() => (
    <CollapsibleCard header={<span>Rendered choices</span>}>
      <Show when={false}>
        <span>never</span>
      </Show>
    </CollapsibleCard>
  ))

  await expect.element(page.getByText('Rendered choices')).toBeVisible()
  expect(document.querySelector('[aria-expanded]')).toBeNull()
  expect(document.querySelector('button')).toBeNull()
})

it('renders a collapsible with an expand button when the card has body content', async () => {
  mountView(() => (
    <CollapsibleCard header={<span>Rendered a form</span>}>
      <span>Pick a primary color</span>
    </CollapsibleCard>
  ))

  await expect.element(page.getByRole('button')).toHaveAttribute('aria-expanded')
})

it('keeps the title tooltip on a static header-only row', async () => {
  mountView(() => (
    <CollapsibleCard header={<span>Rendered choices</span>} tooltip="lets the user pick a value">
      <Show when={false}>
        <span>never</span>
      </Show>
    </CollapsibleCard>
  ))

  await expect.element(page.getByText('Rendered choices')).toBeVisible()
  await userEvent.hover(page.getByText('Rendered choices'))
  await expect.element(page.getByRole('tooltip')).toHaveTextContent('lets the user pick a value')
})

it('upgrades from the static row to a collapsible when body content arrives later', async () => {
  const [ready, setReady] = createSignal(false)
  mountView(() => (
    <CollapsibleCard header={<span>Ran a command</span>}>
      <Show when={ready()}>
        <span>streamed output</span>
      </Show>
    </CollapsibleCard>
  ))

  await expect.element(page.getByText('Ran a command')).toBeVisible()
  expect(document.querySelector('[aria-expanded]')).toBeNull()

  setReady(true)

  await expect.element(page.getByRole('button')).toHaveAttribute('aria-expanded')
  await expect.element(page.getByText('Ran a command')).toBeVisible()
})
