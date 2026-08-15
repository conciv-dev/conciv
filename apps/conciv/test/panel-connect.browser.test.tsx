import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {defineExtension, getExtensionApi, type RegisterExtension} from '@conciv/extension'
import {Show, type JSX} from 'solid-js'
import {coreControl} from './helpers/core-control.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'
import {expectRetryRecovers} from './helpers/retry-recovery.js'

const FOUND_API_BASE = 'http://found.test'
const CONNECT_PROBE_NAME = 'connect-probe'
const RESOLVE_PATH = ['sessions', 'resolve']

const core = {base: ''}
const harness = createShellHarness(() => core.base)
const faults = trackedFaults()

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'panel-connect', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(harness.dispose)

function ConnectProbe(): JSX.Element {
  const connect = getExtensionApi(CONNECT_PROBE_NAME).useConnect()
  return (
    <button type="button" onClick={() => connect.found(FOUND_API_BASE)}>
      Simulate found
    </button>
  )
}

const connectProbe = defineExtension({
  name: CONNECT_PROBE_NAME,
  Component: () => (
    <Show when={getExtensionApi(CONNECT_PROBE_NAME).useSlot() === 'connect'}>
      <ConnectProbe />
    </Show>
  ),
}).client(() => ({value: {}}))

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof connectProbe> {}
}

const mountShell = (): void => harness.mountShell('/panel/connect?open=true', [connectProbe])

const simulateFound = () => page.getByRole('button', {name: 'Simulate found'})
const bindFailure = () => page.getByText(/conciv couldn.t connect to that workspace/)
const serverError = () => page.getByText('Internal Server Error')
const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

test('a bind that fails with a transport failure shows the connect failure screen, and retrying against a healthy engine hands off to the panel', async () => {
  const unreachable = await faults.install({kind: 'abort', path: RESOLVE_PATH})
  mountShell()

  await simulateFound().click()

  await expect.element(bindFailure(), {timeout: 8000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

  await expectRetryRecovers(() => coreControl.releaseFault(unreachable), editor, bindFailure)
}, 30_000)

test('a bind that fails with a server error shows the actual error, not the workspace-unreachable message', async () => {
  const refused = await faults.install({kind: 'fail', path: RESOLVE_PATH, status: 500})
  mountShell()

  await expect.element(simulateFound(), {timeout: 8000}).toBeVisible()
  await simulateFound().click()

  await expect.element(serverError(), {timeout: 8000}).toBeVisible()
  await expect.element(bindFailure()).not.toBeInTheDocument()

  await expectRetryRecovers(() => coreControl.releaseFault(refused), editor, serverError)
}, 30_000)

test('a bind that succeeds on the first try never shows the failure screen', async () => {
  mountShell()

  await simulateFound().click()

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(bindFailure()).not.toBeInTheDocument()
}, 30_000)
