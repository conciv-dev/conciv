import {expect} from 'vitest'
import type {Page} from 'playwright'
import {expect as expectLocator} from 'playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {createSiteTest} from './site-fixture.js'
import {waitForLandingHydration} from './landing-page.js'
import {HERO_HEADLINE} from '../src/components/landing/hero.js'
import {SNIPPET_TWOSLASH} from '../src/components/landing/framework-snippets.gen.js'

const SITE_PORT = 8797
const INSPECTOR_PORT = 9797
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`
const LANDING = `${ORIGIN}/?widget=false`
const DOCS = `${ORIGIN}/docs?widget=false`
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']
const BLOCKING_IMPACTS = new Set(['serious', 'critical'])
const VIEWPORTS = [
  {name: 'desktop', width: 1440, height: 900},
  {name: 'mobile', width: 390, height: 844},
]
const THEMES = ['light', 'dark']
const FIRST_DOCUMENTED_HOVER = SNIPPET_TWOSLASH.flatMap((entry) => entry.hovers).find((hover) => hover.docs !== null)

const test = createSiteTest({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>
type Violation = AxeResults['violations'][number]
type Finding = {state: string; violation: Violation}

function describeViolation({state, violation}: Finding): string {
  const nodes = violation.nodes
    .map(
      (node) => `    - target: ${node.target.join(' ')}\n      html: ${node.html}\n      ${node.failureSummary ?? ''}`,
    )
    .join('\n')
  return `[${state}] ${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n${nodes}`
}

const isBlocking = ({violation}: Finding) =>
  violation.id === 'color-contrast' || BLOCKING_IMPACTS.has(violation.impact ?? '')

async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

async function scan(page: Page, state: string, findings: Finding[]): Promise<void> {
  await settleAnimations(page)
  const results: AxeResults = await new AxeBuilder({page}).withTags(AXE_TAGS).setLegacyMode().analyze()
  for (const violation of results.violations) findings.push({state, violation})
}

async function openLanding(page: Page, theme: string): Promise<void> {
  await page.goto(LANDING, {waitUntil: 'domcontentloaded'})
  await expectLocator(page.getByRole('heading', {level: 1})).toHaveText(HERO_HEADLINE, {timeout: 20_000})
  await waitForLandingHydration(page)
  if (theme === 'light') return
  await page.getByRole('button', {name: 'Toggle theme'}).click()
  await expectLocator(page.locator('html')).toHaveClass(/dark/)
}

async function scanLandingStates(page: Page, label: string, findings: Finding[]): Promise<void> {
  await scan(page, `${label} initial`, findings)

  const footer = page.getByRole('navigation', {name: 'Footer'})
  await footer.scrollIntoViewIfNeeded()
  await expectLocator(footer).toBeInViewport()
  await scan(page, `${label} footer`, findings)

  const tile = page.getByRole('button', {name: 'View Grab any element at full size'})
  await tile.scrollIntoViewIfNeeded()
  await tile.hover()
  await scan(page, `${label} tile hovered`, findings)

  await tile.click()
  const dialog = page.getByRole('dialog', {name: 'Grab any element'})
  await expectLocator(dialog).toBeVisible()
  await scan(page, `${label} lightbox open`, findings)
  await page.keyboard.press('Escape')
  await expectLocator(dialog).toBeHidden()

  if (!FIRST_DOCUMENTED_HOVER) throw new Error('no documented twoslash hover in the framework snippets')
  const anchor = page.getByRole('button', {name: `Type of ${FIRST_DOCUMENTED_HOVER.target}`}).first()
  await anchor.scrollIntoViewIfNeeded()
  await anchor.focus()
  const firstDocLine = FIRST_DOCUMENTED_HOVER.docs?.split('\n')[0] ?? ''
  await expectLocator(page.getByText(firstDocLine, {exact: false})).toBeVisible()
  await scan(page, `${label} hover card open`, findings)
}

function assertClean(findings: Finding[]): void {
  const blocking = findings.filter(isBlocking)
  const report = blocking.map(describeViolation).join('\n\n')
  expect(blocking.length, `axe violations:\n${report}`).toBe(0)
}

test.describe('axe WCAG AA scan', () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`landing at ${viewport.width}x${viewport.height} ${theme} has no serious or contrast violations in any state`, async ({
        browser,
      }) => {
        const page = await browser.newPage({viewport: {width: viewport.width, height: viewport.height}})
        const findings: Finding[] = []
        await openLanding(page, theme)
        await scanLandingStates(page, `${viewport.name} ${theme}`, findings)
        await page.close()
        assertClean(findings)
      }, 120_000)
    }
  }

  test('docs landing has no serious or contrast violations', async ({browser}) => {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}})
    const findings: Finding[] = []
    await page.goto(DOCS, {waitUntil: 'domcontentloaded'})
    await expectLocator(page.getByRole('heading', {level: 1})).toBeVisible({timeout: 20_000})
    await scan(page, 'docs', findings)
    await page.close()
    assertClean(findings)
  }, 60_000)
})

type FocusStop = {role: string; name: string; focusRing: boolean}

async function currentFocus(page: Page): Promise<FocusStop | null> {
  return page.evaluate(() => {
    const deepest = (candidate: Element | null): Element | null =>
      candidate?.shadowRoot?.activeElement ? deepest(candidate.shadowRoot.activeElement) : candidate
    const element = deepest(document.activeElement)
    if (!(element instanceof HTMLElement) || element === document.body) return null
    const style = getComputedStyle(element)
    const focusRing = (style.outlineStyle !== 'none' && style.outlineWidth !== '0px') || style.boxShadow !== 'none'
    const name =
      element.getAttribute('aria-label') ??
      element.getAttribute('title') ??
      element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60) ??
      ''
    return {role: element.getAttribute('role') ?? element.tagName.toLowerCase(), name, focusRing}
  })
}

const REQUIRED_STOPS = [
  'conciv home',
  'How it works',
  'Docs',
  'conciv on GitHub',
  'Toggle theme',
  'View Grab any element at full size',
  'View Any running app at full size',
]

test.describe('keyboard order', () => {
  test('every tab stop on the landing page is visible, in the viewport and shows a focus ring', async ({browser}) => {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}})
    await openLanding(page, 'light')

    const stops: FocusStop[] = []
    await page.keyboard.press('Tab')
    const first = await page.evaluateHandle(() => document.activeElement)
    for (let index = 0; index < 300; index += 1) {
      const stop = await currentFocus(page)
      if (!stop) break
      const focused = page.locator(':focus').last()
      await expectLocator(focused).toBeVisible()
      await expectLocator(focused).toBeInViewport()
      stops.push(stop)
      await page.keyboard.press('Tab')
      const wrapped = await page.evaluate((start) => document.activeElement === start, first)
      if (wrapped) break
    }

    const names = stops.map((stop) => stop.name)
    for (const required of REQUIRED_STOPS) {
      expect(names, `tab order:\n${names.join('\n')}`).toContain(required)
    }
    const withoutRing = stops.filter((stop) => !stop.focusRing)
    expect(withoutRing, `tab stops without a visible focus ring, order:\n${names.join('\n')}`).toEqual([])

    await page.close()
  }, 120_000)
})
