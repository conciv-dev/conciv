import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import type {LiveSession} from '@conciv/contract'
import {ConnectSessionDialog, type ConnectStep} from '../src/composer/connect-dialog.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

const session = (over: Partial<LiveSession> = {}): LiveSession => ({
  sessionId: 'sess-1',
  pid: 4242,
  cwd: '/repo',
  name: 'my-terminal',
  status: 'idle',
  relation: 'same',
  ...over,
})

type Mounted = {
  state: (next: ConnectStep | null) => void
  picked: LiveSession[]
  copied: string[]
  closed: number[]
  launched: number[]
}

function mountDialog(): Mounted {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [state, setState] = createSignal<ConnectStep | null>(null)
  const mounted: Mounted = {state: setState, picked: [], copied: [], closed: [], launched: []}
  const dispose = render(
    () => (
      <ConnectSessionDialog
        state={state()}
        onPick={(value) => mounted.picked.push(value)}
        onCopy={(text) => mounted.copied.push(text)}
        onClose={() => mounted.closed.push(1)}
        onLaunch={() => mounted.launched.push(1)}
      />
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return mounted
}

test('picks a running session and annotates the ones that are not ready', async () => {
  const dialog = mountDialog()
  dialog.state({
    step: 'picking',
    candidates: [
      session(),
      session({sessionId: 'sess-2', name: 'busy-one', status: 'busy'}),
      session({sessionId: 'sess-3', name: 'shell-one', status: 'shell', relation: 'descendant', cwd: '/repo/app'}),
    ],
  })

  await expect.element(page.getByRole('button', {name: /my-terminal/})).toBeVisible()
  await expect.element(page.getByText('Working now. Let the current turn finish first.')).toBeVisible()
  await expect.element(page.getByText('In a shell. Exit the ! shell first.')).toBeVisible()
  await expect.element(page.getByText('Started in a subfolder, /repo/app.')).toBeVisible()

  await page.getByRole('button', {name: /my-terminal/}).click()
  expect(dialog.picked.map((value) => value.sessionId)).toEqual(['sess-1'])
})

test('says so when nothing is running and points at the way forward', async () => {
  const dialog = mountDialog()
  dialog.state({step: 'picking', candidates: []})
  await expect.element(page.getByText('No claude session is running in this project.')).toBeVisible()

  await expect.element(page.getByRole('button', {name: 'Open a new session'})).toBeVisible()
  await page.getByRole('button', {name: 'Open a new session'}).click()
  expect(dialog.launched).toHaveLength(1)

  await page.getByRole('button', {name: 'Cancel'}).click()
  expect(dialog.closed).toHaveLength(1)
})

test('escape leaves the empty picker', async () => {
  const dialog = mountDialog()
  dialog.state({step: 'picking', candidates: []})
  await expect.element(page.getByText('No claude session is running in this project.')).toBeVisible()

  await userEvent.keyboard('{Escape}')
  await expect.poll(() => dialog.closed.length).toBe(1)
})

async function clickBehindTheDialog(): Promise<void> {
  const content = page.getByRole('alertdialog').element()
  const positioner = content.parentElement
  if (!(positioner instanceof HTMLElement)) throw new Error('the dialog content has no layer around it')
  const away = content.getBoundingClientRect().bottom + 40
  await userEvent.click(page.elementLocator(positioner), {position: {x: 8, y: away}, force: true})
}

test('clicking away leaves the empty picker', async () => {
  const dialog = mountDialog()
  dialog.state({step: 'picking', candidates: []})
  await expect.element(page.getByText('No claude session is running in this project.')).toBeVisible()

  await clickBehindTheDialog()
  await expect.poll(() => dialog.closed.length).toBe(1)
})

test('every step keeps a visible way out', async () => {
  const dialog = mountDialog()
  dialog.state({step: 'picking', candidates: [session()]})
  await expect.element(page.getByRole('button', {name: 'Cancel'})).toBeVisible()

  dialog.state({step: 'snippet', command: 'claude --resume tok-1', detail: 'too old'})
  await page.getByRole('button', {name: 'Close'}).click()
  expect(dialog.closed).toHaveLength(1)
})

test('shows the reload command and the cost of re-reading the conversation', async () => {
  const dialog = mountDialog()
  dialog.state({step: 'connected', reloadCommand: '/reload-plugins --force'})

  await expect.element(page.getByText('/reload-plugins --force')).toBeVisible()
  await expect.element(page.getByText(/re-reads the whole conversation/)).toBeVisible()

  await page.getByRole('button', {name: 'Copy command'}).click()
  expect(dialog.copied).toEqual(['/reload-plugins --force'])

  await page.getByRole('button', {name: 'Done'}).click()
  expect(dialog.closed).toHaveLength(1)
})

test('falls back to a restart snippet when the cli is too old', async () => {
  const dialog = mountDialog()
  dialog.state({
    step: 'snippet',
    command: "cd '/repo' && claude --resume tok-1",
    detail: 'claude 2.1.100 lacks /reload-plugins --force (needs 2.1.163+)',
  })

  await expect.element(page.getByText(/lacks \/reload-plugins --force/)).toBeVisible()
  await expect.element(page.getByText("cd '/repo' && claude --resume tok-1")).toBeVisible()

  await page.getByRole('button', {name: 'Copy command'}).click()
  expect(dialog.copied).toEqual(["cd '/repo' && claude --resume tok-1"])
})
