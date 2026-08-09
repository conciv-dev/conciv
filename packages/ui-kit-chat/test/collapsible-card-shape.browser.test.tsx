import 'virtual:uno.css'
import {afterEach, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {createSignal, Show} from 'solid-js'
import {CollapsibleCard} from '../src/styled/collapsible-card.js'
import {cleanupViews, mountView} from './mount-view.js'

afterEach(() => {
  cleanupViews()
})

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
