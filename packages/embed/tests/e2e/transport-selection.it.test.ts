import {expect, test, type Page} from '@playwright/test'
import {httpRpcRequestUrls, rpcCallCursor, type RpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import {watchRpcWire, type RpcWireWatch} from '@conciv/extension-testkit/rpc-wire'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage, serveHost} from '../helpers/host.js'
import {proxyTo, type ProxyCore} from '../helpers/proxy.js'
import {setNavigation} from './helpers/navigation.js'

const ASSISTANT_TEXT = 'Hello from conciv'
const MOUNT_TIMEOUT_MS = 30_000

let kit: EmbedKit
let openCore: ProxyCore
let blockedCore: ProxyCore
let openHost: {base: string; close: () => Promise<void>}
let blockedHost: {base: string; close: () => Promise<void>}
let pinnedFetchHost: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  openCore = await proxyTo(kit.base)
  blockedCore = await proxyTo(kit.base, {blockUpgrades: true})
  openHost = await serveHost(() => hostPage({apiBase: openCore.base, widget: '{"quickTerminal":false}'}))
  blockedHost = await serveHost(() => hostPage({apiBase: blockedCore.base, widget: '{"quickTerminal":false}'}))
  pinnedFetchHost = await serveHost(() =>
    hostPage({apiBase: openCore.base, widget: '{"quickTerminal":false,"transport":"fetch"}'}),
  )
})

test.afterAll(async () => {
  await openHost.close()
  await blockedHost.close()
  await pinnedFetchHost.close()
  await openCore.close()
  await blockedCore.close()
  await kit.cleanup()
})

test.beforeEach(async () => {
  expect(await setNavigation(kit, [{href: '/'}])).toBe(true)
})

type Tab = {page: Page; calls: RpcCallCursor; wire: RpcWireWatch; httpRpcUrls: string[]}

async function openTab(page: Page, hostBase: string): Promise<Tab> {
  const {urls} = httpRpcRequestUrls(page)
  const calls = rpcCallCursor(page)
  const wire = watchRpcWire(page)
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

test.describe('the browser factory picks one transport per tab at boot', () => {
  test('rides the websocket when the boot probe succeeds', async ({page}) => {
    test.setTimeout(90_000)
    const tab = await openTab(page, openHost.base)
    await completeTurn(tab.page)
    expect(tab.calls.socketsSince()).toBe(1)
    expect(tab.httpRpcUrls).toEqual([])
  })

  test('falls back to fetch for the whole tab when the websocket upgrade is blocked', async ({page}) => {
    test.setTimeout(120_000)
    const tab = await openTab(page, blockedHost.base)
    const sent = tab.wire.nextChatSend()
    await completeTurn(tab.page)
    expect((await sent).transport).toBe('fetch')
    expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
  })

  test('honours the fetch escape hatch without probing the websocket', async ({page}) => {
    test.setTimeout(120_000)
    const tab = await openTab(page, pinnedFetchHost.base)
    const sent = tab.wire.nextChatSend()
    await completeTurn(tab.page)
    expect(tab.calls.socketsSince()).toBe(0)
    expect((await sent).transport).toBe('fetch')
  })
})
