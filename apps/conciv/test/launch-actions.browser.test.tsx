import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import type {GrabApi} from '@conciv/grab'
import {HostApiProvider} from '@conciv/extension/host'
import {ComposerActions as ComposerActionsPrimitive, ComposerActionsHost} from '@conciv/ui-kit-chat'
import {ComposerActions} from '../src/composer/actions.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const CONNECT_COMMAND_PATH = ['ext', 'terminal', 'connectCommand']
const LAUNCH_PATH = ['ext', 'terminal', 'launch']

const core = {base: ''}
const mounted: {pane: PaneMount | null} = {pane: null}
const faults = trackedFaults()

const grabApi: GrabApi = {
  pick: async () => null,
  comment: async () => null,
  cancel: () => {},
  isActive: () => false,
  stage: () => {},
  staged: () => [],
  clear: () => {},
}

beforeAll(async () => {
  const booted = await coreControl.bootCore({
    id: 'launch-actions',
    displayName: 'Claude',
    connect: true,
    terminal: true,
    resume: true,
    allowedOrigins: [window.location.origin],
  })
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(async () => {
  mounted.pane?.dispose()
  mounted.pane = null
  await coreControl.setTerminalLaunch(true)
})

async function mountActions(): Promise<void> {
  const sessionId = await createSession(coreRpc(core.base))
  mounted.pane = mountPane({base: core.base, sessionId}, () => (
    <HostApiProvider grab={grabApi} toast={() => {}}>
      <ComposerActionsHost>
        <ComposerActionsPrimitive.Trigger>
          <span aria-hidden="true" class="size-5 block" />
        </ComposerActionsPrimitive.Trigger>
        <ComposerActions
          sessionId={sessionId}
          compacting={false}
          onCompact={() => {}}
          onNewSession={() => {}}
          onStageGrab={() => {}}
        />
      </ComposerActionsHost>
    </HostApiProvider>
  ))
}

async function openMenu(): Promise<void> {
  await page.getByRole('button', {name: 'Terminal options for Claude'}).click()
}

test('the terminal menu offers launch and copy, and the connect candidates are gone', async () => {
  await mountActions()

  await openMenu()

  await expect.element(page.getByText('Open in Claude')).toBeVisible()
  await expect.element(page.getByText('Copy command')).toBeVisible()
  expect(page.getByText('Connect a running session').query()).toBeNull()
})

test('opening externally launches through the terminal extension', async () => {
  await mountActions()

  await openMenu()
  await page.getByText('Open in Claude').click()

  await expect.element(page.getByText('Opened in Claude.')).toBeVisible()
  expect(await coreControl.terminalLaunches()).toBe(1)
  expect(await coreControl.rpcCallCount(LAUNCH_PATH)).toBe(1)
})

test('when the terminal cannot open, the connect command is offered instead', async () => {
  await coreControl.setTerminalLaunch(false)
  await mountActions()
  const before = await coreControl.rpcCallCount(CONNECT_COMMAND_PATH)

  await openMenu()
  await page.getByText('Open in Claude').click()

  await expect.element(page.getByText(/Command copied|Run in your terminal: cd .*'claude' '--resume'/)).toBeVisible()
  expect((await coreControl.rpcCallCount(CONNECT_COMMAND_PATH)) - before).toBe(1)
})

test('copy command asks the terminal extension for the command', async () => {
  await mountActions()
  const before = await coreControl.rpcCallCount(CONNECT_COMMAND_PATH)

  await openMenu()
  await page.getByText('Copy command').click()

  await expect.element(page.getByText(/Command copied|Run in your terminal: cd .*'claude' '--resume'/)).toBeVisible()
  expect((await coreControl.rpcCallCount(CONNECT_COMMAND_PATH)) - before).toBe(1)
})

test('a launch failure is surfaced instead of swallowed', async () => {
  const fault = await faults.install({kind: 'fail', path: LAUNCH_PATH, status: 500})
  await mountActions()

  await openMenu()
  await page.getByText('Open in Claude').click()

  await expect.element(page.getByText('Couldn’t open Claude.')).toBeVisible()

  await coreControl.releaseFault(fault)
})
