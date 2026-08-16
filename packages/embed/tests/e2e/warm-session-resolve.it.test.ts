import {expect, test, type Page} from '@playwright/test'
import {gateRpcCalls, type RpcGate} from '@conciv/extension-testkit/rpc-fault'
import {watchRpcWire} from '@conciv/extension-testkit/rpc-wire'
import {setupWidgetSuite} from './helpers/suite.js'
import {hostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'

const suite = setupWidgetSuite()

const COMPOSER_NAME = 'Message the conciv agent'
const LAUNCHER_NAME = 'Open conciv chat'
const SESSIONS_LIST = ['sessions', 'list'] as const
const SESSIONS_RESOLVE = ['sessions', 'resolve'] as const

const dedicatedHosts: Array<{close: () => Promise<void>}> = []

test.afterEach(async () => {
  for (const dedicatedHost of dedicatedHosts.splice(0)) await dedicatedHost.close()
})

function composer(page: Page) {
  return page.getByRole('textbox', {name: COMPOSER_NAME})
}

function launcher(page: Page) {
  return page.getByRole('button', {name: LAUNCHER_NAME})
}

type StalledSessionRpcs = {list: RpcGate; resolve: RpcGate}

async function stallSessionRpcs(page: Page): Promise<StalledSessionRpcs> {
  const list = await gateRpcCalls(page, {path: SESSIONS_LIST})
  const resolve = await gateRpcCalls(page, {path: SESSIONS_RESOLVE})
  return {list, resolve}
}

test.describe('first panel open does not re-run session resolution at click time', () => {
  test('clicking the launcher after boot has settled still reveals the composer with sessions RPCs stalled', async ({
    page,
  }) => {
    test.setTimeout(30_000)
    await suite.kit().rpc.sessions.create()
    const host = await serveHost(() =>
      hostPage({apiBase: suite.kit().base, widget: '{"quickTerminal":false,"transport":"fetch"}'}),
    )
    dedicatedHosts.push(host)
    const wire = watchRpcWire(page)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await expect(launcher(page)).toBeVisible({timeout: 15_000})
    await wire.sessionsBootTraffic()

    const stalled = await stallSessionRpcs(page)
    try {
      await launcher(page).click()

      await expect(composer(page)).toBeVisible({timeout: 5_000})
      expect(stalled.resolve.pending()).toBe(0)
    } finally {
      await stalled.list.dispose()
      await stalled.resolve.dispose()
    }
  })
})
