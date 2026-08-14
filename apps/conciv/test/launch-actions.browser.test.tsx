import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import type {GrabApi} from '@conciv/grab'
import {HostApiProvider} from '@conciv/extension/host'
import {ComposerActions} from '../src/composer/actions.js'
import {installFakeCore, type FakeCore} from './helpers/fake-core.js'
import {mountPane, PANE_SESSION} from './helpers/pane-harness.js'

let core: FakeCore | null = null

afterEach(() => {
  core?.restore()
  core = null
})

const grabApi: GrabApi = {
  pick: async () => null,
  comment: async () => null,
  cancel: () => {},
  isActive: () => false,
  stage: () => {},
  staged: () => [],
  clear: () => {},
}

function mountActions(config: Parameters<typeof installFakeCore>[0] = {}): FakeCore {
  const fake = installFakeCore(config)
  core = fake
  mountPane(() => (
    <HostApiProvider grab={grabApi} toast={() => {}}>
      <ComposerActions
        sessionId={PANE_SESSION}
        compacting={false}
        onCompact={() => {}}
        onNewSession={() => {}}
        onStageGrab={() => {}}
      />
    </HostApiProvider>
  ))
  return fake
}

async function openMenu(): Promise<void> {
  await page.getByRole('button', {name: 'Terminal options for Claude'}).click()
}

test('the terminal menu offers launch and copy, and the connect candidates are gone', async () => {
  mountActions()

  await openMenu()

  await expect.element(page.getByText('Open in Claude')).toBeVisible()
  await expect.element(page.getByText('Copy command')).toBeVisible()
  expect(page.getByText('Connect a running session').query()).toBeNull()
})

test('opening externally launches through the terminal extension', async () => {
  const fake = mountActions({launchOk: true})

  await openMenu()
  await page.getByText('Open in Claude').click()

  await expect.element(page.getByText('Opened in Claude.')).toBeVisible()
  expect(fake.calls.filter((call) => call.path === '/rpc/ext/terminal/launch')).toHaveLength(1)
})

test('when the terminal cannot open, the connect command is offered instead', async () => {
  const fake = mountActions({launchOk: false})

  await openMenu()
  await page.getByText('Open in Claude').click()

  await expect
    .element(page.getByText(/Command copied|Run in your terminal: claude --resume fake-session/))
    .toBeVisible()
  expect(fake.calls.filter((call) => call.path === '/rpc/ext/terminal/connectCommand')).toHaveLength(1)
})

test('copy command asks the terminal extension for the command', async () => {
  const fake = mountActions()

  await openMenu()
  await page.getByText('Copy command').click()

  await expect
    .element(page.getByText(/Command copied|Run in your terminal: claude --resume fake-session/))
    .toBeVisible()
  expect(fake.calls.filter((call) => call.path === '/rpc/ext/terminal/connectCommand')).toHaveLength(1)
})

test('a launch failure is surfaced instead of swallowed', async () => {
  mountActions({launchRejects: true})

  await openMenu()
  await page.getByText('Open in Claude').click()

  await expect.element(page.getByText('Couldn’t open Claude.')).toBeVisible()
})
