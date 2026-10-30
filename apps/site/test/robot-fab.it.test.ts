import {expect as expectLocator, type Locator, type Page} from 'playwright/test'
import {expect} from 'vitest'
import {createSiteTest} from './site-fixture.js'

const SITE_PORT = 8794
const INSPECTOR_PORT = 9794
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
const LANDING = `${ORIGIN}/?widget=false`

const PRERENDERED_ROOT_TAG = /<span[^>]*data-part="root"[^>]*>/

const test = createSiteTest({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})

const restingFab = (page: Page): Locator => page.getByRole('button', {name: 'Make the robot think'})

const workingFab = (page: Page): Locator => page.getByRole('button', {name: 'Stop the robot thinking'})

const mascotOf = (fab: Locator): Locator => fab.locator('[data-scope="mascot"][data-part="root"]')

const emitterOf = (fab: Locator): Locator => fab.locator('[data-scope="mascot"][data-part="effect"] > span')

test.describe('the landing robot fab rides the mascot compound api', () => {
  test('ships the sized mascot stage in the prerendered html, before any hydration', async ({browser}) => {
    const page = await browser.newPage()
    const response = await page.request.get(LANDING)

    expect(response.ok()).toBe(true)
    const rootTag = PRERENDERED_ROOT_TAG.exec(await response.text())?.[0] ?? ''
    expect(rootTag).toContain('class="size-11"')

    await page.close()
  }, 60_000)

  test('leaves no mascot or emitter behind when the landing page unmounts', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    const fab = restingFab(page)
    await expectLocator(fab).toBeVisible({timeout: 20_000})
    await fab.click()
    await expectLocator(emitterOf(workingFab(page))).toHaveCount(1)

    await page.getByRole('navigation').getByRole('link', {name: 'Docs', exact: true}).click()
    await expectLocator(page).toHaveURL(/\/docs(\?|$)/)
    await expectLocator(workingFab(page)).toHaveCount(0)
    await expectLocator(page.locator('[data-scope="mascot"][data-part="effect"] > span')).toHaveCount(0)

    await page.getByRole('link', {name: 'conciv', exact: true}).first().click()
    await expectLocator(page).toHaveURL(new RegExp(`${SITE_PORT}/(\\?|$)`))
    const remounted = restingFab(page)
    await expectLocator(mascotOf(remounted)).toHaveCount(1)
    await expectLocator(emitterOf(remounted)).toHaveCount(0)

    await page.close()
  }, 60_000)
})
