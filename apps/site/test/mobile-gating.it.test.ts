import {afterAll, beforeAll, describe, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, devices, type Browser} from 'playwright'
import {startWranglerDev, type WranglerDev} from './wrangler-dev'

const SITE_PORT = 8788
const INSPECTOR_PORT = 9788
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
let site: WranglerDev
let browser: Browser

beforeAll(async () => {
  site = await startWranglerDev({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await browser?.close()
  await site?.stop()
})

describe('landing gates the dev-only demo behind a non-mobile pointer', () => {
  it('mounts the live widget and shows the install + try-it CTAs on desktop', async () => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.locator('[data-conciv-root]')).toHaveCount(1, {timeout: 20_000})
    await expectLocator(page.getByRole('button', {name: 'Copy install command'})).toBeVisible()
    await expectLocator(page.getByRole('button', {name: /Try it live/i})).toBeVisible()

    await page.close()
  }, 60_000)

  it('does not mount the live widget or the CTAs on a mobile device', async () => {
    const context = await browser.newContext(devices['iPhone 13'])
    const page = await context.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('button', {name: 'Copy install command'})).toHaveCount(0, {timeout: 20_000})
    await expectLocator(page.getByRole('button', {name: /Try it live/i})).toHaveCount(0)
    await expectLocator(page.locator('[data-conciv-root]')).toHaveCount(0)

    await context.close()
  }, 60_000)
})
