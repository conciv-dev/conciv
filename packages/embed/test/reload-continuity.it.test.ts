import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'

const ASSISTANT_TEXT = 'Continuity reply'

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await expect
    .poll(() => page.getByRole('textbox', {name: 'Message the conciv agent'}).isVisible(), {timeout: 15_000})
    .toBe(true)
}

describe('reload continuity through the db-backed navigation row', () => {
  it('restores the open panel route, the transcript, and the draft after a reload', async () => {
    const page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('remember me')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect.poll(() => page.getByText(ASSISTANT_TEXT).first().isVisible(), {timeout: 20_000}).toBe(true)

    await input.fill('an unsent draft survives')
    await input.press('End')
    await expect
      .poll(
        async () => {
          const state = await kit.rpc.navigation.get(undefined)
          const panelEntry = state?.entries.find((entry) => entry.href.startsWith('/panel/'))
          if (!panelEntry) return false
          const sessionId = (panelEntry.href.split('/')[2] ?? '').split('?')[0] ?? ''
          const draft = await kit.rpc.drafts.get({sessionId})
          return draft?.text === 'an unsent draft survives'
        },
        {timeout: 15_000},
      )
      .toBe(true)

    await page.reload({waitUntil: 'domcontentloaded'})

    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 20_000})
      .toBe(true)
    expect(await page.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(0)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect
      .poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 20_000})
      .toBe(true)
    await expect.poll(() => page.getByText(ASSISTANT_TEXT).first().isVisible(), {timeout: 20_000}).toBe(true)
    await expect
      .poll(() => page.getByRole('textbox', {name: 'Message the conciv agent'}).inputValue(), {timeout: 20_000})
      .toBe('an unsent draft survives')
    await page.close()
  })
})
