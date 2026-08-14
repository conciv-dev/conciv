import {expect, test} from '@playwright/test'
import {holdRpcCalls} from '@conciv/extension-testkit/rpc-fault'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage, serveHost} from '../helpers/host.js'
import {chatBox, openChatPanel} from './helpers/chat.js'

const ASSISTANT_TEXT = 'Recovered mid-session'
const MOUNT_TIMEOUT_MS = 30_000

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
})

test.afterAll(async () => {
  await host.close()
  await kit.cleanup()
})

test.describe('a mid-session outage raises the standing notice and disables sending, release auto-clears both', () => {
  test('holding all rpc traffic surfaces the notice and a disabled send control, releasing it clears both', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const hold = await holdRpcCalls(page)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openChatPanel(page)

    const composer = chatBox(page)
    await composer.fill('a message queued during the outage')

    hold.hold()

    const notice = page.getByText('conciv lost connection to the engine.')
    await expect(notice).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
    const disabledSend = page.getByRole('button', {name: 'conciv lost connection to the engine'})
    await expect(disabledSend).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
    await expect(disabledSend).toBeDisabled()

    hold.release()

    await expect(notice).not.toBeVisible({timeout: MOUNT_TIMEOUT_MS})
    await expect(page.getByRole('button', {name: 'Send message'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
  })
})
