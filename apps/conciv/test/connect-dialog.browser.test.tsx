import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import type {LiveSession} from '@conciv/contract'
import {
  ConnectSessionDialog,
  CONNECTING_LABEL,
  CONTACT_LOST,
  LOOKING_LABEL,
  ONE_TIME_SETUP,
  RETRY_LABEL,
  type ConnectStep,
  type PickingStep,
} from '../src/composer/connect-dialog.js'

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

const pickingStep = (candidates: LiveSession[], over: Partial<PickingStep> = {}): PickingStep => ({
  step: 'picking',
  candidates,
  error: null,
  retry: null,
  ...over,
})

type Mounted = {
  state: (next: ConnectStep | null) => void
  connected: (next: boolean) => void
  connecting: (next: string | null) => void
  contactLost: (next: boolean) => void
  retried: number[]
  picked: LiveSession[]
  copied: string[]
  closed: number[]
  launched: number[]
  backed: LiveSession[][]
  done: LiveSession[]
}

function mountDialog(react: (session: LiveSession) => void = () => {}): Mounted {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [state, setState] = createSignal<ConnectStep | null>(null)
  const [connected, setConnected] = createSignal(false)
  const [connecting, setConnecting] = createSignal<string | null>(null)
  const [contactLost, setContactLost] = createSignal(false)
  const mounted: Mounted = {
    state: setState,
    connected: setConnected,
    connecting: setConnecting,
    contactLost: setContactLost,
    retried: [],
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
        connecting={connecting()}
        contactLost={contactLost()}
        onRetry={() => mounted.retried.push(1)}
        onPick={(value) => {
          mounted.picked.push(value)
          react(value)
        }}
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

test('opens on a looking state before the sessions arrive, and can be left there', async () => {
  const dialog = mountDialog()
  dialog.state({step: 'looking'})

  await expect.element(page.getByText(LOOKING_LABEL)).toBeVisible()
  await page.getByRole('button', {name: 'Cancel'}).click()
  expect(dialog.closed).toHaveLength(1)

  dialog.state(pickingStep([session()]))
  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeVisible()
  expect(page.getByText(LOOKING_LABEL).elements()).toHaveLength(0)
})

test('shows a failed lookup in the dialog with a way to try again', async () => {
  const dialog = mountDialog()
  dialog.state(pickingStep([], {error: 'Couldn’t look for running claude sessions.'}))

  await expect.element(page.getByText('Couldn’t look for running claude sessions.')).toBeVisible()
  expect(page.getByText('No claude session is running in this project.').elements()).toHaveLength(0)

  await page.getByRole('button', {name: RETRY_LABEL}).click()
  expect(dialog.retried).toHaveLength(1)
})

test('leaves the rows clickable after a failed connect and offers the retry', async () => {
  const only = session()
  const dialog = mountDialog()
  dialog.state(pickingStep([only], {error: 'Couldn’t connect that claude session.', retry: only}))

  await expect.element(page.getByText('Couldn’t connect that claude session.')).toBeVisible()
  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeEnabled()
  expect(page.getByText(CONNECTING_LABEL).elements()).toHaveLength(0)

  await page.getByRole('button', {name: RETRY_LABEL}).click()
  expect(dialog.retried).toHaveLength(1)

  await page.getByRole('button', {name: /rename the widget package/}).click()
  expect(dialog.picked.map((value) => value.sessionId)).toEqual(['sess-1'])
})

test('says when the readiness poll lost the server instead of spinning forever', async () => {
  const dialog = mountDialog()
  const older = session({ready: false})
  dialog.state({step: 'reload', session: older, command: '/reload-plugins --force', candidates: [older]})
  await expect.element(page.getByText(/Waiting for the session to dial in/)).toBeVisible()

  dialog.contactLost(true)

  await expect.element(page.getByText(CONTACT_LOST)).toBeVisible()
  expect(page.getByText(/Waiting for the session to dial in/).elements()).toHaveLength(0)
})

test('lists the running sessions with their first message and their state', async () => {
  const dialog = mountDialog()
  dialog.state(
    pickingStep([
      session(),
      session({sessionId: 'sess-2', name: 'terminal-2', title: 'fix the flaky test', working: true, status: 'busy'}),
    ]),
  )

  await expect.element(page.getByText('Connect a running session')).toBeVisible()
  await expect.element(page.getByText(/2 Claude sessions are running in this project/)).toBeVisible()
  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeVisible()
  await expect.element(page.getByRole('button', {name: /fix the flaky test/})).toBeVisible()
  await expect.element(page.getByText(/terminal-1 · idle · 12 messages/)).toBeVisible()
  await expect.element(page.getByText(/terminal-2 · working/)).toBeVisible()
})

test('previews what each session was last doing', async () => {
  const dialog = mountDialog()
  dialog.state(pickingStep([session({working: true})]))

  await expect.element(page.getByText('Looking at the manifests now.')).toBeVisible()
  await expect.element(page.getByText('Read', {exact: true})).toBeVisible()
  await expect.element(page.getByText('package.json read')).toBeVisible()
  await expect.element(page.getByText('Thinking…')).toBeVisible()
})

test('holds the list still while the picked session is being connected', async () => {
  const adopt: {land: () => void} = {land: () => {}}
  const landed = new Promise<void>((resolve) => {
    adopt.land = resolve
  })
  const dialog = mountDialog((picked) => {
    dialog.connecting(picked.sessionId)
    void landed.then(() => dialog.connecting(null))
  })
  dialog.state(pickingStep([session(), session({sessionId: 'sess-2', title: 'fix the flaky test'})]))

  await page.getByRole('button', {name: /fix the flaky test/}).click()

  await expect.element(page.getByText(CONNECTING_LABEL)).toBeVisible()
  await expect.element(page.getByRole('button', {name: /fix the flaky test/})).toBeDisabled()
  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeDisabled()
  await expect.element(page.getByRole('button', {name: 'Cancel'})).toBeEnabled()
  expect(page.getByText(CONNECTING_LABEL).elements()).toHaveLength(1)

  adopt.land()
  await landed

  await expect.element(page.getByRole('button', {name: /rename the widget package/})).toBeEnabled()
  expect(page.getByText(CONNECTING_LABEL).elements()).toHaveLength(0)
})

test('badges only the session that started before conciv was installed', async () => {
  const dialog = mountDialog()
  dialog.state(pickingStep([session(), session({sessionId: 'sess-2', title: 'the older one', ready: false})]))

  await expect.element(page.getByRole('button', {name: new RegExp(ONE_TIME_SETUP)})).toBeVisible()
  expect(page.getByText(ONE_TIME_SETUP).elements()).toHaveLength(1)
  await expect.element(page.getByText(/needs one reload in that terminal/)).toBeVisible()
})

test('falls back to a placeholder title for a session with nothing said yet', async () => {
  const dialog = mountDialog()
  dialog.state(pickingStep([session({title: '', messageCount: 0, tail: []})]))

  await expect.element(page.getByRole('button', {name: /Untitled, just started/})).toBeVisible()
})

test('picks the session the row belongs to', async () => {
  const dialog = mountDialog()
  dialog.state(pickingStep([session(), session({sessionId: 'sess-2', title: 'fix the flaky test'})]))

  await page.getByRole('button', {name: /fix the flaky test/}).click()
  expect(dialog.picked.map((value) => value.sessionId)).toEqual(['sess-2'])
})

test('says so when nothing is running and points at the way forward', async () => {
  const dialog = mountDialog()
  dialog.state(pickingStep([]))
  await expect.element(page.getByText('No claude session is running in this project.')).toBeVisible()

  await expect.element(page.getByRole('button', {name: 'Open a new session'})).toBeVisible()
  await page.getByRole('button', {name: 'Open a new session'}).click()
  expect(dialog.launched).toHaveLength(1)

  await page.getByRole('button', {name: 'Cancel'}).click()
  expect(dialog.closed).toHaveLength(1)
})

test('escape leaves the empty picker', async () => {
  const dialog = mountDialog()
  dialog.state(pickingStep([]))
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
  dialog.state(pickingStep([]))
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
