import {join} from 'node:path'
import {expect, test, type Page} from '@playwright/test'
import {designConfig} from '../../../extensions/design/src/shared/tolerances.js'
import {bootDesignHost} from '../fixtures/design/boot.js'

const SCHEMES = ['light', 'dark'] as const

test('the x-ray overlay shows each mockup state on its fixture sample, light and dark', async () => {
  const kit = await bootDesignHost()
  const {page} = kit
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

      await test.step(`round, ${scheme}: the problems view of the sample round`, async () => {
        await open({state: 'round', scheme})
        await expect(panel.getByRole('heading', {name: 'Not matching yet'})).toBeVisible()
        await expect(panel.getByText('Check 6 of 6')).toBeVisible()
        await expect(panel.getByText('PROBLEMS · 4')).toBeVisible()
        await expect(panel.getByText('Too short: 56px tall, the design wants 64px.')).toBeVisible()
        await expect(panel.getByRole('radio', {name: 'Desktop 1440'})).toBeChecked()
        await expect(panel.getByRole('switch', {name: 'Outlines of the design'})).toBeChecked()
        await expect(page.getByRole('button', {name: 'Stat / Picked 34:600'})).toBeVisible()
        await shot({page, state: 'round', scheme})
      })

      await test.step(`card, ${scheme}: one picked element and nothing of the list`, async () => {
        await rail.getByRole('button', {name: 'Pick', exact: true}).click()
        await page.getByRole('button', {name: 'Stat / Picked 34:600'}).click()
        await expect(panel.getByRole('button', {name: 'All problems'})).toBeVisible()
        await expect(panel.getByText('Design wants')).toBeVisible()
        await expect(panel.getByText('div.lp-card')).toBeVisible()
        await expect(panel.getByText('src/Stat.tsx, line 3')).toBeVisible()
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

async function shot(input: {page: Page; state: string; scheme: string}): Promise<void> {
  const folder = process.env.XRAY_SHOTS ?? test.info().outputPath()
  await input.page.screenshot({path: join(folder, `${input.state}-${input.scheme}.png`)})
}
