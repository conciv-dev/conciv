import {afterAll, beforeAll, describe, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser} from 'playwright'
import {until} from '@conciv/harness-testkit/until'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'
import {openPanel} from './helpers/panel.js'

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

describe('reload continuity through the db-backed navigation row', () => {
  it('restores the open panel route, the transcript, and the draft after a reload', async () => {
    const page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('remember me')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

    await input.fill('an unsent draft survives')
    await input.press('End')
    await until(
      async () => {
        const state = await kit.rpc.navigation.get(undefined)
        const panelEntry = state?.entries.find((entry) => entry.href.startsWith('/panel/'))
        if (!panelEntry) return false
        const sessionId = (panelEntry.href.split('/')[2] ?? '').split('?')[0] ?? ''
        const draft = await kit.rpc.drafts.get({sessionId})
        return draft?.text === 'an unsent draft survives'
      },
      {hangGuardMs: 30_000},
    )

    await page.reload({waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await expectLocator(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveValue(
      'an unsent draft survives',
      {timeout: 30_000},
    )
    await page.close()
  })
})
