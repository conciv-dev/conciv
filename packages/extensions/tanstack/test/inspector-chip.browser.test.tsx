import {expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {CONCIV_TANSTACK_CLIENT_LABEL} from '../src/client-sentinel.js'
import {InspectorChip} from '../src/client/inspector-chip.js'

function mountChip(): void {
  render(() => <InspectorChip />)
}

test('the composer chip is a labeled passive status indicator, not a button', async () => {
  mountChip()
  await expect.element(page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})).toBeVisible()
  await expect.element(page.getByRole('button')).not.toBeInTheDocument()
})

test('hovering the chip opens its tooltip', async () => {
  mountChip()
  const chip = page.getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})
  await chip.hover()
  await expect.element(page.getByRole('tooltip')).toHaveTextContent(CONCIV_TANSTACK_CLIENT_LABEL)
})
