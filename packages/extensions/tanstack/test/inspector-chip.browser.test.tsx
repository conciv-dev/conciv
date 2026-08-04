import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {CONCIV_TANSTACK_CLIENT_LABEL} from '../src/client-sentinel.js'
import {InspectorChip} from '../src/client/inspector-chip.js'

const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

function mountChip(): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  disposers.push(render(() => <InspectorChip />, host))
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
