import {expect, test} from '@playwright/test'
import {currentHref} from '@conciv/extension-testkit/navigation-state'
import {until} from '@conciv/harness-testkit/until'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const RAW_HARNESS_ID = '43548fd1-0000-4220-acf0-014b10b5815f'
const EXTERNAL_TITLE = 'a session started outside conciv'

const suite = setupWidgetSuite({
  history: [{id: RAW_HARNESS_ID, derivedTitle: EXTERNAL_TITLE, updatedAt: Date.now(), messageCount: 3}],
})

test.describe('switching to a harness session conciv has never adopted', () => {
  test('lands the panel on the canonical conciv session route, not the raw harness id', async ({page}) => {
    test.setTimeout(180_000)
    const listed = await suite.kit().rpc.sessions.list()
    expect(listed.map((meta) => meta.id)).toContain(RAW_HARNESS_ID)

    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    await page.getByRole('button', {name: /^Session: /}).click()
    await page.getByRole('option', {name: new RegExp(EXTERNAL_TITLE)}).click()

    await expect(page.getByRole('button', {name: `Session: ${EXTERNAL_TITLE}`})).toBeVisible({timeout: 30_000})
    await until(async () => (await currentHref(suite.kit())).startsWith('/panel/conciv_'), {
      hangGuardMs: 30_000,
      intervalMs: 100,
    })

    const adopted = await suite.kit().rpc.sessions.resolve({id: RAW_HARNESS_ID})
    const href = await currentHref(suite.kit())
    expect(href).toContain(adopted.sessionId)
    expect(href).not.toContain(RAW_HARNESS_ID)
  })
})
