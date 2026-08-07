import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'
import {openPanel} from './helpers/panel.js'

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit()
  host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

describe('draft persistence carries the caret offsets', () => {
  it('persists the draft text with the caret position after the debounce', async () => {
    const page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.click()
    await input.pressSequentially('hello!')
    for (let step = 0; step < 6; step += 1) await input.press('ArrowLeft')
    const persisted = page.waitForResponse(
      (response) =>
        response.url().includes('/rpc/drafts/set') && (response.request().postData() ?? '').includes('say hello!'),
      {timeout: 30_000},
    )
    await input.pressSequentially('say ')
    await persisted

    const state = await kit.rpc.navigation.get(undefined)
    const panelEntry = state?.entries.find((entry) => entry.href.startsWith('/panel/'))
    const sessionId = (panelEntry?.href.split('/')[2] ?? '').split('?')[0] ?? ''
    expect(await kit.rpc.drafts.get({sessionId})).toMatchObject({
      text: 'say hello!',
      selectionStart: 4,
      selectionEnd: 4,
    })
    await page.close()
  })
})
