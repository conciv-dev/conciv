import {expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {createSiteTest} from './site-fixture.js'
import {heroCanvas, waitForLandingHydration} from './landing-page.js'
import {HERO_HEADLINE} from '../src/components/landing/hero.js'
import {findScreenshot} from '../src/lib/screenshots.js'

const SITE_PORT = 8795
const INSPECTOR_PORT = 9795
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
const LANDING = `${ORIGIN}/?widget=false`
const VIEWPORT_WIDTHS = [320, 375, 414, 768, 1024, 1280, 1440]
const DESKTOP = {width: 1440, height: 900}
const POSTER = `img[alt="${findScreenshot('hero-demo.webp').alt}"]`

const test = createSiteTest({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})

test.describe('landing sections', () => {
  test('renders the headline, six capability figures, three steps and the ledger without errors', async ({browser}) => {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    await expectLocator(page.getByRole('heading', {level: 1})).toHaveText(HERO_HEADLINE, {timeout: 20_000})

    const figures = page.locator('figure')
    await expectLocator(figures).toHaveCount(7)
    for (const figure of await figures.all()) {
      const image = figure.getByRole('img')
      await expectLocator(image).toHaveAttribute('alt', /\S/)
      await expectLocator(image).toHaveAttribute('width', /^\d+$/)
      await expectLocator(image).toHaveAttribute('height', /^\d+$/)
      await expectLocator(figure.getByRole('button', {name: /^View .+ at full size$/})).toHaveCount(1)
    }

    const steps = page.getByRole('list').filter({hasText: 'Add the integration'})
    await expectLocator(steps.getByRole('listitem')).toHaveCount(3)
    for (const numeral of ['01', '02', '03']) {
      await expectLocator(steps.getByText(numeral, {exact: true})).toBeVisible()
    }

    const principles = page.getByRole('list').filter({hasText: 'One integration'}).first()
    await expectLocator(principles.getByRole('listitem')).toHaveCount(3)

    const footerLinks = page.getByRole('navigation', {name: 'Footer'}).getByRole('listitem')
    await expectLocator(footerLinks).toHaveCount(7)

    await expectLocator(page.getByRole('cell', {name: 'stars'})).toBeVisible()
    await expectLocator(page.getByRole('cell', {name: 'MIT'})).toBeVisible()

    expect(errors).toEqual([])
    await page.close()
  }, 60_000)

  test('never overflows the viewport horizontally from 320 to 1440', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    const root = page.locator('html')
    const headline = page.getByRole('heading', {level: 1})
    await expectLocator(headline).toBeVisible({timeout: 20_000})

    for (const width of VIEWPORT_WIDTHS) {
      await page.setViewportSize({width, height: 900})
      await expectLocator(headline).toBeVisible()
      for (const heading of await page.getByRole('heading', {level: 2}).all()) {
        await expectLocator(heading).toBeVisible()
      }
      const clientWidth = await root.evaluate((element) => element.clientWidth)
      await expectLocator(root).toHaveJSProperty('scrollWidth', clientWidth)
    }

    await page.close()
  }, 90_000)
})

test.describe('hero shader motion', () => {
  test('draws the hero backdrop once and never animates it under reduced motion', async ({browser}) => {
    const page = await browser.newPage({viewport: DESKTOP, reducedMotion: 'reduce'})
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    const canvas = heroCanvas(page)
    await expectLocator(canvas).toHaveAttribute('data-ready', '', {timeout: 20_000})
    await expectLocator(canvas).toHaveAttribute('data-frames', '0')

    await expectLocator(page.getByRole('heading', {level: 1})).toHaveText(HERO_HEADLINE)
    await expectLocator(page.getByRole('heading', {name: 'What it does on the page.'})).toBeVisible()

    await expectLocator(canvas).toHaveAttribute('data-frames', '0')

    await page.close()
  }, 60_000)

  test('animates the hero backdrop when motion is allowed', async ({browser}) => {
    const page = await browser.newPage({viewport: DESKTOP})
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    const canvas = heroCanvas(page)
    await expectLocator(canvas).toHaveAttribute('data-ready', '', {timeout: 20_000})
    await expectLocator(canvas).toHaveAttribute('data-frames', /^[1-9]\d*$/)

    await page.close()
  }, 60_000)
})

test.describe('demo poster', () => {
  test('keeps the poster in place and hides it from assistive tech only once the demo is ready', async ({browser}) => {
    const page = await browser.newPage({viewport: DESKTOP})
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    const poster = page.locator(POSTER)
    await expectLocator(poster).toBeVisible({timeout: 20_000})

    await expectLocator(page.getByRole('combobox', {name: 'Pick the local model'})).toBeVisible({timeout: 60_000})
    await expectLocator(poster).toHaveAttribute('aria-hidden', 'true')
    await expectLocator(poster).toBeVisible()

    await page.close()
  }, 120_000)

  test('follows the same poster handover under reduced motion', async ({browser}) => {
    const page = await browser.newPage({viewport: DESKTOP, reducedMotion: 'reduce'})
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    const poster = page.locator(POSTER)
    await expectLocator(poster).toBeVisible({timeout: 20_000})

    await expectLocator(page.getByRole('combobox', {name: 'Pick the local model'})).toBeVisible({timeout: 60_000})
    await expectLocator(poster).toHaveAttribute('aria-hidden', 'true')
    await expectLocator(poster).toBeVisible()

    await page.close()
  }, 120_000)
})

test.describe('capability lightbox', () => {
  test('opens with the keyboard, shows the full-size image and returns focus on Escape', async ({browser}) => {
    const page = await browser.newPage({viewport: DESKTOP})
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    await waitForLandingHydration(page)

    const grab = findScreenshot('grab-element.webp')
    const trigger = page.getByRole('button', {name: 'View Grab any element at full size'})
    await expectLocator(trigger).toBeVisible()

    await trigger.focus()
    await expectLocator(trigger).toBeFocused()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', {name: 'Grab any element'})
    await expectLocator(dialog).toBeVisible()
    await expectLocator(dialog.getByRole('img', {name: grab.alt})).toBeVisible()

    await page.keyboard.press('Escape')
    await expectLocator(dialog).toBeHidden()
    await expectLocator(trigger).toBeFocused()

    await page.close()
  }, 60_000)

  test('opens on click and closes with the close button', async ({browser}) => {
    const page = await browser.newPage({viewport: DESKTOP})
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    await waitForLandingHydration(page)

    const trigger = page.getByRole('button', {name: 'View Grab any element at full size'})
    await trigger.click()

    const dialog = page.getByRole('dialog', {name: 'Grab any element'})
    await expectLocator(dialog).toBeVisible()

    await dialog.getByRole('button', {name: 'Close'}).click()
    await expectLocator(dialog).toBeHidden()
    await expectLocator(trigger).toBeFocused()

    await page.close()
  }, 60_000)
})
