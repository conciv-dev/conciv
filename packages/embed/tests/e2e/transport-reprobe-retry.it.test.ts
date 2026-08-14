import {expect, test} from '@playwright/test'
import {observeRpc} from '@conciv/extension-testkit/rpc-observer'
import {holdRpcCalls} from '@conciv/extension-testkit/rpc-fault'
import {chatBox, openChatPanel} from './helpers/chat.js'
import {setupProxiedEmbedSuite} from './helpers/proxied-suite.js'

const ASSISTANT_TEXT = 'Reprobed reply'
const MOUNT_TIMEOUT_MS = 30_000

const suite = setupProxiedEmbedSuite({text: ASSISTANT_TEXT, proxy: {blockUpgrades: true}})

test.describe('a manual Retry after upgrades unblock re-probes the transport from scratch', () => {
  test('rides the websocket on the next completed call once Retry re-probes past the sticky fetch transport', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const observer = observeRpc(page)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openChatPanel(page)

    const composer = chatBox(page)
    await composer.fill('while upgrades are blocked')
    await page.getByRole('button', {name: 'Send message'}).click()
    const blocked = await observer.completed({path: ['chat', 'send'], timeout: MOUNT_TIMEOUT_MS})
    expect(blocked.transport).toBe('fetch')

    const hold = await holdRpcCalls(page)
    hold.hold()

    const retryButton = page.getByRole('button', {name: 'Retry'})
    await expect(retryButton).toBeVisible({timeout: MOUNT_TIMEOUT_MS})

    const mark = observer.mark()
    await retryButton.click()
    suite.core().setUpgradesBlocked(false)
    hold.release()
    await expect(composer).toBeVisible({timeout: MOUNT_TIMEOUT_MS})

    await composer.fill('after the upgrade path opens')
    await page.getByRole('button', {name: 'Send message'}).click()
    const reprobed = await observer.completed({path: ['chat', 'send'], since: mark, timeout: MOUNT_TIMEOUT_MS})
    expect(reprobed.transport).toBe('websocket')
  })
})
