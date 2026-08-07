import {describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const ASSISTANT_TEXT = 'Continuity reply'

const suite = setupWidgetSuite({text: ASSISTANT_TEXT})

describe('reload continuity through the db-backed navigation row', () => {
  it('restores the open panel route, the transcript, and the draft after a reload', async () => {
    const page = await suite.browser().newPage()
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('remember me')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

    await input.fill('an unsent draft survives')
    await input.press('End')
    await page.waitForResponse(
      (response) =>
        response.url().includes('/rpc/drafts/set') &&
        (response.request().postData() ?? '').includes('an unsent draft survives'),
      {timeout: 30_000},
    )
    const state = await suite.kit().rpc.navigation.get(undefined)
    const panelEntry = state?.entries.find((entry) => entry.href.startsWith('/panel/'))
    const sessionId = (panelEntry?.href.split('/')[2] ?? '').split('?')[0] ?? ''
    expect(await suite.kit().rpc.drafts.get({sessionId})).toMatchObject({text: 'an unsent draft survives'})

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
