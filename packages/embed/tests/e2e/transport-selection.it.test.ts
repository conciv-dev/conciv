import {expect, test, type Page} from '@playwright/test'
import {httpRpcRequestUrls, rpcCallCursor, type RpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import {watchChatWire, type ChatWireWatch} from '@conciv/extension-testkit/chat-wire'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {proxyTo, type ProxyCore} from '../helpers/proxy.js'

const ASSISTANT_TEXT = 'Hello from conciv'
const MOUNT_TIMEOUT_MS = 30_000

let kit: EmbedKit
let openCore: ProxyCore
let blockedCore: ProxyCore
let openHost: {base: string; close: () => Promise<void>}
let blockedHost: {base: string; close: () => Promise<void>}
let pinnedFetchHost: {base: string; close: () => Promise<void>}

test.beforeEach(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  openCore = await proxyTo(kit.base)
  blockedCore = await proxyTo(kit.base, {blockUpgrades: true})
  openHost = await serveHost(() => hostPage({apiBase: openCore.base, widget: '{"quickTerminal":false}'}))
  blockedHost = await serveHost(() => hostPage({apiBase: blockedCore.base, widget: '{"quickTerminal":false}'}))
  pinnedFetchHost = await serveHost(() =>
    hostPage({apiBase: openCore.base, widget: '{"quickTerminal":false,"transport":"fetch"}'}),
  )
})

test.afterEach(async () => {
  await openHost.close()
  await blockedHost.close()
  await pinnedFetchHost.close()
  await openCore.close()
  await blockedCore.close()
  await kit.cleanup()
})

type Tab = {page: Page; calls: RpcCallCursor; wire: ChatWireWatch; httpRpcUrls: string[]}

async function openTab(page: Page, hostBase: string): Promise<Tab> {
  const {urls} = httpRpcRequestUrls(page)
  const calls = rpcCallCursor(page)
  const wire = watchChatWire(page)
  await page.goto(hostBase, {waitUntil: 'domcontentloaded'})
  return {page, calls, wire, httpRpcUrls: urls}
}

async function completeTurn(page: Page): Promise<void> {
  await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('hi there')
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
}

test.describe('the chat connection picks one delivery transport per tab at boot', () => {
  test('rides the chat websocket when the boot probe succeeds, while rpc rides http', async ({page}) => {
    test.setTimeout(120_000)
    const tab = await openTab(page, openHost.base)
    const sent = tab.wire.nextTurn()
    await completeTurn(tab.page)
    expect((await sent).transport).toBe('websocket')
    expect(tab.calls.socketsSince()).toBe(0)
    expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
  })

  test('falls back to the chat event stream for the whole tab when the websocket upgrade is blocked', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const tab = await openTab(page, blockedHost.base)
    const sent = tab.wire.nextTurn()
    await completeTurn(tab.page)
    expect((await sent).transport).toBe('fetch')
    expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
  })

  test('honours the fetch escape hatch without ever opening a chat socket', async ({page}) => {
    test.setTimeout(120_000)
    const tab = await openTab(page, pinnedFetchHost.base)
    const mark = tab.wire.socketMark()
    const sent = tab.wire.nextTurn()
    await completeTurn(tab.page)
    expect((await sent).transport).toBe('fetch')
    expect(tab.wire.socketsOpenedSince(mark)).toBe(0)
  })
})
