import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {page, userEvent} from 'vitest/browser'
import {expect, it, onTestFinished} from 'vitest'
import {ConcivLockup} from '../../src/react/conciv-lockup.js'
import {antennaOf, cursorOf, SETTLE_WINDOW_MS, wait} from './lockup-dom.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function mountLinkedLockup(): {container: HTMLElement} {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  onTestFinished(() => {
    act(() => root.unmount())
    container.remove()
  })
  act(() =>
    root.render(
      <a href="#brand" aria-label="conciv home">
        <ConcivLockup interactive />
      </a>,
    ),
  )
  return {container}
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
