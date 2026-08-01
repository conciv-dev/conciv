import {afterAll, beforeAll, describe, expect, it} from 'vitest'
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

describe('the live widget mounts site-wide and the root widget param decides the panel', () => {
  it('shows the launcher with the panel closed on a docs page on desktop', async () => {
    const page = await browser.newPage()
    await page.goto(`${ORIGIN}/docs/quick-start`, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 20_000})
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden()

    await page.close()
  }, 60_000)

  it('auto-opens the panel on the home page without a widget param in the URL', async () => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 20_000})
    expect(new URL(page.url()).searchParams.has('widget')).toBe(false)

    await page.close()
  }, 60_000)

  it('keeps the panel closed on the home page when ?widget=false is explicit', async () => {
    const page = await browser.newPage()
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 20_000})
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden()

    await page.close()
  }, 60_000)

  it('opens the panel on a docs page when ?widget=true is explicit', async () => {
    const page = await browser.newPage()
    await page.goto(`${ORIGIN}/docs/quick-start?widget=true`, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 20_000})

    await page.close()
  }, 60_000)
})
