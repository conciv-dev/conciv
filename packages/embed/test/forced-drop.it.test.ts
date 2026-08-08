import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'
import {proxyTo, type ProxyCore} from './helpers/proxy.js'
import {rpcObserverFor, setNavigation} from './helpers/navigation.js'

const ASSISTANT_TEXT = 'Reply across the drop'
const FIRST_TEXT = 'first turn before the drop'
const SECOND_TEXT = 'second turn after the drop'
const MOUNT_TIMEOUT_MS = 20_000

let browser: Browser
let kit: EmbedKit
let core: ProxyCore
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  core = await proxyTo(kit.base)
  host = await serveHost(() => hostPage({apiBase: core.base, widget: '{"quickTerminal":false}'}))
}, 90_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await core.close()
  await kit.cleanup()
})

beforeEach(async () => {
  expect(await setNavigation(kit, [{href: '/'}])).toBe(true)
})

async function sendTurn(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
}

describe('chat survives a forced websocket drop', () => {
  it('re-subscribes and completes the next turn on a fresh socket after the core drops every connection', async () => {
    const page = await browser.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    const observer = rpcObserverFor(page)
    try {
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      await page.getByRole('button', {name: 'Open conciv chat'}).click()
      await expectLocator(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({
        timeout: MOUNT_TIMEOUT_MS,
      })

      await sendTurn(page, FIRST_TEXT)
      await expectLocator(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: MOUNT_TIMEOUT_MS})

      const socketsBefore = observer.socketCount()
      const mark = observer.mark()
      core.dropConnections()

      await sendTurn(page, SECOND_TEXT)

      await observer.completed({path: ['chat', 'stop'], since: mark, timeout: MOUNT_TIMEOUT_MS})
      await observer.completed({path: ['chat', 'send'], since: mark, timeout: MOUNT_TIMEOUT_MS})
      await observer.completed({path: ['chat', 'subscribe'], since: mark, timeout: MOUNT_TIMEOUT_MS})
      expect(observer.socketCount()).toBeGreaterThan(socketsBefore)
      expect(pageErrors).toEqual([])
    } finally {
      observer.dispose()
      await page.close()
    }
  })
})
