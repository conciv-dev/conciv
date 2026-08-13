import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {CollapsibleCard} from '../src/tools/styled/collapsible-card.js'
import {mountView} from './mount-view.js'

it('renders a collapsible with a chevron even when the body is empty', async () => {
  mountView(() => <CollapsibleCard header={<span>Rendered choices</span>} />)

  await expect.element(page.getByText('Rendered choices')).toBeVisible()
  await expect.element(page.getByRole('button')).toHaveAttribute('aria-expanded')
})

it('renders a collapsible with an expand button when the card has body content', async () => {
  mountView(() => (
    <CollapsibleCard header={<span>Rendered a form</span>}>
      <span>Pick a primary color</span>
    </CollapsibleCard>
  ))

  await expect.element(page.getByRole('button')).toHaveAttribute('aria-expanded')
})

it('expands to reveal the body content on click', async () => {
  mountView(() => (
    <CollapsibleCard header={<span>Ran a command</span>}>
      <span>streamed output</span>
    </CollapsibleCard>
  ))

  const trigger = page.getByRole('button')
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect.element(page.getByText('streamed output')).not.toBeInTheDocument()

  await trigger.click()

  await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect.element(page.getByText('streamed output')).toBeVisible()
})

it('keeps the title tooltip on the trigger row', async () => {
  mountView(() => (
    <CollapsibleCard header={<span>Rendered choices</span>} tooltip="lets the user pick a value">
      <span>details</span>
    </CollapsibleCard>
  ))

  await expect.element(page.getByText('Rendered choices')).toBeVisible()
  await userEvent.hover(page.getByText('Rendered choices'))
  await expect.element(page.getByRole('tooltip')).toHaveTextContent('lets the user pick a value')
})
