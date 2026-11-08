import {expect, test} from '@playwright/test'
import {makeExtRpcClient} from '@conciv/extension'
import type {XrayRouter} from '@conciv/extension-design/server'
import {designConfig} from '../../../extensions/design/src/shared/tolerances.js'
import {walk} from '../../../extensions/design/src/shared/tree.js'
import {bootDesignHost} from '../fixtures/design/boot.js'
import {cardsDesign} from '../fixtures/design/cards.js'

const VARIANTS = ['target', 'shifted', 'target'] as const

test('the x-ray overlay draws round 3 on the page and backs out with Esc', async () => {
  const kit = await bootDesignHost()
  const {page} = kit
  const xray = makeExtRpcClient<XrayRouter>(kit.apiBase, 'design')
  const overlay = page.getByRole('navigation', {name: 'Design x-ray'})
  const boxes = page.getByRole('group', {name: 'Design x-ray boxes'}).getByRole('button')
  const card = page.getByRole('complementary', {name: 'Design x-ray card'})
  try {
    await page.setViewportSize({width: 1440, height: 900})
    await page.emulateMedia({reducedMotion: 'reduce'})
    await kit.goto('target')
    const got = await kit.call('design_get', await cardsDesign(kit.targetsDir))
    await VARIANTS.reduce(async (previous, variant) => {
      await previous
      await kit.goto(variant)
      await kit.call('design_check', {})
    }, Promise.resolve())
    const listed = await xray.xray.rounds({id: got.target})
    expect(listed.rounds).toHaveLength(3)
    const last = listed.rounds.at(-1)?.round ?? 0
    const layers = await xray.xray.layers({id: got.target, round: last})
    if (layers === null) throw new Error(`round ${last} has no id tree`)
    const drawn = [...walk(layers.root)].filter(({node}) => node.id !== '' && node.dom.length > 0)

    await test.step('the overlay opens on round 3 of 3', async () => {
      await page.keyboard.press('ControlOrMeta+Shift+KeyX')
      await expect(overlay).toBeVisible()
      await expect(overlay.getByText('round 3 of 3')).toBeVisible()
      await expect(overlay.getByRole('img', {name: 'design'})).toBeVisible()
      await expect(overlay.getByRole('img', {name: 'live page'})).toBeVisible()
      await page.screenshot({path: test.info().outputPath('overlay-light.png')})
      await page.emulateMedia({colorScheme: 'dark'})
      await expect(page.locator(`[${designConfig.attributes.overlay}]`)).toHaveClass('dark')
      await page.screenshot({path: test.info().outputPath('overlay-dark.png')})
      await page.emulateMedia({colorScheme: 'light'})
      await expect(page.locator(`[${designConfig.attributes.overlay}]`)).toHaveClass('light')
    })

    await test.step('every id of the round is one box', async () => {
      await overlay.getByRole('button', {name: 'matched'}).click()
      await overlay.getByRole('button', {name: 'Pick a box'}).click()
      await expect(boxes).toHaveCount(drawn.length)
    })

    await test.step('the width slider draws the design-width boxes measured at the design width', async () => {
      const measured = overlay.getByText(`boxes measured at ${layers.width}`)
      await overlay.getByRole('slider', {name: 'Width'}).click()
      await page.keyboard.press('ArrowRight')
      await expect(measured).toBeVisible()
      await page.screenshot({path: test.info().outputPath('reflow-width.png')})
      await page.keyboard.press('ArrowLeft')
      await expect(measured).toBeHidden()
    })

    await test.step('the card shows the four layers of one id with the stored values', async () => {
      const picked = drawn.find(({node}) => node.fom.length > 0 && node.src.at !== null) ?? drawn[0]
      if (picked === undefined) throw new Error('round 3 drew no box')
      const {node} = picked
      const name =
        node.fom.find((entry: {look: {name: string} | null}) => entry.look !== null)?.look?.name ?? node.src.element
      await page
        .getByRole('group', {name: 'Design x-ray boxes'})
        .getByRole('button', {name: `${name} ${node.id}`, exact: true})
        .click()
      await expect(card).toBeVisible()
      await Promise.all(
        ['FOM', 'DOM', 'CSSOM', 'SRC'].map((section) =>
          expect(card.getByRole('region', {name: section})).toBeVisible(),
        ),
      )
      await expect(
        card.getByRole('region', {name: 'DOM'}).getByText(node.dom[0]?.path ?? '', {exact: true}),
      ).toBeVisible()
      const at = node.src.at
      if (at !== null) await expect(card.getByRole('button', {name: `${at.file}:${at.line}`})).toBeVisible()
      await page.screenshot({path: test.info().outputPath('card.png')})
    })

    await test.step('3D stacks the planes and focus on FOM shows the design', async () => {
      const planes = page.getByRole('group', {name: 'Design x-ray planes'})
      await overlay.getByRole('button', {name: '3D'}).click()
      await expect(planes.getByRole('region', {name: 'SRC plane'})).toBeVisible()
      await page.screenshot({path: test.info().outputPath('three-d-stack.png')})
      await planes.getByRole('button', {name: 'FOM', exact: true}).click()
      await expect(planes.getByRole('region', {name: 'SRC plane'})).toBeHidden()
      await expect(planes.getByRole('region', {name: 'FOM plane'}).getByRole('img', {name: 'design'})).toBeVisible()
      await page.screenshot({path: test.info().outputPath('three-d-fom.png')})
      await page.keyboard.press('Escape')
      await expect(planes.getByRole('region', {name: 'SRC plane'})).toBeVisible()
      await overlay.getByRole('button', {name: '3D'}).click()
      await expect(planes).toBeHidden()
    })

    await test.step('a check with the overlay on sees the same page: the capture leaves the overlay out', async () => {
      await expect(overlay).toBeVisible()
      const again = await kit.call('design_check', {})
      expect('round' in again ? again.round : null).toBe(last)
    })

    await test.step('Esc closes the card, turns pick off, then the overlay', async () => {
      await page.keyboard.press('Escape')
      await expect(card).toBeHidden()
      await page.keyboard.press('Escape')
      await expect(overlay.getByRole('button', {name: 'Pick a box'})).toHaveAttribute('aria-pressed', 'false')
      await page.keyboard.press('Escape')
      await expect(overlay).toBeHidden()
    })
  } finally {
    await kit.dispose()
  }
})
