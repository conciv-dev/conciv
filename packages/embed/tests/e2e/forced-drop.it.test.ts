import {expect, test, type Page} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage, serveHost} from '../helpers/host.js'
import {proxyTo, type ProxyCore} from '../helpers/proxy.js'
import {rpcObserverFor} from '@conciv/extension-testkit/rpc-observer'
import {setNavigation} from './helpers/navigation.js'

const ASSISTANT_TEXT = 'Reply across the drop'
const FIRST_TEXT = 'first turn before the drop'
const SECOND_TEXT = 'second turn after the drop'
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

async function sendTurn(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
}

test.describe('chat survives a forced websocket drop', () => {
  test('re-subscribes and completes the next turn on a fresh socket after the core drops every connection', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    const observer = rpcObserverFor(page)
    try {
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      await page.getByRole('button', {name: 'Open conciv chat'}).click()
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({
        timeout: MOUNT_TIMEOUT_MS,
      })

      await sendTurn(page, FIRST_TEXT)
      await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: MOUNT_TIMEOUT_MS})

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
    }
  })
})
