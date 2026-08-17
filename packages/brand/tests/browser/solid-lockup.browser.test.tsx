import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {ConcivLockup} from '../../src/solid/conciv-lockup.js'
import {antennaOf, cursorOf, SETTLE_WINDOW_MS, TRAILING_FRAME_MS, wait} from './lockup-dom.js'

function mountLinkedLockup(): {container: HTMLElement; unmount: () => void} {
  const mounted = render(() => (
    <div>
      <a href="#brand" aria-label="conciv home">
        <ConcivLockup interactive />
      </a>
      <button type="button">elsewhere</button>
    </div>
  ))
  return {container: mounted.container, unmount: mounted.unmount}
}

it('wakes the cursor blink and antenna flick on hover when motion is welcome', async () => {
  const {container} = mountLinkedLockup()
  const logo = page.getByRole('img', {name: 'conciv'})
  await expect.element(logo).toBeVisible()

  await userEvent.hover(logo)

  expect(antennaOf(container).getAttribute('style')).toContain('rotate(')
  await expect.element(page.elementLocator(cursorOf(container))).toHaveAttribute('opacity', '1')
})

it('wakes the blink when the link takes real keyboard focus', async () => {
  const {container} = mountLinkedLockup()
  const logo = page.getByRole('img', {name: 'conciv'})
  await expect.element(logo).toBeVisible()

  await userEvent.tab()

  const link = container.querySelector('a')
  if (link === null) throw new Error('the anchor did not render')
  expect(document.activeElement).toBe(link)
  expect(link.matches(':focus-visible')).toBe(true)
  await expect.element(page.elementLocator(cursorOf(container))).toHaveAttribute('opacity', '1')
})

it('stops the blink and settles the cursor solid on pointer leave', async () => {
  const {container} = mountLinkedLockup()
  const logo = page.getByRole('img', {name: 'conciv'})
  await userEvent.hover(logo)
  await expect.element(page.elementLocator(cursorOf(container))).toHaveAttribute('opacity', '1')

  await userEvent.unhover(logo)

  await expect.element(page.elementLocator(cursorOf(container))).toHaveAttribute('opacity', '0')
  await wait(SETTLE_WINDOW_MS)
  expect(cursorOf(container).getAttribute('opacity')).toBe('0')
})

it('stops the blink and settles the cursor solid on blur', async () => {
  const {container} = mountLinkedLockup()
  await expect.element(page.getByRole('img', {name: 'conciv'})).toBeVisible()
  await userEvent.tab()
  await expect.element(page.elementLocator(cursorOf(container))).toHaveAttribute('opacity', '1')

  await userEvent.click(page.getByRole('button', {name: 'elsewhere'}))

  await expect.element(page.elementLocator(cursorOf(container))).toHaveAttribute('opacity', '0')
  await wait(SETTLE_WINDOW_MS)
  expect(cursorOf(container).getAttribute('opacity')).toBe('0')
})

it('stops every handle on unmount instead of mutating attributes afterward', async () => {
  const {container, unmount} = mountLinkedLockup()
  const logo = page.getByRole('img', {name: 'conciv'})
  await userEvent.hover(logo)
  await expect.element(page.elementLocator(cursorOf(container))).toHaveAttribute('opacity', '1')
  const cursor = cursorOf(container)
  const antenna = antennaOf(container)

  unmount()
  await wait(TRAILING_FRAME_MS)

  const opacityAfterUnmount = cursor.getAttribute('opacity')
  const transformAfterUnmount = antenna.getAttribute('style')
  await wait(SETTLE_WINDOW_MS)
  expect(cursor.getAttribute('opacity')).toBe(opacityAfterUnmount)
  expect(antenna.getAttribute('style')).toBe(transformAfterUnmount)
})
