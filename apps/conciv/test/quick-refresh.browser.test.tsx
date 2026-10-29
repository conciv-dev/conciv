import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const DRAFT_GET_PATH = ['drafts', 'get']
const HYDRATE_PATH = ['chat', 'hydrate']

const core = {base: ''}
const harness = createShellHarness(() => core.base)
const faults = trackedFaults()

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'quick-refresh', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(async () => {
  await coreControl.releaseTurn()
  harness.dispose()
})

const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const refresh = () => page.getByRole('button', {name: 'Refresh the conversation'})
const refreshing = () => page.getByRole('button', {name: 'Refreshing the conversation'})
const stopButton = () => page.getByRole('button', {name: 'Stop generating'})

test('the quick terminal pane bar carries refresh while the composer is still loading', async () => {
  const sessionId = await createSession(coreRpc(core.base))
  const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
  harness.mountShell(`/quick?panes=${sessionId}&focus=0`)

  await expect.element(refresh(), {timeout: 8000}).toBeVisible()
  await expect.element(editor()).not.toBeInTheDocument()

  await coreControl.releaseFault(gate)

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(refresh()).toBeVisible()
}, 30_000)

test('each quick terminal pane bar carries exactly one refresh affordance', async () => {
  const sessionId = await createSession(coreRpc(core.base))
  const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
  harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
  await expect.element(refresh(), {timeout: 8000}).toBeVisible()

  await page.getByRole('button', {name: 'Split pane (Mod+D)'}).click()

  await expect.element(refresh().nth(1), {timeout: 8000}).toBeVisible()
  await expect.element(refresh().nth(2)).not.toBeInTheDocument()

  await coreControl.releaseFault(gate)
}, 30_000)

test('a quick terminal pane disables its refresh affordance while the run streams', async () => {
  const sessionId = await createSession(coreRpc(core.base))
  await coreControl.holdTurn()
  harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  await editor().fill('start a run')
  await userEvent.keyboard('{Enter}')

  await expect.element(stopButton()).toBeVisible()
  await expect.element(refresh()).toBeDisabled()
}, 30_000)

test('the quick terminal pane refresh affordance reports progress until the reconnect settles', async () => {
  const sessionId = await createSession(coreRpc(core.base))
  harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  const gate = await faults.install({kind: 'gate', path: HYDRATE_PATH})
  await refresh().click()
  await coreControl.awaitFaultPending(gate, 1)

  await expect.element(refreshing(), {timeout: 8000}).toBeDisabled()

  await coreControl.releaseFault(gate)

  await expect.element(refresh(), {timeout: 8000}).toBeEnabled()
}, 30_000)
