import {expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {createSiteTest} from './site-fixture.js'
import {heroCanvas, waitForLandingHydration} from './landing-page.js'
import {HERO_HEADLINE} from '../src/components/landing/hero.js'
import {findScreenshot} from '../src/lib/screenshots.js'
import {formatStarCount, starsResponseSchema} from '../src/lib/star-count.js'

const SITE_PORT = 8795
const INSPECTOR_PORT = 9795
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
const LANDING = `${ORIGIN}/?widget=false`
const VIEWPORT_WIDTHS = [320, 360, 375, 390, 414, 768, 834, 1024, 1280, 1366, 1440, 1512, 1920]
const FRAMEWORK_TABS_MIN_WIDTH = 1024
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

    await expectLocator(page.getByRole('cell', {name: 'MIT'})).toBeVisible()

    expect(errors).toEqual([])
    await page.close()
  }, 60_000)

  test('never overflows the viewport or renders a scrollbar in a tab strip, 320 to 1920, both themes', async ({
    browser,
  }) => {
    const page = await browser.newPage({viewport: DESKTOP})
    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})

    const root = page.locator('html')
    const headline = page.getByRole('heading', {level: 1})
    await expectLocator(headline).toBeVisible({timeout: 20_000})
    await waitForLandingHydration(page)

    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.setViewportSize(DESKTOP)
        await page.getByRole('button', {name: 'Toggle theme'}).click()
        await expectLocator(root).toHaveClass(/dark/)
      }
      for (const width of VIEWPORT_WIDTHS) {
        await page.setViewportSize({width, height: 900})
        await expectLocator(headline).toBeVisible()
        for (const heading of await page.getByRole('heading', {level: 2}).all()) {
          await expectLocator(heading).toBeVisible()
        }
        await expectLocator(page.getByRole('navigation', {name: 'Footer'})).toBeVisible()

        const tile = page.getByRole('button', {name: /^View .+ at full size$/}).first()
        await tile.hover()
        await tile.click()
        await expectLocator(page.getByRole('dialog')).toBeVisible()
        await page.keyboard.press('Escape')
        await expectLocator(page.getByRole('dialog')).toBeHidden()

        const clientWidth = await root.evaluate((element) => element.clientWidth)
        await expectLocator(root).toHaveJSProperty('scrollWidth', clientWidth)

        const frameworkTabs = page.getByRole('tablist', {name: 'Frameworks'})
        const frameworkSelect = page.getByRole('combobox', {name: 'Framework'})
        const [shown, hidden] =
          width < FRAMEWORK_TABS_MIN_WIDTH ? [frameworkSelect, frameworkTabs] : [frameworkTabs, frameworkSelect]
        await expectLocator(shown).toBeVisible()
        await expectLocator(hidden).toBeHidden()

        for (const tabList of await page.getByRole('tablist').all()) {
          const overflow = await tabList.evaluate((element) => {
            const style = getComputedStyle(element)
            const scrolls = (value: string) => value === 'auto' || value === 'scroll'
            return {
              spillsX: element.scrollWidth > element.clientWidth,
              scrollbarX: scrolls(style.overflowX) && element.scrollWidth > element.clientWidth,
              scrollbarY: scrolls(style.overflowY) && element.scrollHeight > element.clientHeight,
            }
          })
          expect(overflow, `${theme} ${width}`).toEqual({spillsX: false, scrollbarX: false, scrollbarY: false})
        }
      }
    }

    await page.close()
  }, 240_000)
})

test.describe('github star count', () => {
  test('paints the count server-side, keeps the button rect through hydration and shows the ledger row', async ({
    browser,
  }) => {
    const page = await browser.newPage({viewport: DESKTOP})
    const response = await page.request.get(`${ORIGIN}/api/stars`)
    const {stars} = starsResponseSchema.parse(await response.json())

    const staticPage = await browser.newPage({viewport: DESKTOP, javaScriptEnabled: false})
    await staticPage.goto(LANDING, {waitUntil: 'domcontentloaded'})
    const staticButton = staticPage.getByRole('link', {name: 'conciv on GitHub'}).first()
    await expectLocator(staticButton).toBeVisible({timeout: 20_000})
    if (stars !== null) await expectLocator(staticButton).toContainText(`${stars} stars on GitHub`)
    await staticPage.evaluate(() => document.fonts.ready)
    const paintedText = await staticButton.innerText()
    const paintedRect = await staticButton.boundingBox()
    await staticPage.close()

    await page.goto(LANDING, {waitUntil: 'domcontentloaded'})
    await waitForLandingHydration(page)
    const button = page.getByRole('link', {name: 'conciv on GitHub'}).first()
    await expectLocator(button).toBeVisible({timeout: 20_000})
    if (stars === null) {
      await expectLocator(button).toHaveText(paintedText)
    } else {
      await expectLocator(button).toContainText(`${stars} stars on GitHub`)
      await expectLocator(button.getByText(formatStarCount(stars), {exact: true})).toBeVisible()
      await expectLocator(page.getByRole('cell', {name: 'stars'})).toBeVisible()
      await expectLocator(page.getByRole('cell', {name: formatStarCount(stars), exact: true})).toBeVisible()
    }
    await page.evaluate(() => document.fonts.ready)
    expect(await button.boundingBox()).toEqual(paintedRect)

    await page.close()
  }, 60_000)
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
