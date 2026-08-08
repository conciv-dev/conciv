import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {httpRpcRequestUrls, observeRpc, type RpcObserver} from '@conciv/extension-testkit/rpc-observer'
import {serveStandaloneApp} from './helpers/static-app.js'
import {proxyTo, type ProxyCore} from './helpers/proxy.js'

const ASSISTANT_TEXT = 'Hello from standalone conciv'
const MOUNT_TIMEOUT_MS = 30_000

let browser: Browser
let kit: CoreKit
let openCore: ProxyCore
let app: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootCoreKit({id: 'standalone-transport', text: ASSISTANT_TEXT})
  openCore = await proxyTo(kit.base)
  app = await serveStandaloneApp()
}, 90_000)

afterAll(async () => {
  await browser.close()
  await app.close()
  await openCore.close()
  await kit.cleanup()
})

function pageUrl(coreBase: string, transport: 'websocket' | 'fetch'): string {
  const settings = encodeURIComponent(JSON.stringify({transport}))
  return `${app.base}/?core=${encodeURIComponent(coreBase)}&settings=${settings}`
}

type Tab = {page: Page; observer: RpcObserver; httpRpcUrls: string[]; disposeHttpRpc: () => void}

async function openTab(url: string): Promise<Tab> {
  const page = await browser.newPage()
  const http = httpRpcRequestUrls(page)
  const observer = observeRpc(page)
  await page.goto(url, {waitUntil: 'domcontentloaded'})
  return {page, observer, httpRpcUrls: http.urls, disposeHttpRpc: http.dispose}
}

async function completeTurn(page: Page): Promise<void> {
  await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('hi there')
  await page.keyboard.press('Enter')
  await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
}

describe('the standalone entry threads settings.transport into the browser rpc client', () => {
  it('pins fetch and never opens a websocket when settings say transport: fetch', async () => {
    const tab = await openTab(pageUrl(openCore.base, 'fetch'))
    try {
      await completeTurn(tab.page)
      expect(tab.observer.socketCount()).toBe(0)
      expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
    } finally {
      tab.observer.dispose()
      tab.disposeHttpRpc()
      await tab.page.close()
    }
  })

  it('pins the websocket and never falls back to fetch when settings say transport: websocket', async () => {
    const tab = await openTab(pageUrl(openCore.base, 'websocket'))
    try {
      await completeTurn(tab.page)
      expect(tab.observer.socketCount()).toBe(1)
      expect(tab.httpRpcUrls).toEqual([])
    } finally {
      tab.observer.dispose()
      tab.disposeHttpRpc()
      await tab.page.close()
    }
  })
})
