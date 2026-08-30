import {expect, test, type Page} from '@playwright/test'
import {watchChatWire} from '@conciv/extension-testkit/chat-wire'
import {setupProxiedEmbedSuite} from './helpers/proxied-suite.js'

const ASSISTANT_TEXT = 'Reply across the drop'
const FIRST_TEXT = 'first turn before the drop'
const SECOND_TEXT = 'second turn after the drop'
const MOUNT_TIMEOUT_MS = 20_000

const suite = setupProxiedEmbedSuite({text: ASSISTANT_TEXT})

async function sendTurn(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
}

test.describe('chat survives a forced websocket drop', () => {
  test('reopens the chat socket and completes the next turn after the core drops every connection', async ({page}) => {
    test.setTimeout(120_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    const wire = watchChatWire(page)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({
      timeout: MOUNT_TIMEOUT_MS,
    })

    const first = wire.nextTurn()
    await sendTurn(page, FIRST_TEXT)
    expect((await first).transport).toBe('websocket')
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: MOUNT_TIMEOUT_MS})

    const mark = wire.socketMark()
    const second = wire.nextTurn()
    suite.core().dropConnections()

    await sendTurn(page, SECOND_TEXT)
    expect((await second).transport).toBe('websocket')
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: MOUNT_TIMEOUT_MS})

    expect(wire.socketsOpenedSince(mark)).toBeGreaterThan(0)
    expect(pageErrors).toEqual([])
  })
})
