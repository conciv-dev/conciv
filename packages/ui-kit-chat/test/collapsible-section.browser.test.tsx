import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {CollapsibleSection} from '../src/tools/styled/collapsible-section.js'
import {mountView} from './mount-view.js'

it('starts collapsed by default, hiding the body and reporting aria-expanded false', async () => {
  mountView(() => (
    <CollapsibleSection header={<span>test-suite.spec.ts</span>}>
      <span>assertion failed: expected 2, got 3</span>
    </CollapsibleSection>
  ))

  const trigger = page.getByRole('button', {name: 'test-suite.spec.ts'})
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect.element(page.getByText('assertion failed: expected 2, got 3')).not.toBeVisible()
})

it('starts open when defaultOpen is set, showing the body and reporting aria-expanded true', async () => {
  mountView(() => (
    <CollapsibleSection header={<span>failing-test.spec.ts</span>} defaultOpen>
      <span>stack trace goes here</span>
    </CollapsibleSection>
  ))

  const trigger = page.getByRole('button', {name: 'failing-test.spec.ts'})
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect.element(page.getByText('stack trace goes here')).toBeVisible()
})

it('toggles open and closed on trigger click', async () => {
  mountView(() => (
    <CollapsibleSection header={<span>nested-section</span>}>
      <span>nested detail content</span>
    </CollapsibleSection>
  ))

  const trigger = page.getByRole('button', {name: 'nested-section'})
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')

  await userEvent.click(trigger)
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect.element(page.getByText('nested detail content')).toBeVisible()

  await userEvent.click(trigger)
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect.element(page.getByText('nested detail content')).not.toBeVisible()
})

it('supports nesting inside another collapsible card body', async () => {
  mountView(() => (
    <div>
      <p>Card body</p>
      <CollapsibleSection header={<span>inner section</span>} defaultOpen>
        <span>inner content</span>
      </CollapsibleSection>
    </div>
  ))

  await expect.element(page.getByText('Card body')).toBeVisible()
  await expect.element(page.getByText('inner content')).toBeVisible()
})
