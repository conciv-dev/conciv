import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {bootedCore} from './helpers/booted-core.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, sendTurn} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'

const coreBase = bootedCore('launcher-activity')
const harness = createShellHarness(coreBase)

afterEach(async () => {
  await coreControl.releaseTurn()
  harness.dispose()
})

const launcher = () => page.getByRole('button', {name: 'Minimize conciv chat'})
const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const sessionOptions = () => page.getByRole('button', {name: 'Session options'})
const sessionPicker = () => page.getByRole('button', {name: 'Session: the session in front'})
const backgroundRow = () => page.getByRole('option', {name: /the session behind.*running/})

test('a run in a session the launcher does not target leaves the launcher asleep', async () => {
  await page.viewport(1000, 900)
  const rpc = coreRpc(coreBase())
  const activeId = await createSession(rpc)
  await rpc.sessions.rename({sessionId: activeId, title: 'the session in front'})
  const backgroundId = await createSession(rpc)
  await rpc.sessions.rename({sessionId: backgroundId, title: 'the session behind'})
  await coreControl.holdTurn()
  await sendTurn(coreBase(), backgroundId, 'a run nobody opened')

  harness.mountShell(`/panel/${activeId}?open=true`)
  await expect.element(composer(), {timeout: 8000}).toBeVisible()
  await sessionOptions().click()
  await sessionPicker().click()
  await expect.element(backgroundRow(), {timeout: 8000}).toBeVisible()

  await expect.element(launcher(), {timeout: 2000}).toHaveAttribute('aria-busy', 'false')
}, 30_000)

test('the launcher follows the targeted session from the start of a run to its settle', async () => {
  await page.viewport(1000, 900)
  const rpc = coreRpc(coreBase())
  const sessionId = await createSession(rpc)

  harness.mountShell(`/panel/${sessionId}?open=true`)
  await expect.element(composer(), {timeout: 8000}).toBeVisible()
  await expect.element(launcher()).toHaveAttribute('aria-busy', 'false')

  await coreControl.holdTurn()
  await sendTurn(coreBase(), sessionId, 'a run this widget never sent')

  await expect.element(launcher(), {timeout: 8000}).toHaveAttribute('aria-busy', 'true')

  await coreControl.releaseTurn()

  await expect.element(launcher(), {timeout: 8000}).toHaveAttribute('aria-busy', 'false')
}, 30_000)
