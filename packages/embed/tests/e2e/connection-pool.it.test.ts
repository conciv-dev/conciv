import {expect, test, type BrowserContext, type Page} from '@playwright/test'
import {observeRpc, type RpcObserver} from '@conciv/extension-testkit/rpc-observer'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage, serveHost} from '../helpers/host.js'
import {proxyTo, type ProxyCore} from '../helpers/proxy.js'
import {setNavigation} from './helpers/navigation.js'

const ASSISTANT_TEXT = 'Hello from conciv'
const SHARED_CONTEXT_TAB_COUNT = 6
const MOUNT_TIMEOUT_MS = 20_000

let kit: EmbedKit
let core: ProxyCore
let host: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  core = await proxyTo(kit.base)
  host = await serveHost(() => hostPage({apiBase: core.base, widget: '{"quickTerminal":false}'}))
})

test.afterAll(async () => {
  await host.close()
  await core.close()
  await kit.cleanup()
})

test.beforeEach(async () => {
  expect(await setNavigation(kit, [{href: '/'}])).toBe(true)
})

type Tab = {page: Page; observer: RpcObserver; httpRpcUrls: string[]}

async function openTab(context: BrowserContext): Promise<Tab> {
  const page = await context.newPage()
  const httpRpcUrls: string[] = []
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (pathname.startsWith('/rpc/') || pathname === '/rpc') httpRpcUrls.push(request.url())
  })
  const observer = observeRpc(page)
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
  return {page, observer, httpRpcUrls}
}

async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({
    timeout: MOUNT_TIMEOUT_MS,
  })
}

async function sendTurn(page: Page, text: string, expectedReplies: number): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(expectedReplies, {timeout: MOUNT_TIMEOUT_MS})
}

test.describe('six widget tabs sharing one browserContext connection pool (the per-test context fixture, not newPage, because the shared-context http connection limit is exactly what this gate measures)', () => {
  test('gives every tab one rpc websocket, no rpc over http, and a working chat round trip in the last tab', async ({
    context,
  }) => {
    test.setTimeout(180_000)
    const tabs: Tab[] = []
    try {
      for (let index = 0; index < SHARED_CONTEXT_TAB_COUNT; index += 1) tabs.push(await openTab(context))

      const lastTab = tabs[SHARED_CONTEXT_TAB_COUNT - 1]
      if (!lastTab) throw new Error('expected six tabs')
      await openPanel(lastTab.page)
      await sendTurn(lastTab.page, 'hi there', 1)

      for (const tab of tabs) expect(tab.observer.socketCount()).toBe(1)
      for (const tab of tabs) expect(tab.httpRpcUrls).toEqual([])
    } finally {
      for (const tab of tabs) tab.observer.dispose()
    }
  })
})
