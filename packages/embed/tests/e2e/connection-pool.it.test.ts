import {expect, test, type BrowserContext, type Page} from '@playwright/test'
import {httpRpcRequestUrls, rpcCallCursor, type RpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import {setupProxiedEmbedSuite} from './helpers/proxied-suite.js'

const ASSISTANT_TEXT = 'Hello from conciv'
const SHARED_CONTEXT_TAB_COUNT = 6
const MOUNT_TIMEOUT_MS = 20_000

const suite = setupProxiedEmbedSuite({text: ASSISTANT_TEXT})

type Tab = {page: Page; calls: RpcCallCursor; httpRpcUrls: string[]}

async function openTab(context: BrowserContext): Promise<Tab> {
  const page = await context.newPage()
  const {urls} = httpRpcRequestUrls(page)
  const calls = rpcCallCursor(page)
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
  return {page, calls, httpRpcUrls: urls}
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
    for (let index = 0; index < SHARED_CONTEXT_TAB_COUNT; index += 1) tabs.push(await openTab(context))

    const lastTab = tabs[SHARED_CONTEXT_TAB_COUNT - 1]
    if (!lastTab) throw new Error('expected six tabs')
    await openPanel(lastTab.page)
    await sendTurn(lastTab.page, 'hi there', 1)

    for (const tab of tabs) expect(tab.calls.socketsSince()).toBe(1)
    for (const tab of tabs) expect(tab.httpRpcUrls).toEqual([])
  })
})
