import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import {NO_CONFLICT, TERMINAL_RECONNECTED, type Conflict} from '../src/chat/conflict.js'
import {TerminalConflictDialog} from '../src/chat/terminal-conflict-dialog.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

type Mounted = {show: (conflict: Conflict) => void; seen: string[]}

function mountDialog(): Mounted {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [conflict, setConflict] = createSignal<Conflict>(NO_CONFLICT)
  const seen: string[] = []
  const dispose = render(
    () => (
      <TerminalConflictDialog
        conflict={conflict()}
        onCancel={() => seen.push('cancel')}
        onTakeOver={() => seen.push('take over')}
        onSendAnyway={() => seen.push('send anyway')}
      />
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return {show: setConflict, seen}
}

const dialogs = () => page.getByRole('alertdialog').elements()

test('says nothing while there is no conflict', () => {
  mountDialog()
  expect(dialogs()).toHaveLength(0)
})

test('offers to take the session back, and never stacks a second dialog while it does', async () => {
  const mounted = mountDialog()
  mounted.show({kind: 'attached', message: 'This session is driven from your terminal.'})

  await expect.element(page.getByText('This session is driven from your terminal.')).toBeVisible()
  expect(dialogs()).toHaveLength(1)

  mounted.show({kind: 'taking-over', message: 'This session is driven from your terminal.'})
  await expect.element(page.getByRole('button', {name: 'Taking over…'})).toBeDisabled()
  expect(dialogs()).toHaveLength(1)

  mounted.show({
    kind: 'take-over-failed',
    message: 'This session is driven from your terminal.',
    reason: TERMINAL_RECONNECTED,
  })
  await expect.element(page.getByText(TERMINAL_RECONNECTED, {exact: false})).toBeVisible()
  expect(dialogs()).toHaveLength(1)

  mounted.show({kind: 'still-live', message: 'Claude is working in your terminal right now.'})
  await expect.element(page.getByRole('button', {name: 'Send anyway'})).toBeVisible()
  expect(dialogs()).toHaveLength(1)
})

test('lets the reader out of every phase without sending', async () => {
  const mounted = mountDialog()
  mounted.show({kind: 'attached', message: 'This session is driven from your terminal.'})
  await page.getByRole('button', {name: 'Cancel'}).click()
  expect(mounted.seen).toEqual(['cancel'])

  mounted.show({kind: 'taking-over', message: 'This session is driven from your terminal.'})
  await page.getByRole('button', {name: 'Cancel'}).click()
  expect(mounted.seen).toEqual(['cancel', 'cancel'])
})

test('escape cancels instead of sending or trapping the writer', async () => {
  const mounted = mountDialog()
  mounted.show({kind: 'external', message: 'Claude is open in your terminal.'})
  await expect.element(page.getByRole('alertdialog')).toBeVisible()

  await userEvent.keyboard('{Escape}')

  await expect.poll(() => mounted.seen).toEqual(['cancel'])
})

test('a blocked send offers no way to push through', async () => {
  const mounted = mountDialog()
  mounted.show({kind: 'blocked', message: 'Claude is working in your terminal right now.'})

  await expect.element(page.getByText('Claude is working in your terminal right now.')).toBeVisible()
  expect(page.getByRole('button', {name: 'Send anyway'}).elements()).toHaveLength(0)
  expect(page.getByRole('button', {name: 'Take over'}).elements()).toHaveLength(0)
})

test('trying again after a failed take over asks the server again, it does not reopen a fresh dialog', async () => {
  const mounted = mountDialog()
  mounted.show({
    kind: 'take-over-failed',
    message: 'This session is driven from your terminal.',
    reason: TERMINAL_RECONNECTED,
  })

  await page.getByRole('button', {name: 'Try again'}).click()

  expect(mounted.seen).toEqual(['take over'])
  expect(dialogs()).toHaveLength(1)
})
