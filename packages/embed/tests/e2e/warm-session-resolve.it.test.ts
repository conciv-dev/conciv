import {expect, test, type Page} from '@playwright/test'
import {rpcObserverFor} from '@conciv/extension-testkit/rpc-observer'
import {setupWidgetSuite} from './helpers/suite.js'
import {hostPage, serveHost} from '../helpers/host.js'

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

async function stallRpcFromNow(page: Page, paths: readonly (readonly string[])[]): Promise<void> {
  for (const path of paths) {
    const suffix = `/rpc/${path.join('/')}`
    await page.route(
      (url) => url.pathname.endsWith(suffix),
      () => new Promise<never>(() => {}),
    )
  }
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
    const observer = rpcObserverFor(page)

    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await expect(launcher(page)).toBeVisible({timeout: 15_000})
    await observer.completed({path: SESSIONS_LIST, timeout: 5_000})
    await observer.completed({path: SESSIONS_RESOLVE, timeout: 1_500}).catch(() => {})

    await stallRpcFromNow(page, [SESSIONS_LIST, SESSIONS_RESOLVE])
    await launcher(page).click()

    await expect(composer(page)).toBeVisible({timeout: 5_000})
  })
})
