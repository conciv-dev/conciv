import {expect, test, type BrowserContext, type Page} from '@playwright/test'
import {httpRpcRequestUrls, rpcCallCursor, type RpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import {watchChatWire, type ChatWireWatch} from '@conciv/extension-testkit/chat-wire'
import {setupProxiedEmbedSuite} from './helpers/proxied-suite.js'

const ASSISTANT_TEXT = 'Hello from conciv'
const SHARED_CONTEXT_TAB_COUNT = 6
const MOUNT_TIMEOUT_MS = 20_000

const suite = setupProxiedEmbedSuite({text: ASSISTANT_TEXT})

type Tab = {page: Page; calls: RpcCallCursor; wire: ChatWireWatch; httpRpcUrls: string[]}

async function openTab(context: BrowserContext): Promise<Tab> {
  const page = await context.newPage()
  const {urls} = httpRpcRequestUrls(page)
  const calls = rpcCallCursor(page)
  const wire = watchChatWire(page)
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
  return {page, calls, wire, httpRpcUrls: urls}
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
  test('gives every tab rpc over http with no rpc websocket at all, and a working chat round trip in the last tab', async ({
    context,
  }) => {
    test.setTimeout(180_000)
    const tabs: Tab[] = []
    for (let index = 0; index < SHARED_CONTEXT_TAB_COUNT; index += 1) tabs.push(await openTab(context))

    const lastTab = tabs[SHARED_CONTEXT_TAB_COUNT - 1]
    if (!lastTab) throw new Error('expected six tabs')
    await openPanel(lastTab.page)
    await sendTurn(lastTab.page, 'hi there', 1)

    for (const tab of tabs) expect(tab.calls.socketsSince()).toBe(0)
    for (const tab of tabs) expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
  })

  test('settles the chatting tab on exactly one live chat socket', async ({context}) => {
    test.setTimeout(180_000)
    const tab = await openTab(context)

    await openPanel(tab.page)
    await sendTurn(tab.page, 'hi there', 1)

    expect(tab.wire.liveSockets()).toBe(1)
  })
})
