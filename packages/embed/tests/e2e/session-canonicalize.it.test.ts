import {expect, test} from '@playwright/test'
import {currentHref} from '@conciv/extension-testkit/navigation-state'
import {until} from '@conciv/harness-testkit/until'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const RAW_HARNESS_ID = '43548fd1-0000-4220-acf0-014b10b5815f'
const EXTERNAL_TITLE = 'a session started outside conciv'
const NEWER_HARNESS_ID = '9f2c77aa-1111-4a10-b3d1-77c0a2e9b004'
const NEWER_TITLE = 'the newest session outside conciv'

const suite = setupWidgetSuite({
  history: [
    {id: NEWER_HARNESS_ID, derivedTitle: NEWER_TITLE, updatedAt: Date.now(), messageCount: 1},
    {id: RAW_HARNESS_ID, derivedTitle: EXTERNAL_TITLE, updatedAt: Date.now() - 60_000, messageCount: 3},
  ],
})

test.describe('switching to a harness session conciv has never adopted', () => {
  test('lands the panel on the canonical conciv session route, not the raw harness id', async ({page}) => {
    test.setTimeout(180_000)
    const adoptedExternalId = async (): Promise<string | undefined> => {
      const metas = await suite.kit().rpc.sessions.list()
      return metas.find((meta) => meta.title === EXTERNAL_TITLE && meta.id.startsWith('conciv_'))?.id
    }

    const listed = (await suite.kit().rpc.sessions.list()).map((meta) => meta.id)
    expect(listed).toContain(NEWER_HARNESS_ID)
    expect(listed).toContain(RAW_HARNESS_ID)

    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    await until(
      async () => {
        const ids = (await suite.kit().rpc.sessions.list()).map((meta) => meta.id)
        return !ids.includes(NEWER_HARNESS_ID) && ids.includes(RAW_HARNESS_ID)
      },
      {hangGuardMs: 30_000, intervalMs: 100},
    )
    const afterWarmResolve = (await suite.kit().rpc.sessions.list()).map((meta) => meta.id)
    expect(afterWarmResolve).not.toContain(NEWER_HARNESS_ID)
    expect(afterWarmResolve).toContain(RAW_HARNESS_ID)

    await page.getByRole('button', {name: /^Session: /}).click()
    const option = page.getByRole('option', {name: new RegExp(EXTERNAL_TITLE)})
    await expect(option).toBeVisible({timeout: 30_000})
    await option.click()

    await expect(page.getByRole('button', {name: `Session: ${EXTERNAL_TITLE}`})).toBeVisible({timeout: 30_000})
    await until(
      async () => {
        const canonicalId = await adoptedExternalId()
        if (!canonicalId) return false
        return (await currentHref(suite.kit())).includes(canonicalId)
      },
      {hangGuardMs: 30_000, intervalMs: 100},
    )

    const adopted = await suite.kit().rpc.sessions.resolve({id: RAW_HARNESS_ID})
    const href = await currentHref(suite.kit())
    expect(href).toContain(adopted.sessionId)
    expect(href).not.toContain(RAW_HARNESS_ID)
  })
})
