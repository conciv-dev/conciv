import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {createShellHarness} from './helpers/shell-harness.js'
import {expectRetryRecovers} from './helpers/retry-recovery.js'

const PANEL_SESSION = 'conciv_1'
const harness = createShellHarness(PANEL_SESSION)
const mountShell = harness.mountShell

afterEach(harness.dispose)

const errorScreen = () => page.getByText(/couldn.t reach the engine/)
const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const genericBoundary = () => page.getByText('Something went wrong!')
const engineUnreachableNotice = () => page.getByText('conciv lost connection to the engine.')
const serverError = () => page.getByText('Internal Server Error')

test('a dead engine at boot shows our error screen, not the generic boundary, and Retry recovers it', async () => {
  mountShell('/panel/latest?open=true', {networkFail: true})

  await expect.element(errorScreen(), {timeout: 8000}).toBeVisible()
  await expect.element(genericBoundary()).not.toBeInTheDocument()

  harness.core()?.setNetworkFail(false)
  await page
    .getByRole('alert')
    .filter({hasText: /couldn.t reach the engine/})
    .getByRole('button', {name: 'Retry'})
    .click()

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
})

test('a server error while resolving /panel/latest shows the actual error, not the unreachable message', async () => {
  mountShell('/panel/latest?open=true', {resolveRejects: true})

  await expect.element(serverError(), {timeout: 8000}).toBeVisible()
  await expect.element(errorScreen()).not.toBeInTheDocument()
  await expect.element(genericBoundary()).not.toBeInTheDocument()

  await expectRetryRecovers(() => harness.core()?.setResolveRejects(false), editor, serverError)
})

test('a healthy engine resolves /panel/latest straight to the warm session', async () => {
  mountShell('/panel/latest?open=true')

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(errorScreen()).not.toBeInTheDocument()
})

test('a sustained outage raises exactly one standing notice, and it clears once the engine returns', async () => {
  mountShell(`/panel/${PANEL_SESSION}?open=true`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  harness.core()?.setNetworkFail(true)
  await expect.element(engineUnreachableNotice(), {timeout: 8000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

  harness.core()?.setNetworkFail(false)
  await expect.element(engineUnreachableNotice(), {timeout: 8000}).not.toBeInTheDocument()
})

test('a 500 from an otherwise healthy engine never raises the unreachable notice', async () => {
  mountShell(`/panel/${PANEL_SESSION}?open=true`, {rejectSend: true})
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  await editor().fill('rename the widget package')
  await userEvent.keyboard('{Enter}')

  await expect
    .element(page.getByRole('region', {name: /Notifications/}))
    .toHaveTextContent(/Internal Server Error|could not be sent/)
  await expect.element(engineUnreachableNotice()).not.toBeInTheDocument()
})

test('a failing engine-info probe on an otherwise healthy connection never raises the unreachable notice', async () => {
  mountShell(`/panel/${PANEL_SESSION}?open=true`, {rejectEngineProbe: true})

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await harness.core()?.idle()
  await expect.element(engineUnreachableNotice()).not.toBeInTheDocument()
})

test('the composer disables sending with a distinct message once the engine is unreachable', async () => {
  mountShell(`/panel/${PANEL_SESSION}?open=true`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await editor().fill('rename the widget package')

  harness.core()?.setNetworkFail(true)

  await expect
    .element(page.getByRole('button', {name: 'conciv lost connection to the engine'}), {timeout: 8000})
    .toBeVisible()
  await expect.element(page.getByRole('button', {name: 'conciv lost connection to the engine'})).toBeDisabled()
})
