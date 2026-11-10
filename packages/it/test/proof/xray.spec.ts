import {join} from 'node:path'
import {expect, test, type Locator, type Page} from '@playwright/test'
import {designConfig} from '../../../extensions/design/src/shared/tolerances.js'
import {bootDesignHost} from '../fixtures/design/boot.js'

const SCHEMES = ['light', 'dark'] as const

const BOXES = [
  {name: 'Greeting 33:240', element: '[data-conciv-key="dfU4xA"]'},
  {name: 'Stat / Picked 34:600', element: '[data-conciv-instance="A4VsVg/yW45EQ/Picked this week"]'},
  {name: 'Stat / Invoices 34:610', element: '[data-conciv-instance="A4VsVg/yW45EQ/Open invoices"]'},
  {name: 'Stat / Trucks 34:620', element: '[data-conciv-instance="A4VsVg/yW45EQ/Trucks on the road"]'},
  {name: 'Avatar 34:617', element: '[data-conciv-key="arzcgA"]'},
]

const WIDTHS = [1800, 1200]

const ACTION_MS = 15_000

const STAT_PREVIEW = '/__conciv/preview/2a6daca08a84a2caed721c09f9a76bd9e51cd0f3bec7a545728c9c08510f97ad'

test('the x-ray overlay shows each mockup state on its fixture sample, light and dark', async () => {
  const kit = await bootDesignHost()
  const {page} = kit
  page.setDefaultTimeout(ACTION_MS)
  const rail = page.getByRole('navigation', {name: 'Design x-ray rail'})
  const panel = page.getByRole('region', {name: 'Design x-ray'})
  const stage = page.getByRole('group', {name: 'Design x-ray stage'})
  const host = page.locator(`[${designConfig.attributes.overlay}]`)
  const open = async (input: {state: string; scheme: (typeof SCHEMES)[number]}): Promise<void> => {
    await page.emulateMedia({reducedMotion: 'reduce', colorScheme: input.scheme})
    await kit.goto(`/?variant=xray&state=${input.state}`)
    await page.keyboard.press('ControlOrMeta+Shift+KeyX')
    await expect(rail).toBeVisible()
    await expect(host).toHaveClass(input.scheme)
  }
  try {
    await page.setViewportSize({width: 1440, height: 900})
    for (const scheme of SCHEMES) {
      await test.step(`empty, ${scheme}: the rail and the notice, no panel`, async () => {
        await open({state: 'empty', scheme})
        await expect(page.getByText('No design registered')).toBeVisible()
        await expect(rail.getByRole('button', {name: 'Panel'})).toBeVisible()
        await shot({page, state: 'empty', scheme})
      })

      await test.step(`empty, ${scheme}: the Pick tooltip floats above the notice`, async () => {
        await rail.getByRole('button', {name: 'Pick', exact: true}).hover()
        const tooltip = page.getByRole('tooltip', {name: 'Pick'})
        await expect(tooltip).toBeVisible()
        expect(await topmostAtCentre(tooltip)).toBe(true)
        if (scheme === 'light') await shot({page, state: 'empty', scheme: 'light-tooltip'})
        await page.mouse.move(720, 600)
        await expect(tooltip).toBeHidden()
      })

      await test.step(`round, ${scheme}: the problems view of the sample round`, async () => {
        await open({state: 'round', scheme})
        await expect(panel.getByRole('heading', {name: 'Not matching yet'})).toBeVisible()
        await expect(panel.getByText('Check 6 of 6')).toBeVisible()
        await expect(panel.getByText(/^5 problems on 4 elements\./)).toBeVisible()
        await expect(panel.getByText('PROBLEMS · 4')).toBeVisible()
        await expect(panel.getByText('Too short: 56px tall, the design wants 64px.')).toBeVisible()
        await expect(panel.getByRole('radio', {name: 'Desktop 1440'})).toBeChecked()
        await expect(panel.getByRole('switch', {name: 'Outlines of the design'})).toBeChecked()
        await expect(page.getByRole('button', {name: 'Stat / Picked 34:600'})).toBeVisible()
        await expect(panel.getByRole('list', {name: 'Problems'}).getByText('Token drift', {exact: true})).toHaveCount(1)
        await shot({page, state: 'round', scheme})
      })

      await test.step(`round, ${scheme}: one scroll container, the chips clear of its scrollbar`, async () => {
        await page.setViewportSize({width: 1440, height: 560})
        const list = panel.getByRole('list', {name: 'Problems'})
        const last = list.getByRole('listitem').last()
        await last.scrollIntoViewIfNeeded()
        await expect(last).toBeInViewport()
        expect(await panel.evaluate((element) => element.scrollHeight === element.clientHeight)).toBe(true)
        if (scheme === 'light') await shot({page, state: 'round', scheme: 'light-short'})
        const viewport = await list.evaluate(
          (element) => element.closest('[data-part="viewport"]')?.getBoundingClientRect().right ?? 0,
        )
        for (const chip of await list.getByText('Looks different').all()) {
          expect(await chip.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThan(viewport)
        }
        await page.setViewportSize({width: 1440, height: 900})
      })

      await test.step(`round, ${scheme}: a width with no problems keeps the list short`, async () => {
        const row = await panel.getByRole('button', {name: /^Avatar/}).boundingBox()
        const list = await panel.getByRole('list', {name: 'Problems'}).boundingBox()
        const spread = await headingSpread(panel, 'PROBLEMS · 4')
        await panel.getByText('Laptop 1024').click()
        await expect(panel.getByText('PROBLEMS · 0')).toBeVisible()
        await expect(panel.getByText('Nothing to fix at this width.')).toBeVisible()
        const empty = await headingSpread(panel, 'PROBLEMS · 0')
        if (scheme === 'light') await shot({page, state: 'round', scheme: 'light-laptop'})
        expect(empty - (spread - (list?.height ?? 0))).toBeLessThanOrEqual(row?.height ?? 0)
        await panel.getByText('Desktop 1440').click()
        await expect(panel.getByText('PROBLEMS · 4')).toBeVisible()
      })

      await test.step(`round, ${scheme}: a problem row outlines and picks its element`, async () => {
        await panel.getByRole('button', {name: /^Avatar/}).hover()
        await expect(page.getByRole('button', {name: 'Avatar 34:617'})).toHaveAttribute('data-hover', '')
        if (scheme === 'light') await shot({page, state: 'round', scheme: 'light-hover'})
        await panel.getByRole('button', {name: /^Stat \/ Picked/}).click()
        await expect(panel.getByText('div.lp-card')).toBeVisible()
        await expect(page.getByRole('button', {name: 'Stat / Picked 34:600'})).toHaveAttribute('aria-current', 'true')
        await panel.getByRole('button', {name: 'All problems'}).click()
        await expect(panel.getByText('PROBLEMS · 4')).toBeVisible()
      })

      await test.step(`round, ${scheme}: every box follows its element across widths`, async () => {
        for (const width of WIDTHS) {
          await page.setViewportSize({width, height: 900})
          await nextFrame(page)
          for (const box of BOXES) {
            const drawn = await page.getByRole('button', {name: box.name}).boundingBox()
            const element = await page.locator(box.element).boundingBox()
            expect(Math.abs((drawn?.x ?? 0) - (element?.x ?? Infinity))).toBeLessThanOrEqual(1)
            expect(Math.abs((drawn?.y ?? 0) - (element?.y ?? Infinity))).toBeLessThanOrEqual(1)
            expect(Math.abs((drawn?.width ?? 0) - (element?.width ?? Infinity))).toBeLessThanOrEqual(1)
            expect(Math.abs((drawn?.height ?? 0) - (element?.height ?? Infinity))).toBeLessThanOrEqual(1)
          }
        }
        await page.setViewportSize({width: 1440, height: 900})
      })

      await test.step(`card, ${scheme}: one picked element and nothing of the list`, async () => {
        await rail.getByRole('button', {name: 'Pick', exact: true}).click()
        await page.getByRole('button', {name: 'Stat / Picked 34:600'}).click()
        await expect(panel.getByRole('button', {name: 'All problems'})).toBeVisible()
        await expect(panel.getByText('Design wants')).toBeVisible()
        await expect(panel.getByText('div.lp-card')).toBeVisible()
        await expect(panel.getByText('src/Stat.tsx, line 3')).toBeVisible()
        await expect(panel.getByText('In a component')).toBeVisible()
        await expect(panel.getByRole('link', {name: 'Stat · app · 1 import'})).toHaveAttribute('href', STAT_PREVIEW)
        await expect(panel.getByRole('link', {name: 'Stat · app · 1 import'})).toHaveAttribute('target', '_blank')
        await expect(panel.getByTitle('Stat preview')).toHaveAttribute('src', STAT_PREVIEW)
        await expect(panel.getByText('PROBLEMS · 4')).toBeHidden()
        await shot({page, state: 'card', scheme})
      })

      await test.step(`3D, ${scheme}: the stage, the planes and the counts`, async () => {
        await open({state: '3d', scheme})
        await rail.getByRole('button', {name: 'Stack', exact: true}).click()
        await expect(rail.getByRole('button', {name: 'Stack', exact: true})).toHaveAttribute('aria-pressed', 'true')
        await expect(panel.getByRole('slider', {name: 'Round'})).toBeVisible()
        await expect(panel.getByText('6 / 6')).toBeVisible()
        await expect(panel.getByRole('button', {name: 'SRC'})).toHaveAttribute('aria-pressed', 'true')
        await expect(panel.getByText('240')).toBeVisible()
        await expect(stage.getByText('FOM · design')).toBeVisible()
        await expect(page.getByRole('group', {name: 'Design x-ray boxes'})).toBeHidden()
        await expect(panel.getByText('PROBLEMS · 6')).toBeHidden()
        await shot({page, state: '3d', scheme})
      })
    }

    await test.step('Esc closes the overlay', async () => {
      await page.keyboard.press('Escape')
      await expect(rail).toBeHidden()
    })
  } finally {
    await kit.dispose()
  }
})

async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))),
  )
}

async function headingSpread(panel: Locator, problems: string): Promise<number> {
  const heading = await panel.getByText(problems).boundingBox()
  const shown = await panel.getByText('SHOW ON THE PAGE').boundingBox()
  return (shown?.y ?? Infinity) - (heading?.y ?? 0)
}

async function topmostAtCentre(tooltip: Locator): Promise<boolean> {
  return tooltip.evaluate((element) => {
    const root = element.getRootNode()
    if (!(root instanceof ShadowRoot) || !(element instanceof HTMLElement)) return false
    const rect = element.getBoundingClientRect()
    element.style.setProperty('pointer-events', 'auto')
    const hit = root.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    element.style.removeProperty('pointer-events')
    return hit !== null && element.contains(hit)
  })
}

async function shot(input: {page: Page; state: string; scheme: string}): Promise<void> {
  const folder = process.env.XRAY_SHOTS ?? test.info().outputPath()
  await input.page.screenshot({path: join(folder, `${input.state}-${input.scheme}.png`)})
}
