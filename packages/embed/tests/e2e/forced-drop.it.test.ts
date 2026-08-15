import {expect, test, type Page} from '@playwright/test'
import {rpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import {watchRpcWire} from '@conciv/extension-testkit/rpc-wire'
import {setNavigation} from './helpers/navigation.js'
import {setupProxiedEmbedSuite} from './helpers/proxied-suite.js'

const ASSISTANT_TEXT = 'Reply across the drop'
const FIRST_TEXT = 'first turn before the drop'
const SECOND_TEXT = 'second turn after the drop'
const MOUNT_TIMEOUT_MS = 20_000

const suite = setupProxiedEmbedSuite({text: ASSISTANT_TEXT})

test.beforeEach(async () => {
  expect(await setNavigation(suite.kit(), [{href: '/'}])).toBe(true)
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
    const wire = watchRpcWire(page)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({
      timeout: MOUNT_TIMEOUT_MS,
    })

    await sendTurn(page, FIRST_TEXT)
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: MOUNT_TIMEOUT_MS})

    const reconnected = rpcCallCursor(page)
    const frames = wire.chatReconnect()
    suite.core().dropConnections()

    await sendTurn(page, SECOND_TEXT)

    expect(await frames).toEqual({stop: 'websocket', send: 'websocket', subscribe: 'websocket'})
    expect(reconnected.socketsSince()).toBeGreaterThan(0)
    expect(pageErrors).toEqual([])
  })
})
