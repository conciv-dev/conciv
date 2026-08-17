import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {ConcivLockup} from '../../src/solid/conciv-lockup.js'
import {antennaOf, cursorOf, SETTLE_WINDOW_MS, wait} from './lockup-dom.js'

function mountLinkedLockup(): {container: HTMLElement; unmount: () => void} {
  const mounted = render(() => (
    <a href="#brand" aria-label="conciv home">
      <ConcivLockup interactive />
    </a>
  ))
  return {container: mounted.container, unmount: mounted.unmount}
}

it('stays fully static on hover when the reader asks for reduced motion', async () => {
  const {container} = mountLinkedLockup()
  const logo = page.getByRole('img', {name: 'conciv'})
  await expect.element(logo).toBeVisible()

  await userEvent.hover(logo)
  await wait(SETTLE_WINDOW_MS)

  expect(cursorOf(container).getAttribute('opacity')).toBe('0')
  expect(antennaOf(container).getAttribute('style')).not.toContain('rotate(')
})

it('stays fully static on keyboard focus when the reader asks for reduced motion', async () => {
  const {container} = mountLinkedLockup()
  const logo = page.getByRole('img', {name: 'conciv'})
  await expect.element(logo).toBeVisible()

  await userEvent.tab()
  await wait(SETTLE_WINDOW_MS)

  expect(cursorOf(container).getAttribute('opacity')).toBe('0')
  expect(antennaOf(container).getAttribute('style')).not.toContain('rotate(')
})
