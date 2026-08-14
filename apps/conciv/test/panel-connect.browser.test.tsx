import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {defineExtension} from '@conciv/extension'
import {getHostApi} from '@conciv/extension/host'
import {Show, type JSX} from 'solid-js'
import {createShellHarness} from './helpers/shell-harness.js'
import {expectRetryRecovers} from './helpers/retry-recovery.js'

const PANEL_SESSION = 'conciv_1'
const FOUND_API_BASE = 'http://found.test'
const harness = createShellHarness(PANEL_SESSION)

afterEach(harness.dispose)

function ConnectProbe(): JSX.Element {
  const connect = getHostApi().useConnect()
  return (
    <button type="button" onClick={() => connect.found(FOUND_API_BASE)}>
      Simulate found
    </button>
  )
}

const connectProbe = defineExtension({
  name: 'connect-probe',
  Component: () => (
    <Show when={getHostApi().useSlot() === 'connect'}>
      <ConnectProbe />
    </Show>
  ),
}).client(() => ({value: {}}))

const mountShell = (config: Parameters<typeof harness.mountShell>[1] = {}): void =>
  harness.mountShell('/panel/connect?open=true', config, [connectProbe])

const simulateFound = () => page.getByRole('button', {name: 'Simulate found'})
const bindFailure = () => page.getByText(/conciv couldn.t connect to that workspace/)
const serverError = () => page.getByText('Internal Server Error')
const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

test('a bind that fails with a transport failure shows the connect failure screen, and retrying against a healthy engine hands off to the panel', async () => {
  mountShell({resolveTransportFails: true})

  await simulateFound().click()

  await expect.element(bindFailure(), {timeout: 8000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

  await expectRetryRecovers(() => harness.core()?.setResolveTransportFails(false), editor, bindFailure)
})

test('a bind that fails with a server error shows the actual error, not the workspace-unreachable message', async () => {
  mountShell({resolveRejects: true})

  await expect.element(simulateFound(), {timeout: 8000}).toBeVisible()
  await simulateFound().click()

  await expect.element(serverError(), {timeout: 8000}).toBeVisible()
  await expect.element(bindFailure()).not.toBeInTheDocument()

  await expectRetryRecovers(() => harness.core()?.setResolveRejects(false), editor, serverError)
})

test('a bind that succeeds on the first try never shows the failure screen', async () => {
  mountShell()

  await simulateFound().click()

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(bindFailure()).not.toBeInTheDocument()
})
