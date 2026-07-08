import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {clientEntry, openCanvas, readCanvas as readElements} from './canvas-it-helpers.js'

const drawRectangle = async (page: Page, cx: number, cy: number): Promise<void> => {
  await page.mouse.click(cx, cy)
  await page.keyboard.press('r')
  await page.mouse.move(cx - 60, cy - 40)
  await page.mouse.down()
  await page.mouse.move(cx + 60, cy + 40, {steps: 8})
  await page.mouse.up()
}

test('a human-drawn element shows an author chip with the guest name', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx, cy)
    await expect.poll(() => readElements(api, 'live'), {timeout: 15_000}).not.toHaveLength(0)
    await api.page.getByText(/^Guest \w+/).first().waitFor({state: 'visible', timeout: 10_000})
  } finally {
    await api.dispose()
  }
})
