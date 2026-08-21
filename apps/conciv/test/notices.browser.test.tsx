import '@conciv/ui-kit-system/tokens.css'
import './helpers/utilities.css'
import {expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {createSignal, Show} from 'solid-js'
import {createNoticeStore, type Notify} from '../src/shell/notices.js'

function mountToaster(): {notify: Notify; showToaster: (visible: boolean) => void} {
  const store = createNoticeStore()
  const [standing, setStanding] = createSignal(true)
  const mounted = render(() => (
    <Show when={standing()} fallback={<p>another session</p>}>
      <store.Toaster />
    </Show>
  ))
  mounted.container.className = 'chat-theme-terminal'
  return {notify: store.notify, showToaster: (visible) => setStanding(visible)}
}

test('an empty notifications region takes no space above the header', async () => {
  const {notify} = mountToaster()

  await expect.element(page.getByRole('region', {name: /Notifications/})).not.toBeVisible()

  notify('Command copied. Paste it in your terminal.')
  await expect.element(page.getByRole('region', {name: /Notifications/})).toBeVisible()

  await page.getByRole('button', {name: 'Dismiss'}).click()

  await expect.element(page.getByText('Command copied. Paste it in your terminal.')).not.toBeInTheDocument()
  await expect.element(page.getByRole('region', {name: /Notifications/})).not.toBeVisible()
})

test('a notice stands in the notifications region until it is dismissed by hand', async () => {
  const {notify} = mountToaster()

  notify('Command copied. Paste it in your terminal.')

  await expect
    .element(page.getByRole('region', {name: /Notifications/}))
    .toHaveTextContent('Command copied. Paste it in your terminal.')

  await page.getByRole('button', {name: 'Dismiss'}).click()

  await expect.element(page.getByText('Command copied. Paste it in your terminal.')).not.toBeInTheDocument()
})

test('an alarming notice asks to be read at once, a plain one waits its turn', async () => {
  const {notify} = mountToaster()

  notify('Still connected to your terminal.', {tone: 'danger'})

  await expect.element(page.getByRole('alert')).toHaveTextContent('Still connected to your terminal.')

  notify('Command copied. Paste it in your terminal.')

  await expect.element(page.getByRole('status')).toHaveTextContent('Command copied. Paste it in your terminal.')
})

test('the way out of a notice runs once and takes the notice with it', async () => {
  const {notify} = mountToaster()
  let handedBack = 0
  notify('Now following fix the flaky test.', {
    action: {
      label: 'Undo',
      run: () => {
        handedBack += 1
      },
    },
  })

  await page.getByRole('button', {name: 'Undo'}).click()

  await expect.element(page.getByText('Now following fix the flaky test.')).not.toBeInTheDocument()
  expect(handedBack).toBe(1)
})

test('a notice raised again under the same name replaces the one already standing', async () => {
  const {notify} = mountToaster()

  notify('Still connected to your terminal.', {key: 'hand-back', tone: 'danger'})
  await expect.element(page.getByText('Still connected to your terminal.')).toBeVisible()

  notify('Handed the terminal back.', {key: 'hand-back', tone: 'success'})

  await expect.element(page.getByText('Handed the terminal back.')).toBeVisible()
  await expect.element(page.getByText('Still connected to your terminal.')).not.toBeInTheDocument()
})

test('a notice that offers a way out survives leaving the session it was raised in', async () => {
  const {notify, showToaster} = mountToaster()
  notify('Now following fix the flaky test.', {action: {label: 'Undo', run: () => {}}})
  await expect.element(page.getByText('Now following fix the flaky test.')).toBeVisible()

  showToaster(false)
  await expect.element(page.getByText('another session')).toBeVisible()
  showToaster(true)

  await expect.element(page.getByText('Now following fix the flaky test.')).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Undo'})).toBeVisible()
})

test('an alarming notice that offers a way out shows both the way out and the way to dismiss', async () => {
  const {notify} = mountToaster()

  notify('Still connected to your terminal.', {tone: 'danger', action: {label: 'Hand it back', run: () => {}}})

  await expect.element(page.getByRole('alert')).toHaveTextContent('Still connected to your terminal.')
  await expect.element(page.getByRole('button', {name: 'Hand it back'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Dismiss'})).toBeVisible()
})

test('the way out of a notice explains itself with a tooltip a touch reader can reach', async () => {
  const {notify} = mountToaster()
  notify('Command copied. Paste it in your terminal.')

  await page.getByRole('button', {name: 'Dismiss'}).hover()

  await expect.element(page.getByRole('tooltip')).toHaveTextContent('Dismiss')
})
