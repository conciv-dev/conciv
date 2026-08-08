import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {observeRpc, type RpcObserver} from '@conciv/extension-testkit/rpc-observer'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'
import {proxyTo, type ProxyCore} from './helpers/proxy.js'
import {setNavigation} from './helpers/navigation.js'

const ASSISTANT_TEXT = 'Hello from conciv'
const MOUNT_TIMEOUT_MS = 30_000

let browser: Browser
let kit: EmbedKit
let openCore: ProxyCore
let blockedCore: ProxyCore
let openHost: {base: string; close: () => Promise<void>}
let blockedHost: {base: string; close: () => Promise<void>}
let pinnedFetchHost: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  openCore = await proxyTo(kit.base)
  blockedCore = await proxyTo(kit.base, {blockUpgrades: true})
  openHost = await serveHost(() => hostPage({apiBase: openCore.base, widget: '{"quickTerminal":false}'}))
  blockedHost = await serveHost(() => hostPage({apiBase: blockedCore.base, widget: '{"quickTerminal":false}'}))
  pinnedFetchHost = await serveHost(() =>
    hostPage({apiBase: openCore.base, widget: '{"quickTerminal":false,"transport":"fetch"}'}),
  )
}, 90_000)

afterAll(async () => {
  await browser.close()
  await openHost.close()
  await blockedHost.close()
  await pinnedFetchHost.close()
  await openCore.close()
  await blockedCore.close()
  await kit.cleanup()
})

beforeEach(async () => {
  expect(await setNavigation(kit, [{href: '/'}])).toBe(true)
})

type Tab = {page: Page; observer: RpcObserver; httpRpcUrls: string[]}

async function openTab(hostBase: string): Promise<Tab> {
  const page = await browser.newPage()
  const httpRpcUrls: string[] = []
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (pathname.startsWith('/rpc/') || pathname === '/rpc') httpRpcUrls.push(request.url())
  })
  const observer = observeRpc(page)
  await page.goto(hostBase, {waitUntil: 'domcontentloaded'})
  return {page, observer, httpRpcUrls}
}

async function completeTurn(page: Page): Promise<void> {
  await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('hi there')
  await page.getByRole('button', {name: 'Send message'}).click()
  await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
}

describe('the browser factory picks one transport per tab at boot', () => {
  it('rides the websocket when the boot probe succeeds', async () => {
    const tab = await openTab(openHost.base)
    try {
      await completeTurn(tab.page)
      expect(tab.observer.socketCount()).toBe(1)
      expect(tab.httpRpcUrls).toEqual([])
    } finally {
      tab.observer.dispose()
      await tab.page.close()
    }
  })

  it('falls back to fetch for the whole tab when the websocket upgrade is blocked', async () => {
    const tab = await openTab(blockedHost.base)
    try {
      await completeTurn(tab.page)
      const call = await tab.observer.completed({path: ['chat', 'send'], timeout: MOUNT_TIMEOUT_MS})
      expect(call.transport).toBe('fetch')
      expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
    } finally {
      tab.observer.dispose()
      await tab.page.close()
    }
  })

  it('honours the fetch escape hatch without probing the websocket', async () => {
    const tab = await openTab(pinnedFetchHost.base)
    try {
      await completeTurn(tab.page)
      expect(tab.observer.socketCount()).toBe(0)
      const call = await tab.observer.completed({path: ['chat', 'send'], timeout: MOUNT_TIMEOUT_MS})
      expect(call.transport).toBe('fetch')
    } finally {
      tab.observer.dispose()
      await tab.page.close()
    }
  })
})
