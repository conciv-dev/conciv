import {expect, test} from '@playwright/test'
import {until} from '@conciv/harness-testkit/until'
import {setupWidgetSuite, type WidgetSuite} from './helpers/suite.js'
import {openPanelOnNewSession} from './helpers/panel.js'

const ASSISTANT_TEXT = 'Reply to the message sent before the reload'
const USER_TEXT = 'a message sent right before the reload'
const PENDING_DRAFT_WRITE_MS = 350
const RESURRECTION_WINDOW_MS = 2_000

const suite = setupWidgetSuite({text: ASSISTANT_TEXT})

function sentTextReappearsAsDraft(widget: WidgetSuite, sessionId: string): Promise<boolean> {
  return until(async () => (await widget.kit().rpc.drafts.get({sessionId}))?.text === USER_TEXT, {
    hangGuardMs: RESURRECTION_WINDOW_MS,
    intervalMs: 25,
  }).then(
    () => true,
    () => false,
  )
}

test.describe('a sent message never comes back as a draft', () => {
  test('leaves the composer empty when the panel reloads right after the send', async ({page}) => {
    test.setTimeout(240_000)
    const sessionId = await openPanelOnNewSession(page, suite)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill(USER_TEXT)
    await page.waitForTimeout(PENDING_DRAFT_WRITE_MS)

    await page.getByRole('button', {name: 'Send message'}).click()
    const reappeared = await sentTextReappearsAsDraft(suite, sessionId)
    await page.reload({waitUntil: 'domcontentloaded'})

    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText('', {timeout: 30_000})
    await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    expect(reappeared).toBe(false)
  })
})
