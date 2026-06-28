import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi, type ExtensionTestApi} from '@mandarax/extension-testkit'

const clientEntry = '@mandarax/extension-whiteboard/client'

type CanvasElement = {x: number; width: number; height: number}
const readElements = async (api: ExtensionTestApi): Promise<CanvasElement[]> =>
  ((await api.callTool('canvas.read', {})) as {elements: CanvasElement[]}).elements

const openCanvas = async (page: Page): Promise<{cx: number; cy: number}> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
  const {width, height} = page.viewportSize() ?? {width: 1280, height: 720}
  return {cx: width / 2, cy: height / 2}
}

const drawRectangle = async (page: Page, cx: number, cy: number): Promise<void> => {
  await page.getByRole('radio', {name: 'Rectangle'}).click({force: true})
  await page.mouse.move(cx - 120, cy - 80)
  await page.mouse.down()
  await page.mouse.move(cx + 120, cy + 80, {steps: 14})
  await page.mouse.up()
}

test('a drawn rectangle keeps its real size and does not collapse to a point', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx, cy)
    await api.page.waitForTimeout(2_000)
    const [element] = await readElements(api)
    expect(element?.width).toBeGreaterThan(100)
    expect(element?.height).toBeGreaterThan(60)
  } finally {
    await api.dispose()
  }
})

test('dragging a rectangle moves it the full cursor distance, not a fraction', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx, cy)
    await api.page.waitForTimeout(800)
    const [before] = await readElements(api)
    await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
    await api.page.mouse.move(cx, cy)
    await api.page.mouse.down()
    for (let step = 1; step <= 10; step += 1) await api.page.mouse.move(cx + step * 20, cy, {steps: 1})
    await api.page.mouse.up()
    await api.page.waitForTimeout(800)
    const [after] = await readElements(api)
    expect((after?.x ?? 0) - (before?.x ?? 0)).toBeGreaterThan(180)
  } finally {
    await api.dispose()
  }
})
