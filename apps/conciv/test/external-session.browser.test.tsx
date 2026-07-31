import {afterEach, expect, test} from 'vitest'
import {render} from 'solid-js/web'
import {page, userEvent} from 'vitest/browser'
import {createSignal} from 'solid-js'
import {
  ExternalSessionConfirm,
  ExternalSessionNotice,
  sendBlockedMessage,
  sendConfirmMessage,
} from '../src/chat/external-session.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mountConfirm(seen: string[]): {message: (next: string | null) => void} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [message, setMessage] = createSignal<string | null>(null)
  const dispose = render(
    () => (
      <ExternalSessionConfirm
        message={message()}
        onCancel={() => seen.push('cancel')}
        onSendAnyway={() => seen.push('send')}
      />
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return {message: setMessage}
}

function button(label: string): HTMLElement | null {
  return [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === label) ?? null
}

function mountNotice(seen: string[]): {message: (next: string | null) => void} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [message, setMessage] = createSignal<string | null>(null)
  const dispose = render(
    () => <ExternalSessionNotice message={message()} onDismiss={() => seen.push('dismiss')} />,
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return {message: setMessage}
}

test('tells a blocked send apart from one that only needs confirming', () => {
  const blocked = {code: 'EXTERNAL_BLOCKED', message: 'Claude is working in your terminal right now.'}
  const confirm = {code: 'EXTERNAL_CONFIRM', message: 'Claude is open in your terminal.'}

  expect(sendBlockedMessage(new Error('nope'))).toBeNull()
  expect(sendBlockedMessage(blocked)).toBe('Claude is working in your terminal right now.')
  expect(sendConfirmMessage(blocked)).toBeNull()

  expect(sendConfirmMessage(confirm)).toBe('Claude is open in your terminal.')
  expect(sendBlockedMessage(confirm)).toBeNull()
  expect(sendConfirmMessage({cause: {code: 'EXTERNAL_CONFIRM', message: 'nested'}})).toBe('nested')
})

test('offers no retry at all when the terminal blocked the send', async () => {
  const seen: string[] = []
  const notice = mountNotice(seen)
  notice.message('Claude is working in your terminal right now.')
  await expect.element(page.getByRole('alertdialog', {name: 'Your terminal is busy'})).toBeVisible()

  expect(button('Send anyway')).toBeNull()
  expect(button('Cancel')).toBeNull()

  button('OK')?.click()
  expect(seen).toEqual(['dismiss'])
})

test('asks before sending into a live terminal session', async () => {
  const seen: string[] = []
  const dialog = mountConfirm(seen)
  expect(button('Send anyway')).toBeNull()

  dialog.message('Claude is open in your terminal.')
  await expect.poll(() => document.body.textContent).toContain('Claude is open in your terminal.')

  button('Send anyway')?.click()
  expect(seen).toEqual(['send'])

  button('Cancel')?.click()
  expect(seen).toEqual(['send', 'cancel'])
})

test('interrupts the send as an alertdialog, not a passive dialog', async () => {
  const dialog = mountConfirm([])
  dialog.message('Claude is open in your terminal.')

  await expect.element(page.getByRole('alertdialog', {name: 'Terminal session is active'})).toBeVisible()
})

test('escape cancels the interrupt instead of trapping the writer in it', async () => {
  const seen: string[] = []
  const dialog = mountConfirm(seen)
  dialog.message('Claude is open in your terminal.')
  await expect.element(page.getByRole('alertdialog', {name: 'Terminal session is active'})).toBeVisible()

  await userEvent.keyboard('{Escape}')
  await expect.poll(() => seen).toEqual(['cancel'])
})
