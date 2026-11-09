import {join} from 'node:path'
import {expect, test, type Page} from '@playwright/test'
import {designConfig} from '../../../extensions/design/src/shared/tolerances.js'
import {bootDesignHost} from '../fixtures/design/boot.js'
import {cardsDesign} from '../fixtures/design/cards.js'

test('the x-ray overlay walks empty, round, card and 3D on the x-ray route, light and dark', async () => {
  const kit = await bootDesignHost()
  const {page} = kit
  const rail = page.getByRole('navigation', {name: 'Design x-ray rail'})
  const panel = page.getByRole('region', {name: 'Design x-ray'})
  const boxes = page.getByRole('group', {name: 'Design x-ray boxes'}).getByRole('button')
  const host = page.locator(`[${designConfig.attributes.overlay}]`)
  const shots = async (state: string): Promise<void> => {
    await shot({page, state, scheme: 'light'})
    await page.emulateMedia({colorScheme: 'dark'})
    await expect(host).toHaveClass('dark')
    await shot({page, state, scheme: 'dark'})
    await page.emulateMedia({colorScheme: 'light'})
    await expect(host).toHaveClass('light')
  }
  try {
    await page.setViewportSize({width: 1440, height: 900})
    await page.emulateMedia({reducedMotion: 'reduce', colorScheme: 'light'})
    await kit.goto('xray')
    await kit.call('design_get', {...(await cardsDesign(kit.targetsDir)), widget: 'shown'})

    await test.step('empty: a design and no round, the rail and the notice', async () => {
      await page.keyboard.press('ControlOrMeta+Shift+KeyX')
      await expect(rail).toBeVisible()
      await expect(rail.getByRole('button', {name: 'X-ray'})).toBeVisible()
      await expect(panel.getByText('No design registered')).toBeVisible()
      await shots('empty')
    })

    await test.step('round: the panel reads the round the check wrote', async () => {
      await kit.call('design_check', {})
      await expect(panel.getByRole('heading', {level: 2})).toBeVisible()
      await expect(panel.getByText(/Check 1 of 1/)).toBeVisible()
      await expect(panel.getByRole('checkbox', {name: 'Outlines of the design'})).toBeChecked()
      await expect(panel.getByRole('button', {name: /^(Desktop|Laptop|Mobile) \d+$/, pressed: true})).toBeVisible()
      await shots('round')
    })

    await test.step('card: Pick on, one box picked, its card in the panel', async () => {
      await rail.getByRole('button', {name: 'Pick'}).click()
      await expect(rail.getByRole('button', {name: 'Pick'})).toHaveAttribute('aria-pressed', 'true')
      await boxes.last().click()
      await expect(panel.getByRole('button', {name: 'All problems'})).toBeVisible()
      await expect(panel.getByRole('button', {name: 'Copy for the agent'})).toBeVisible()
      await shots('card')
      await panel.getByRole('button', {name: 'All problems'}).click()
      await rail.getByRole('button', {name: 'Pick'}).click()
    })

    await test.step('3D: Stack on, the round slider and the planes', async () => {
      await rail.getByRole('button', {name: 'Stack'}).click()
      await expect(rail.getByRole('button', {name: 'Stack'})).toHaveAttribute('aria-pressed', 'true')
      await expect(panel.getByRole('slider', {name: 'Round'})).toBeVisible()
      await expect(panel.getByRole('button', {name: 'SRC'})).toHaveAttribute('aria-pressed', 'true')
      await shots('3d')
      await rail.getByRole('button', {name: 'Stack'}).click()
    })

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
