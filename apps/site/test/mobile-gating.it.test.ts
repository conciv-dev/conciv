import {expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {devices} from 'playwright'
import {createSiteTest} from './site-fixture.js'

const SITE_PORT = 8788
const INSPECTOR_PORT = 9788
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`

const test = createSiteTest({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})

test.describe('landing gates the dev-only demo behind a non-mobile pointer', () => {
  test('mounts the live widget and shows the install + try-it CTAs on desktop', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.locator('[data-conciv-root]')).toHaveCount(1, {timeout: 20_000})
    await expectLocator(page.getByRole('button', {name: 'Copy install command'})).toBeVisible()
    await expectLocator(page.getByRole('button', {name: /Try it live/i})).toBeVisible()

    await page.close()
  }, 60_000)

  test('does not mount the live widget or the CTAs on a mobile device', async ({browser}) => {
    const context = await browser.newContext(devices['iPhone 13'])
    const page = await context.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('button', {name: 'Copy install command'})).toHaveCount(0, {timeout: 20_000})
    await expectLocator(page.getByRole('button', {name: /Try it live/i})).toHaveCount(0)
    await expectLocator(page.locator('[data-conciv-root]')).toHaveCount(0)

    await context.close()
  }, 60_000)
})

test.describe('the live widget mounts site-wide and the root widget param decides the panel', () => {
  test('shows the launcher with the panel closed on a docs page on desktop', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(`${ORIGIN}/docs/quick-start`, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 20_000})
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden()

    await page.close()
  }, 60_000)

  test('auto-opens the panel on the home page without a widget param in the URL', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 20_000})
    expect(new URL(page.url()).searchParams.has('widget')).toBe(false)

    await page.close()
  }, 60_000)

  test('keeps the panel closed on the home page when ?widget=false is explicit', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 20_000})
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden()

    await page.close()
  }, 60_000)

  test('keeps the open panel mounted while navigating from the landing page to the docs', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expectLocator(panel).toBeVisible({timeout: 20_000})

    await page.getByRole('navigation').getByRole('link', {name: 'Docs', exact: true}).click()

    await expectLocator(page).toHaveURL(/\/docs\/?$/)
    await expectLocator(panel).toBeVisible()

    await page.close()
  }, 60_000)

  test('keeps a closed panel closed across navigation to the docs and back to the landing page', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expectLocator(panel).toBeVisible({timeout: 20_000})

    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expectLocator(panel).toBeHidden()

    await page.getByRole('navigation').getByRole('link', {name: 'Docs', exact: true}).click()
    await expectLocator(page).toHaveURL(/\/docs\/?$/)
    await expectLocator(panel).toBeHidden()

    await page.getByRole('link', {name: 'conciv', exact: true}).first().click()
    await expectLocator(page).toHaveURL(`${ORIGIN}/`)
    await expectLocator(panel).toBeHidden()

    await page.close()
  }, 60_000)

  test('opens the panel on a docs page when ?widget=true is explicit', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(`${ORIGIN}/docs/quick-start?widget=true`, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 20_000})

    await page.close()
  }, 60_000)
})
