import {expect, test} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanelOnNewSession} from './helpers/panel.js'
import {untilPanelDraft} from './helpers/drafts.js'

const ASSISTANT_TEXT = 'Continuity reply'

const suite = setupWidgetSuite({text: ASSISTANT_TEXT})

test.describe('reload continuity through the db-backed navigation row', () => {
  test('restores the open panel route, the transcript, and the draft after a reload', async ({page}) => {
    test.setTimeout(240_000)
    const sessionId = await openPanelOnNewSession(page, suite)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('remember me')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

    await input.fill('an unsent draft survives')
    await input.press('End')
    await untilPanelDraft(suite.kit(), sessionId, (draft) => draft.text === 'an unsent draft survives')

    expect(await suite.kit().rpc.drafts.get({sessionId})).toMatchObject({text: 'an unsent draft survives'})

    await page.reload({waitUntil: 'domcontentloaded'})

    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText('an unsent draft survives', {
      timeout: 30_000,
    })
  })
})
