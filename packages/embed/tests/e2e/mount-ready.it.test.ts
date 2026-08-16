import {expect, test, type Page} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {handleHostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {chatBox} from './helpers/chat.js'

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  kit = await bootEmbedKit({text: 'ready contract'})
  host = await serveHost(() => handleHostPage())
})

test.afterAll(async () => {
  await host.close()
  await kit.cleanup()
})

async function openPage(page: Page): Promise<Page> {
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  return page
}

test.describe('mount() readiness contract', () => {
  test('an open dispatched right after mount() resolves opens the panel, never dropped', async ({page}) => {
    await openPage(page)
    await page.evaluate(async (base) => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      const handle = window.ConcivHandle.makeHandle(base)
      await handle.mount(el)
      window.dispatchEvent(
        new CustomEvent('conciv-dispatch-event', {
          detail: {type: 'panel:open', payload: undefined, pluginId: 'panel'},
        }),
      )
    }, kit.base)
    await expect(chatBox(page)).toBeVisible({timeout: 10_000})
  })
})
