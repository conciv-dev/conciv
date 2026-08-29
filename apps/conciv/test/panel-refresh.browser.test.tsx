import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {bootedCore} from './helpers/booted-core.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, runTurn} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const SUBSCRIBE_PATH = ['chat', 'subscribe']
const REPLY_TEXT = 'the transcript that outlives a refresh'

const coreBase = bootedCore('panel-refresh')
const harness = createShellHarness(coreBase)
const faults = trackedFaults()

afterEach(harness.dispose)

const reply = () => page.getByText(REPLY_TEXT)
const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
const sessionMenu = () => page.getByRole('button', {name: 'Session options'})
const refreshingMenu = () => page.getByRole('button', {name: 'Refreshing the conversation'})
const refreshRow = () => page.getByRole('button', {name: 'Refresh the conversation'})

test('refreshing the conversation dismisses the menu, shows progress, and keeps the transcript', async () => {
  const rpc = coreRpc(coreBase())
  const sessionId = await createSession(rpc)
  await coreControl.scriptTurn({toolCalls: [], text: REPLY_TEXT})
  await runTurn(coreBase(), sessionId, 'seed the transcript')
  harness.mountShell(`/panel/${sessionId}?open=true`)

  await expect.element(reply(), {timeout: 8000}).toBeVisible()

  await sessionMenu().click()
  await expect.element(refreshRow(), {timeout: 8000}).toBeVisible()

  const gate = await faults.install({kind: 'gate', path: SUBSCRIBE_PATH})
  await refreshRow().click()

  await expect.element(refreshingMenu(), {timeout: 8000}).toBeVisible()
  await expect.element(refreshRow()).not.toBeInTheDocument()
  await expect.element(reply()).toBeVisible()
  await expect.element(skeleton()).not.toBeInTheDocument()

  await coreControl.releaseFault(gate)

  await expect.element(sessionMenu(), {timeout: 8000}).toBeVisible()
  await expect.element(reply()).toBeVisible()
  await expect.element(skeleton()).not.toBeInTheDocument()
}, 30_000)
