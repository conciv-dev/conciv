import {expect, test} from '@playwright/test'
import {currentHref} from '@conciv/extension-testkit/navigation-state'
import {until} from '@conciv/harness-testkit/until'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const RAW_HARNESS_ID = HarnessSessionId.parse('43548fd1-0000-4220-acf0-014b10b5815f')
const EXTERNAL_TITLE = 'a session started outside conciv'
const NEWER_HARNESS_ID = HarnessSessionId.parse('9f2c77aa-1111-4a10-b3d1-77c0a2e9b004')
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

    const metas = await suite.kit().rpc.sessions.list()
    expect(metas.map((meta) => String(meta.id)).filter((id) => !id.startsWith('conciv_'))).toEqual([])
    const external = metas.find((meta) => meta.title === EXTERNAL_TITLE)
    if (!external) throw new Error('the harness-native session was not listed under its derived title')
    const newer = metas.find((meta) => meta.title === NEWER_TITLE)
    if (!newer) throw new Error('the newest harness-native session was not listed under its derived title')

    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const sessionOptions = page.getByRole('button', {name: 'Session options'})
    await sessionOptions.click()
    await page.getByRole('button', {name: /^Session: /}).click()
    const search = page.getByPlaceholder('Search sessions…')
    await expect(search).toBeVisible({timeout: 30_000})

    await search.fill(String(RAW_HARNESS_ID))
    await expect(page.getByText('No sessions match')).toBeVisible({timeout: 30_000})
    await expect(page.getByRole('option', {name: new RegExp(EXTERNAL_TITLE)})).toHaveCount(0)

    await search.fill(String(external.id))
    const canonicalOption = page.getByRole('option', {name: new RegExp(EXTERNAL_TITLE)})
    await expect(canonicalOption).toBeVisible({timeout: 30_000})

    await canonicalOption.click()
    const pill = page.getByRole('button', {name: `Session: ${EXTERNAL_TITLE}`})
    if (!(await pill.isVisible())) await sessionOptions.click()
    await expect(pill).toBeVisible({timeout: 30_000})

    await until(async () => (await currentHref(suite.kit())).includes(String(external.id)), {
      hangGuardMs: 30_000,
      intervalMs: 100,
    })
    const href = await currentHref(suite.kit())
    expect(href).not.toContain(RAW_HARNESS_ID)
    expect(href).not.toContain(newer.id)

    const adopted = await suite.kit().rpc.sessions.resolve({id: RAW_HARNESS_ID})
    expect(adopted.sessionId).toBe(external.id)
  })
})
