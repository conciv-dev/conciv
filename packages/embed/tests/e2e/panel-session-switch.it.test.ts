import {expect, test} from '@playwright/test'
import {until} from '@conciv/harness-testkit/until'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'
import {panelSessionId} from './helpers/navigation.js'
import {panelDraft} from './helpers/drafts.js'

const RECENT_ID = '43548fd1-0000-4220-acf0-014b10b5815f'
const OLDER_ID = '43548fd1-0000-4220-acf0-014b10b5815e'
const RECENT_TITLE = 'the session opened at boot'
const OLDER_TITLE = 'the session switched to'
const FIRST_DRAFT = 'draft of the session opened first'
const SECOND_DRAFT = 'draft of the session switched to'

const suite = setupWidgetSuite({
  history: [
    {id: RECENT_ID, derivedTitle: RECENT_TITLE, updatedAt: Date.now(), messageCount: 3},
    {id: OLDER_ID, derivedTitle: OLDER_TITLE, updatedAt: Date.now() - 60_000, messageCount: 2},
  ],
})

test.describe('the panel session the test helpers read after a session switch', () => {
  test('is the session the panel is on now, not the one it visited first', async ({page}) => {
    test.setTimeout(180_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.click()
    await input.pressSequentially(FIRST_DRAFT)
    const firstSessionId = await panelSessionId(suite.kit())
    await until(async () => (await suite.kit().rpc.drafts.get({sessionId: firstSessionId}))?.text === FIRST_DRAFT, {
      hangGuardMs: 30_000,
      intervalMs: 100,
    })

    await page.getByRole('button', {name: /^Session: /}).click()
    await page.getByRole('option', {name: new RegExp(OLDER_TITLE)}).click()
    await expect(page.getByRole('button', {name: `Session: ${OLDER_TITLE}`})).toBeVisible({timeout: 30_000})

    const switched = await suite.kit().rpc.sessions.resolve({id: OLDER_ID})
    expect(firstSessionId).not.toBe(switched.sessionId)
    await input.click()
    await input.pressSequentially(SECOND_DRAFT)
    await until(
      async () => (await suite.kit().rpc.drafts.get({sessionId: switched.sessionId}))?.text === SECOND_DRAFT,
      {
        hangGuardMs: 30_000,
        intervalMs: 100,
      },
    )

    expect(await panelSessionId(suite.kit())).toBe(switched.sessionId)
    expect(await panelDraft(suite.kit())).toMatchObject({text: SECOND_DRAFT})
  })
})
