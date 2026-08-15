import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'
import {expectRetryRecovers} from './helpers/retry-recovery.js'

const core = {base: ''}
const harness = createShellHarness(() => core.base)
const faults = trackedFaults()

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'reachability-flows', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(harness.dispose)

const errorScreen = () => page.getByText(/couldn.t reach the engine/)
const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const genericBoundary = () => page.getByText('Something went wrong!')
const engineUnreachableNotice = () => page.getByText('conciv lost connection to the engine.')
const serverError = () => page.getByText('Internal Server Error')

async function openSessionPanel(): Promise<void> {
  const sessionId = await createSession(coreRpc(core.base))
  harness.mountShell(`/panel/${sessionId}?open=true`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()
}

test('a dead engine at boot shows our error screen, not the generic boundary, and Retry recovers it', async () => {
  const outage = await faults.install({kind: 'abort'})
  harness.mountShell('/panel/latest?open=true')

  await expect.element(errorScreen(), {timeout: 8000}).toBeVisible()
  await expect.element(genericBoundary()).not.toBeInTheDocument()

  await coreControl.releaseFault(outage)
  await page
    .getByRole('alert')
    .filter({hasText: /couldn.t reach the engine/})
    .getByRole('button', {name: 'Retry'})
    .click()

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
}, 30_000)

test('a server error while resolving /panel/latest shows the actual error, not the unreachable message', async () => {
  const refused = await faults.install({kind: 'fail', path: ['sessions', 'resolve'], status: 500})
  harness.mountShell('/panel/latest?open=true')

  await expect.element(serverError(), {timeout: 8000}).toBeVisible()
  await expect.element(errorScreen()).not.toBeInTheDocument()
  await expect.element(genericBoundary()).not.toBeInTheDocument()

  await expectRetryRecovers(() => coreControl.releaseFault(refused), editor, serverError)
}, 30_000)

test('a healthy engine resolves /panel/latest straight to the warm session', async () => {
  harness.mountShell('/panel/latest?open=true')

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(errorScreen()).not.toBeInTheDocument()
}, 30_000)

test('a sustained outage raises exactly one standing notice, and it clears once the engine returns', async () => {
  await openSessionPanel()

  const outage = await faults.install({kind: 'abort'})
  await editor().fill('rename the widget package')

  await expect.element(engineUnreachableNotice(), {timeout: 8000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

  await coreControl.releaseFault(outage)
  await expect.element(engineUnreachableNotice(), {timeout: 8000}).not.toBeInTheDocument()
}, 30_000)

test('a 500 from an otherwise healthy engine never raises the unreachable notice', async () => {
  const refused = await faults.install({kind: 'fail', path: ['chat', 'send'], status: 500})
  await openSessionPanel()

  await editor().fill('rename the widget package')
  await userEvent.keyboard('{Enter}')

  await expect
    .element(page.getByRole('region', {name: /Notifications/}))
    .toHaveTextContent(/Internal Server Error|could not be sent/)
  await expect.element(engineUnreachableNotice()).not.toBeInTheDocument()

  await coreControl.releaseFault(refused)
}, 30_000)

test('a failing engine-info probe on an otherwise healthy connection never raises the unreachable notice', async () => {
  const refused = await faults.install({kind: 'fail', path: ['meta', 'engine'], status: 500})
  await openSessionPanel()

  await coreControl.awaitFaultAnswered(refused)
  await expect.element(engineUnreachableNotice()).not.toBeInTheDocument()

  await coreControl.releaseFault(refused)
}, 30_000)

test('the composer disables sending with a distinct message once the engine is unreachable', async () => {
  await openSessionPanel()

  const outage = await faults.install({kind: 'abort'})
  await editor().fill('rename the widget package')

  await expect
    .element(page.getByRole('button', {name: 'conciv lost connection to the engine'}), {timeout: 8000})
    .toBeVisible()
  await expect.element(page.getByRole('button', {name: 'conciv lost connection to the engine'})).toBeDisabled()

  await coreControl.releaseFault(outage)
}, 30_000)
