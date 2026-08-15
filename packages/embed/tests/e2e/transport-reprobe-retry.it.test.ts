import {expect, test} from '@playwright/test'
import {watchRpcWire} from '@conciv/extension-testkit/rpc-wire'
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
    const wire = watchRpcWire(page)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openChatPanel(page)

    const composer = chatBox(page)
    const blocked = wire.nextChatSend()
    await composer.fill('while upgrades are blocked')
    await page.getByRole('button', {name: 'Send message'}).click()
    expect((await blocked).transport).toBe('fetch')

    const hold = await holdRpcCalls(page)
    hold.hold()

    const retryButton = page.getByRole('button', {name: 'Retry'})
    await expect(retryButton).toBeVisible({timeout: MOUNT_TIMEOUT_MS})

    await retryButton.click()
    suite.core().setUpgradesBlocked(false)
    hold.release()
    await expect(composer).toBeVisible({timeout: MOUNT_TIMEOUT_MS})

    const reprobed = wire.nextChatSend()
    await composer.fill('after the upgrade path opens')
    await page.getByRole('button', {name: 'Send message'}).click()
    expect((await reprobed).transport).toBe('websocket')
  })
})
