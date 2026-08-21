import {expect, test} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'
import {untilPanelDraft} from './helpers/drafts.js'

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

test.describe('composer drafts after a session switch', () => {
  test('persists each draft against the session the panel is on when it is typed', async ({page}) => {
    test.setTimeout(180_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const opened = await suite.kit().rpc.sessions.resolve({id: RECENT_ID})
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.click()
    await input.pressSequentially(FIRST_DRAFT)
    await untilPanelDraft(suite.kit(), opened.sessionId, (draft) => draft.text === FIRST_DRAFT)

    const sessionOptions = page.getByRole('button', {name: 'Session options'})
    await sessionOptions.click()
    await page.getByRole('button', {name: /^Session: /}).click()
    await page.getByRole('option', {name: new RegExp(OLDER_TITLE)}).click()
    const pill = page.getByRole('button', {name: `Session: ${OLDER_TITLE}`})
    if (!(await pill.isVisible())) await sessionOptions.click()
    await expect(pill).toBeVisible({timeout: 30_000})
    await page.keyboard.press('Escape')
    await expect(pill).toBeHidden({timeout: 30_000})

    const switched = await suite.kit().rpc.sessions.resolve({id: OLDER_ID})
    expect(switched.sessionId).not.toBe(opened.sessionId)

    await input.click()
    await input.pressSequentially(SECOND_DRAFT)
    await untilPanelDraft(suite.kit(), switched.sessionId, (draft) => draft.text === SECOND_DRAFT)

    expect(await suite.kit().rpc.drafts.get({sessionId: opened.sessionId})).toMatchObject({text: FIRST_DRAFT})
    expect(await suite.kit().rpc.drafts.get({sessionId: switched.sessionId})).toMatchObject({text: SECOND_DRAFT})
  })
})
