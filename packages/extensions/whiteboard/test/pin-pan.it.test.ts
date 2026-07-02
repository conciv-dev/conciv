import {expect, test} from 'vitest'
import type {Locator, Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<{cx: number; cy: number}> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
  const {width, height} = page.viewportSize() ?? {width: 1280, height: 720}
  return {cx: width / 2, cy: height / 2}
}

const projectedTop = (pin: Locator) => async (): Promise<number> =>
  pin.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top) || 0)

test('a comment pin is projected to screen and tracks canvas pan', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await api.callTool('comment.create', {
      cid: crypto.randomUUID(),
      kind: 'floating',
      parts: [{type: 'text', text: 'pan test'}],
      x: 240,
      y: 240,
      authorKind: 'ai',
    })

    const pin = api.page.getByRole('button', {name: /comment, open/})
    await pin.waitFor({timeout: 15_000})
    const top0 = await projectedTop(pin)()
    expect(top0).toBeGreaterThan(0)

    await api.page.mouse.move(cx, cy)
    await api.page.mouse.wheel(0, 320)

    await expect
      .poll(async () => Math.abs((await projectedTop(pin)()) - top0), {timeout: 8_000, interval: 200})
      .toBeGreaterThan(80)
  } finally {
    await api.dispose()
  }
})
