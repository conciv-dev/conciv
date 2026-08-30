import {expect, test} from '@playwright/test'
import {holdRpcCalls} from '@conciv/extension-testkit/rpc-fault'
import {rpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import {openChatPanel} from './helpers/chat.js'
import {setupProxiedEmbedSuite} from './helpers/proxied-suite.js'

const ASSISTANT_TEXT = 'Idle heartbeat reply'
const SETTLE_MS = 3_000
const UNREACHABLE_TIMEOUT_MS = 45_000
const RECOVERY_TIMEOUT_MS = 20_000
const HEARTBEAT_WINDOW_MS = 32_000

const suite = setupProxiedEmbedSuite({text: ASSISTANT_TEXT})

test.describe('an idle widget notices the engine going unreachable through the rpc heartbeat', () => {
  test('the open panel heartbeat surfaces the unreachable notice with no user interaction, and clears it on recovery', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openChatPanel(page)
    await page.waitForTimeout(SETTLE_MS)

    const hold = await holdRpcCalls(page)
    hold.hold()
    const cursor = rpcCallCursor(page)

    const notice = page.getByText('conciv lost connection to the engine.')
    await expect(notice).toBeVisible({timeout: UNREACHABLE_TIMEOUT_MS})
    expect(cursor.startedSince(['meta', 'engine'])).toBeGreaterThanOrEqual(1)

    hold.release()

    await expect(notice).not.toBeVisible({timeout: RECOVERY_TIMEOUT_MS})
  })

  test('closing the panel stops the heartbeat from polling the engine', async ({page}) => {
    test.setTimeout(60_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openChatPanel(page)
    await page.waitForTimeout(SETTLE_MS)
    await page.getByRole('button', {name: 'Close chat'}).click()

    const cursor = rpcCallCursor(page)
    await page.waitForTimeout(HEARTBEAT_WINDOW_MS)

    expect(cursor.startedSince(['meta', 'engine'])).toBe(0)
  })
})
