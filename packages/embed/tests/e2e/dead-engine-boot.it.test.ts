import {expect, test} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage, reserveDeadPort} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {proxyTo, type ProxyCore} from '../helpers/proxy.js'

const ASSISTANT_TEXT = 'Recovered from a dead boot'
const MOUNT_TIMEOUT_MS = 30_000

let kit: EmbedKit

test.beforeAll(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
})

test.afterAll(async () => {
  await kit.cleanup()
})

test.describe('the router error screen surfaces a dead engine at boot and Retry recovers it', () => {
  test('FAB click against a connection-refused base shows our error screen, then Retry recovers once the engine is reachable', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const dead = await reserveDeadPort()
    const host = await serveHost(() => hostPage({apiBase: dead.base, widget: '{"quickTerminal":false}'}))
    let proxy: ProxyCore | null = null
    try {
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
      await page.getByRole('button', {name: 'Open conciv chat'}).click()

      const errorScreen = page.getByRole('alert').filter({hasText: /couldn.t reach the engine/})
      await expect(errorScreen).toBeVisible({timeout: MOUNT_TIMEOUT_MS})

      proxy = await proxyTo(kit.base, {port: dead.port})

      await errorScreen.getByRole('button', {name: 'Retry'}).click()

      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await expect(composer).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
      await composer.fill('hi there')
      await page.getByRole('button', {name: 'Send message'}).click()
      await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: MOUNT_TIMEOUT_MS})
    } finally {
      await host.close()
      if (proxy) await proxy.close()
    }
  })
})
