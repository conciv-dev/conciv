import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import {rpcObserverFor, type RpcObserver} from '@conciv/extension-testkit/rpc-observer'
import {ELEMENT_WRITE_THROTTLE_MS} from '../src/client/whiteboard-collection.js'
import {until} from '@conciv/harness-testkit'
import {openCanvas, testHost} from './canvas-it-helpers.js'

const flushBudget = (elapsedMs: number): number => Math.ceil(elapsedMs / ELEMENT_WRITE_THROTTLE_MS) + 2

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

const UPSERT_PATH = ['ext', 'whiteboard', 'elements', 'upsert']
const BULK_UPSERT_PATH = ['ext', 'whiteboard', 'elements', 'bulkUpsert']

const putCounts = (observer: RpcObserver, since: number): {single: number; bulk: number} => ({
  single: observer.startedCount({path: UPSERT_PATH, since}),
  bulk: observer.startedCount({path: BULK_UPSERT_PATH, since}),
})

const dragBursts = async (page: Page, fromX: number, y: number, dx: number): Promise<void> => {
  await page.mouse.move(fromX, y)
  await page.mouse.down()
  await page.mouse.move(fromX + 6 * dx, y, {steps: 90})
  await page.mouse.up()
}

test('a single-element drag coalesces per-frame writes into few throttled PUTs', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx - 120, cy - 80, cx + 120, cy + 80)
    await until(async () => ((await readElements(api))[0]?.width ?? 0) > 100, {hangGuardMs: 30_000, intervalMs: 250})
    const startX = (await readElements(api))[0]?.x ?? 0
    await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
    const observer = rpcObserverFor(api.page)
    const mark = observer.mark()
    const dragStartedAt = Date.now()
    await dragBursts(api.page, cx, cy, 40)
    await until(async () => ((await readElements(api))[0]?.x ?? startX) - startX > 180, {
      hangGuardMs: 30_000,
      intervalMs: 250,
    })
    const counts = putCounts(observer, mark)
    expect(counts.single).toBeGreaterThan(1)
    expect(counts.single).toBeLessThanOrEqual(flushBudget(Date.now() - dragStartedAt))
    expect(counts.bulk).toBe(0)
  } finally {
    await api.dispose()
  }
})

test('a multi-select drag collapses to bulk PUTs, not a single-PUT storm', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    const {cx, cy} = await openCanvas(api.page)
    await drawRectangle(api.page, cx - 220, cy - 40, cx - 120, cy + 40)
    await drawRectangle(api.page, cx + 120, cy - 40, cx + 220, cy + 40)
    await until(async () => (await readElements(api)).length === 2, {hangGuardMs: 30_000, intervalMs: 250})
    const startXs = await readXs(api)
    await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
    await api.page.mouse.move(cx - 300, cy - 120)
    await api.page.mouse.down()
    await api.page.mouse.move(cx + 300, cy + 140, {steps: 10})
    await api.page.mouse.up()
    const observer = rpcObserverFor(api.page)
    const mark = observer.mark()
    const dragStartedAt = Date.now()
    await dragBursts(api.page, cx - 170, cy, 26)
    await until(
      async () => {
        const [x0, x1] = await readXs(api)
        const [s0, s1] = startXs
        if (x0 === undefined || x1 === undefined || s0 === undefined || s1 === undefined) return false
        return x0 - s0 > 100 && x1 - s1 > 100
      },
      {hangGuardMs: 30_000, intervalMs: 250},
    )
    const counts = putCounts(observer, mark)
    expect(counts.bulk).toBeGreaterThan(0)
    expect(counts.single + counts.bulk).toBeLessThanOrEqual(flushBudget(Date.now() - dragStartedAt))
  } finally {
    await api.dispose()
  }
})
