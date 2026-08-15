import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'
import {expectRetryRecovers} from './helpers/retry-recovery.js'

const RESOLVE_PATH = ['sessions', 'resolve']

const core = {base: ''}
const harness = createShellHarness(() => core.base)
const faults = trackedFaults()

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'quick-add-pane', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(harness.dispose)

const startFailure = () => page.getByText(/conciv could not start a pane/)
const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const closePane = () => page.getByRole('button', {name: 'Close pane'})

test('a quick terminal pane that fails to start shows a retry action', async () => {
  const refused = await faults.install({kind: 'fail', path: RESOLVE_PATH, status: 500})
  harness.mountShell('/quick')

  await expect.element(startFailure(), {timeout: 8000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

  await coreControl.releaseFault(refused)
}, 30_000)

test('retrying a failed quick terminal pane against a healthy engine starts it', async () => {
  const refused = await faults.install({kind: 'fail', path: RESOLVE_PATH, status: 500})
  harness.mountShell('/quick')
  await expect.element(startFailure(), {timeout: 8000}).toBeVisible()

  await expectRetryRecovers(() => coreControl.releaseFault(refused), editor, startFailure)
}, 30_000)

test('rapid double-trigger creates exactly one pane', async () => {
  const sessionId = await createSession(coreRpc(core.base))
  harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  const held = await faults.install({kind: 'gate', path: RESOLVE_PATH})
  const splitButton = page.getByRole('button', {name: 'Split pane (Mod+D)'})
  const firstClick = splitButton.click()
  const secondClick = splitButton.click()
  await Promise.all([firstClick, secondClick])
  await coreControl.awaitFaultPending(held, 1)

  await coreControl.releaseFault(held)

  await expect.element(closePane().nth(1), {timeout: 8000}).toBeVisible()
  await expect.element(closePane().nth(2)).not.toBeInTheDocument()
}, 30_000)
