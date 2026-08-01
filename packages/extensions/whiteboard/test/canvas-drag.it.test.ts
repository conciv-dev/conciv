import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {fixtureHost, getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import {until} from '@conciv/harness-testkit'
import {openCanvas} from './canvas-it-helpers.js'

const clientEntry = '@conciv/extension-whiteboard/client'

type CanvasElement = {x: number; width: number; height: number}
const readElements = async (api: ExtensionTestApi): Promise<CanvasElement[]> =>
  ((await api.callTool('canvas.read', {})) as {elements: CanvasElement[]}).elements

const firstWidth = (api: ExtensionTestApi) => async (): Promise<number> => (await readElements(api))[0]?.width ?? 0
const firstDeltaX = (api: ExtensionTestApi, fromX: number) => async (): Promise<number> =>
  ((await readElements(api))[0]?.x ?? fromX) - fromX

const drawRectangle = async (page: Page, cx: number, cy: number): Promise<void> => {
  await page.getByRole('radio', {name: 'Rectangle'}).click({force: true})
  await page.mouse.move(cx - 120, cy - 80)
  await page.mouse.down()
  await page.mouse.move(cx + 120, cy + 80, {steps: 14})
  await page.mouse.up()
}

test('a drawn rectangle keeps its real size and does not collapse to a point', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: fixtureHost(clientEntry)})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx, cy)
    await expect.poll(firstWidth(api), {timeout: 30_000, interval: 250}).toBeGreaterThan(100)
    const settled = (await readElements(api))[0]
    expect(settled?.height).toBeGreaterThan(60)
    await until(async () => ((await readElements(api))[0]?.width ?? 0) >= (settled?.width ?? 0) * 0.9, {
      settleFor: 2000,
      hangGuardMs: 8000,
      intervalMs: 250,
    })
  } finally {
    await api.dispose()
  }
})

test('dragging a rectangle moves it the full cursor distance, not a fraction', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: fixtureHost(clientEntry)})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx, cy)
    await expect.poll(firstWidth(api), {timeout: 30_000, interval: 250}).toBeGreaterThan(100)
    const startX = (await readElements(api))[0]?.x ?? 0
    await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
    await api.page.mouse.move(cx, cy)
    await api.page.mouse.down()
    for (let step = 1; step <= 10; step += 1) await api.page.mouse.move(cx + step * 20, cy, {steps: 1})
    await api.page.mouse.up()
    await expect.poll(firstDeltaX(api, startX), {timeout: 30_000, interval: 250}).toBeGreaterThan(180)
  } finally {
    await api.dispose()
  }
})
