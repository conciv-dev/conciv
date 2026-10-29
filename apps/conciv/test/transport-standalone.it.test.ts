import {expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Browser, Page} from 'playwright'
import {test as browserTest} from '@conciv/browser-fixture'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {watchChatWire, type ChatWireWatch} from '@conciv/extension-testkit/chat-wire'
import {httpRpcRequestUrls} from '@conciv/extension-testkit/rpc-counts'
import {serveStandaloneApp} from './helpers/static-app.js'
import {proxyTo, type ProxyCore} from './helpers/proxy.js'

const ASSISTANT_TEXT = 'Hello from standalone conciv'
const MOUNT_TIMEOUT_MS = 30_000
const SUITE_SETUP_TIMEOUT_MS = 90_000

const test = browserTest.extend<{
  $file: {kit: CoreKit; openCore: ProxyCore; app: {base: string; close: () => Promise<void>}}
}>({
  kit: [
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    async ({}, use) => {
      const kit = await bootCoreKit({id: 'standalone-transport', text: ASSISTANT_TEXT})
      await use(kit)
      await kit.cleanup()
    },
    {scope: 'file'},
  ],
  openCore: [
    async ({kit}, use) => {
      const openCore = await proxyTo(kit.base)
      await use(openCore)
      await openCore.close()
    },
    {scope: 'file'},
  ],
  app: [
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    async ({}, use) => {
      const app = await serveStandaloneApp()
      await use(app)
      await app.close()
    },
    {scope: 'file'},
  ],
})

function pageUrl(appBase: string, coreBase: string, transport: 'websocket' | 'fetch'): string {
  const settings = encodeURIComponent(JSON.stringify({transport}))
  return `${appBase}/?core=${encodeURIComponent(coreBase)}&settings=${settings}`
}

type Tab = {page: Page; chat: ChatWireWatch; chatSocketMark: number; httpRpcUrls: string[]; disposeHttpRpc: () => void}

async function openTab(browser: Browser, url: string): Promise<Tab> {
  const page = await browser.newPage()
  const http = httpRpcRequestUrls(page)
  const chat = watchChatWire(page)
  const chatSocketMark = chat.socketMark()
  await page.goto(url, {waitUntil: 'domcontentloaded'})
  return {page, chat, chatSocketMark, httpRpcUrls: http.urls, disposeHttpRpc: http.dispose}
}

async function completeTurn(page: Page): Promise<void> {
  await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('hi there')
  await page.keyboard.press('Enter')
  await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
}

test.describe('the standalone entry threads settings.transport into the chat connection', () => {
  test(
    'pins the event stream and never opens a chat websocket when settings say transport: fetch',
    async ({browser, app, openCore}) => {
      const tab = await openTab(browser, pageUrl(app.base, openCore.base, 'fetch'))
      try {
        const sent = tab.chat.nextTurn()
        await completeTurn(tab.page)
        expect((await sent).transport).toBe('fetch')
        expect(tab.chat.socketsOpenedSince(tab.chatSocketMark)).toBe(0)
        expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
      } finally {
        tab.disposeHttpRpc()
        await tab.page.close()
      }
    },
    SUITE_SETUP_TIMEOUT_MS,
  )

  test(
    'pins the chat websocket and never falls back to the event stream when settings say transport: websocket',
    async ({browser, app, openCore}) => {
      const tab = await openTab(browser, pageUrl(app.base, openCore.base, 'websocket'))
      try {
        const sent = tab.chat.nextTurn()
        await completeTurn(tab.page)
        expect((await sent).transport).toBe('websocket')
        expect(tab.chat.socketsOpenedSince(tab.chatSocketMark)).toBe(1)
        expect(tab.httpRpcUrls.length).toBeGreaterThan(0)
      } finally {
        tab.disposeHttpRpc()
        await tab.page.close()
      }
    },
    SUITE_SETUP_TIMEOUT_MS,
  )
})
