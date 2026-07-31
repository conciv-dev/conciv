import {afterEach, expect, test} from 'vitest'
import {render} from 'solid-js/web'
import {page, userEvent} from 'vitest/browser'
import {createSignal} from 'solid-js'
import {ExternalSessionConfirm, externalActiveMessage} from '../src/chat/external-session.js'

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

test('reads the EXTERNAL_ACTIVE message off a nested rpc error', () => {
  expect(externalActiveMessage(new Error('nope'))).toBeNull()
  expect(externalActiveMessage({code: 'EXTERNAL_ACTIVE', message: 'Claude is working in your terminal.'})).toBe(
    'Claude is working in your terminal.',
  )
  expect(externalActiveMessage({cause: {code: 'EXTERNAL_ACTIVE', message: 'nested'}})).toBe('nested')
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
