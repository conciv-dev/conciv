import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import type {LiveSession} from '@conciv/contract'
import {ConnectSessionDialog, ONE_TIME_SETUP, type ConnectStep} from '../src/composer/connect-dialog.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

const session = (over: Partial<LiveSession> = {}): LiveSession => ({
  sessionId: 'sess-1',
  pid: 4242,
  cwd: '/repo',
  name: 'terminal-1',
  status: 'idle',
  relation: 'same',
  ready: true,
  title: 'rename the widget package',
  messageCount: 12,
  lastActivityAt: Date.now() - 60_000,
  working: false,
  tail: [
    {role: 'assistant', text: 'Looking at the manifests now.'},
    {role: 'tool', text: '', toolName: 'Read', toolResult: 'package.json read'},
  ],
  ...over,
})

type Mounted = {
  state: (next: ConnectStep | null) => void
  connected: (next: boolean) => void
  picked: LiveSession[]
  copied: string[]
  closed: number[]
  launched: number[]
  backed: LiveSession[][]
  done: LiveSession[]
}

function mountDialog(): Mounted {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [state, setState] = createSignal<ConnectStep | null>(null)
  const [connected, setConnected] = createSignal(false)
  const mounted: Mounted = {
    state: setState,
    connected: setConnected,
    picked: [],
    copied: [],
    closed: [],
    launched: [],
    backed: [],
    done: [],
  }
  const dispose = render(
    () => (
      <ConnectSessionDialog
        state={state()}
        connected={connected()}
        onPick={(value) => mounted.picked.push(value)}
        onCopy={(text) => mounted.copied.push(text)}
        onClose={() => mounted.closed.push(1)}
        onLaunch={() => mounted.launched.push(1)}
        onBack={(candidates) => mounted.backed.push(candidates)}
        onDone={(value) => mounted.done.push(value)}
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

test('lists the running sessions with their first message and their state', async () => {
  const dialog = mountDialog()
  dialog.state({
    step: 'picking',
    candidates: [
      session(),
      session({sessionId: 'sess-2', name: 'terminal-2', title: 'fix the flaky test', working: true, status: 'busy'}),
    ],
  })

  await expect.element(page.getByText('Connect a running session')).toBeVisible()
  await expect.element(page.getByText(/2 Claude sessions are running in this project/)).toBeVisible()
  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeVisible()
  await expect.element(page.getByRole('button', {name: /fix the flaky test/})).toBeVisible()
  await expect.element(page.getByText(/terminal-1 · idle · 12 messages/)).toBeVisible()
  await expect.element(page.getByText(/terminal-2 · working/)).toBeVisible()
})

test('badges only the session that started before conciv was installed', async () => {
  const dialog = mountDialog()
  dialog.state({
    step: 'picking',
    candidates: [session(), session({sessionId: 'sess-2', title: 'the older one', ready: false})],
  })

  await expect.element(page.getByRole('button', {name: new RegExp(ONE_TIME_SETUP)})).toBeVisible()
  expect(page.getByText(ONE_TIME_SETUP).elements()).toHaveLength(1)
  await expect.element(page.getByText(/needs one reload in that terminal/)).toBeVisible()
})

test('falls back to a placeholder title for a session with nothing said yet', async () => {
  const dialog = mountDialog()
  dialog.state({step: 'picking', candidates: [session({title: '', messageCount: 0, tail: []})]})

  await expect.element(page.getByRole('button', {name: /Untitled, just started/})).toBeVisible()
})

test('picks the session the row belongs to', async () => {
  const dialog = mountDialog()
  dialog.state({
    step: 'picking',
    candidates: [session(), session({sessionId: 'sess-2', title: 'fix the flaky test'})],
  })

  await page.getByRole('button', {name: /fix the flaky test/}).click()
  expect(dialog.picked.map((value) => value.sessionId)).toEqual(['sess-2'])
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

test('asks for the one reload the older session needs, and waits for it', async () => {
  const dialog = mountDialog()
  const older = session({ready: false, title: 'the older one'})
  dialog.state({step: 'reload', session: older, command: '/reload-plugins --force', candidates: [older]})

  await expect.element(page.getByText('the older one')).toBeVisible()
  await expect.element(page.getByText(/started before conciv was installed/)).toBeVisible()
  await expect.element(page.getByText('/reload-plugins --force')).toBeVisible()
  await expect.element(page.getByText(/Waiting for the session to dial in/)).toBeVisible()

  await page.getByRole('button', {name: 'Copy command'}).click()
  expect(dialog.copied).toEqual(['/reload-plugins --force'])
})

test('flips the reload card to connected on its own', async () => {
  const dialog = mountDialog()
  const older = session({ready: false, title: 'the older one'})
  dialog.state({step: 'reload', session: older, command: '/reload-plugins --force', candidates: [older]})
  await expect.element(page.getByText(/Waiting for the session to dial in/)).toBeVisible()

  dialog.connected(true)

  await expect.element(page.getByText(/Connected. Keep talking in either place./)).toBeVisible()
  await page.getByRole('button', {name: 'Done'}).click()
  expect(dialog.done.map((value) => value.sessionId)).toEqual(['sess-1'])
})

test('the reload card goes back to the list', async () => {
  const dialog = mountDialog()
  const older = session({ready: false})
  dialog.state({step: 'reload', session: older, command: '/reload-plugins --force', candidates: [older]})

  await page.getByRole('button', {name: 'Back to the list'}).click()
  expect(dialog.backed).toHaveLength(1)
  expect(dialog.backed[0]?.map((value) => value.sessionId)).toEqual(['sess-1'])
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

  await page.getByRole('button', {name: 'Close'}).click()
  expect(dialog.closed).toHaveLength(1)
})
