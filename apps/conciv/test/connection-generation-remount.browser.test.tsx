import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {bootedCore} from './helpers/booted-core.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const DRAFT_GET_PATH = ['drafts', 'get']

const coreBase = bootedCore('connection-generation-remount')
const harness = createShellHarness(coreBase)
const faults = trackedFaults()

afterEach(async () => {
  await coreControl.releaseTurn()
  harness.dispose()
})

const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const refresh = () => page.getByRole('button', {name: 'Refresh the conversation'})

test('bumping the connection generation recreates the quick pane chat store', async () => {
  const sessionId = await createSession(coreRpc(coreBase()))
  harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
  harness.bumpConnectionGeneration()

  await expect.element(editor()).not.toBeInTheDocument()
  await expect.element(refresh(), {timeout: 8000}).toBeVisible()

  await coreControl.releaseFault(gate)

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
}, 30_000)
