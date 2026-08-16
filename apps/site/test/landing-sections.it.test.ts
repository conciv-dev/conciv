import {expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {createSiteTest} from './site-fixture.js'
import {HERO_HEADLINE} from '../src/components/landing/hero.js'

const SITE_PORT = 8795
const INSPECTOR_PORT = 9795
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
const VIEWPORT_WIDTHS = [1440, 1280, 1024, 768, 390]

const test = createSiteTest({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})

test.describe('landing sections', () => {
  test('renders the headline, six capability figures, three steps and the ledger without errors', async ({browser}) => {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('heading', {level: 1})).toHaveText(HERO_HEADLINE, {timeout: 20_000})

    const figures = page.locator('figure')
    await expectLocator(figures).toHaveCount(7)
    for (const figure of await figures.all()) {
      const image = figure.getByRole('img')
      await expectLocator(image).toHaveAttribute('alt', /\S/)
      await expectLocator(image).toHaveAttribute('width', /^\d+$/)
      await expectLocator(image).toHaveAttribute('height', /^\d+$/)
    }

    const steps = page.getByRole('list').filter({hasText: 'Add the integration'})
    await expectLocator(steps.getByRole('listitem')).toHaveCount(3)
    for (const numeral of ['01', '02', '03']) {
      await expectLocator(steps.getByText(numeral, {exact: true})).toBeVisible()
    }

    await expectLocator(page.getByRole('cell', {name: 'stars'})).toBeVisible()
    await expectLocator(page.getByRole('cell', {name: 'MIT'})).toBeVisible()

    expect(errors).toEqual([])
    await page.close()
  }, 60_000)

  test('never overflows the viewport horizontally', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})
    await expectLocator(page.getByRole('heading', {level: 1})).toBeVisible({timeout: 20_000})

    for (const width of VIEWPORT_WIDTHS) {
      await page.setViewportSize({width, height: 900})
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `viewport ${width}`).toBe(0)
    }

    await page.close()
  }, 60_000)
})
