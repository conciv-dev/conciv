import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import {ELEMENT_WRITE_THROTTLE_MS} from '../src/client/whiteboard-collection.js'
import {openCanvas} from './canvas-it-helpers.js'

const flushBudget = (elapsedMs: number): number => Math.ceil(elapsedMs / ELEMENT_WRITE_THROTTLE_MS) + 2

const clientEntry = '@conciv/extension-whiteboard/client'

type CanvasElement = {x: number; width: number; height: number}
const readElements = async (api: ExtensionTestApi): Promise<CanvasElement[]> =>
  ((await api.callTool('canvas.read', {})) as {elements: CanvasElement[]}).elements

const readXs = async (api: ExtensionTestApi): Promise<number[]> =>
  (await readElements(api)).map((element) => element.x).sort((left, right) => left - right)

const drawRectangle = async (page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> => {
  await page.getByRole('radio', {name: 'Rectangle'}).click({force: true})
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, {steps: 10})
  await page.mouse.up()
}

const putCounts = (page: Page): {single: number; bulk: number} => {
  const counts = {single: 0, bulk: 0}
  page.on('request', (request) => {
    if (request.method() !== 'PUT') return
    const {pathname} = new URL(request.url())
    if (pathname.endsWith('/elements/live/bulk')) return void (counts.bulk += 1)
    if (pathname.endsWith('/elements/live')) counts.single += 1
  })
  return counts
}

const dragBursts = async (page: Page, fromX: number, y: number, dx: number): Promise<void> => {
  await page.mouse.move(fromX, y)
  await page.mouse.down()
  await page.mouse.move(fromX + 6 * dx, y, {steps: 90})
  await page.mouse.up()
}

test('a single-element drag coalesces per-frame writes into few throttled PUTs', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx - 120, cy - 80, cx + 120, cy + 80)
    await expect
      .poll(async () => (await readElements(api))[0]?.width ?? 0, {timeout: 15_000, interval: 250})
      .toBeGreaterThan(100)
    const startX = (await readElements(api))[0]?.x ?? 0
    await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
    const counts = putCounts(api.page)
    const dragStartedAt = Date.now()
    await dragBursts(api.page, cx, cy, 40)
    await expect
      .poll(async () => ((await readElements(api))[0]?.x ?? startX) - startX, {timeout: 8_000, interval: 250})
      .toBeGreaterThan(180)
    expect(counts.single).toBeGreaterThan(1)
    expect(counts.single).toBeLessThanOrEqual(flushBudget(Date.now() - dragStartedAt))
    expect(counts.bulk).toBe(0)
  } finally {
    await api.dispose()
  }
})

test('a multi-select drag collapses to bulk PUTs, not a single-PUT storm', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx - 220, cy - 40, cx - 120, cy + 40)
    await drawRectangle(api.page, cx + 120, cy - 40, cx + 220, cy + 40)
    await expect.poll(async () => (await readElements(api)).length, {timeout: 15_000, interval: 250}).toBe(2)
    const startXs = await readXs(api)
    await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
    await api.page.mouse.move(cx - 300, cy - 120)
    await api.page.mouse.down()
    await api.page.mouse.move(cx + 300, cy + 140, {steps: 10})
    await api.page.mouse.up()
    const counts = putCounts(api.page)
    const dragStartedAt = Date.now()
    await dragBursts(api.page, cx - 170, cy, 26)
    await expect
      .poll(
        async () => {
          const xs = await readXs(api)
          const [x0, x1] = xs
          const [s0, s1] = startXs
          return (
            x0 !== undefined &&
            x1 !== undefined &&
            s0 !== undefined &&
            s1 !== undefined &&
            x0 - s0 > 100 &&
            x1 - s1 > 100
          )
        },
        {timeout: 8_000, interval: 250},
      )
      .toBe(true)
    expect(counts.bulk).toBeGreaterThan(0)
    expect(counts.single + counts.bulk).toBeLessThanOrEqual(flushBudget(Date.now() - dragStartedAt))
  } finally {
    await api.dispose()
  }
})
