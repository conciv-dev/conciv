import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'

const nativeDistDir = fileURLToPath(new URL('../dist/', import.meta.url))

type Rect = {x: number; y: number; width: number; height: number}
type Toggle = {type: string; open?: boolean; connected?: boolean; mascotRect?: Rect}

let browser: Browser
let kit: CoreKit

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootCoreKit({id: 'fake-native-region', text: 'Hello from conciv', nativePageDir: nativeDistDir})
}, 60_000)

afterAll(async () => {
  await browser.close()
  await kit.cleanup()
})

async function openMascotNative(): Promise<Page> {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}})
  await page.addInitScript(() => {
    const w = window as unknown as {__p2n: unknown[]; webkit: unknown}
    w.__p2n = []
    w.webkit = {messageHandlers: {concivBridge: {postMessage: (message: unknown) => w.__p2n.push(message)}}}
  })
  await page.goto(`${kit.base}/native?launcher=mascot`, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => typeof (window as unknown as {__concivNative?: unknown}).__concivNative === 'object')
  return page
}

const toggles = (page: Page): Promise<Toggle[]> =>
  page.evaluate(() =>
    (window as unknown as {__p2n: Toggle[]}).__p2n.filter((message) => message.type === 'host.panelToggled'),
  )

function callNative(page: Page, method: string, arg: Record<string, unknown>): Promise<void> {
  return page.evaluate(
    ([m, a]) => (window as unknown as {__concivNative: Record<string, (x: unknown) => void>}).__concivNative[m]?.(a),
    [method, arg] as const,
  )
}

const composerBox = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})

const closedRects = (all: Toggle[]): Rect[] =>
  all.flatMap((toggle) => (toggle.open === false && toggle.mascotRect ? [toggle.mascotRect] : []))

async function openFromHost(page: Page): Promise<void> {
  await callNative(page, 'open', {v: 1, seq: 1})
  await expect.poll(() => composerBox(page).isVisible(), {timeout: 30_000}).toBe(true)
}

describe('native live region reporting', () => {
  it('reports the mascot rect on a fresh closed mount so tap-to-open stays live', async () => {
    const page = await openMascotNative()
    await page.setViewportSize({width: 1200, height: 860})
    await expect
      .poll(
        () => toggles(page).then((all) => all.some((toggle) => toggle.open === false && Boolean(toggle.mascotRect))),
        {
          timeout: 30_000,
        },
      )
      .toBe(true)
    const closed = (await toggles(page)).findLast((toggle) => toggle.open === false && Boolean(toggle.mascotRect))
    expect(closed?.mascotRect?.width).toBeGreaterThan(0)
    expect(closed?.mascotRect?.height).toBeGreaterThan(0)
    await page.close()
  })

  it('re-reports the mascot rect when the launcher moves and settles on a stable value', async () => {
    const page = await openMascotNative()
    await page.setViewportSize({width: 1200, height: 860})
    await expect.poll(() => toggles(page).then((all) => closedRects(all).length > 0), {timeout: 30_000}).toBe(true)
    const beforeMove = (await toggles(page)).length

    await page.setViewportSize({width: 760, height: 640})
    await expect
      .poll(() => toggles(page).then((all) => closedRects(all.slice(beforeMove)).length > 0), {timeout: 30_000})
      .toBe(true)

    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await new Promise((resolve) => setTimeout(resolve, 400))

    const first = closedRects(await toggles(page)).at(-1)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const second = closedRects(await toggles(page)).at(-1)
    expect(second).toEqual(first)
    expect(second?.width).toBeGreaterThan(0)
    expect(second?.height).toBeGreaterThan(0)
    await page.close()
  })

  it('never reports closed mascot-region state once the panel is open', async () => {
    const page = await openMascotNative()
    await expect.poll(() => toggles(page).then((all) => all.length), {timeout: 30_000}).toBeGreaterThan(0)

    await openFromHost(page)
    await expect
      .poll(() => toggles(page).then((all) => all.some((toggle) => toggle.open === true)), {timeout: 30_000})
      .toBe(true)

    const openEvent = (await toggles(page)).find((toggle) => toggle.open === true)
    expect(openEvent?.mascotRect ?? null).toBeNull()

    const settled = (await toggles(page)).length
    for (const size of [
      {width: 900, height: 800},
      {width: 1100, height: 700},
      {width: 1280, height: 900},
    ]) {
      await page.setViewportSize(size)
    }
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await new Promise((resolve) => setTimeout(resolve, 400))

    const fresh = (await toggles(page)).slice(settled)
    expect(fresh.some((toggle) => toggle.open === false)).toBe(false)
    expect(fresh.some((toggle) => Boolean(toggle.mascotRect))).toBe(false)
    await page.close()
  })

  it('reports open, not a closed mascot rect, once a session is opened from the host', async () => {
    const page = await openMascotNative()
    await expect.poll(() => toggles(page).then((all) => all.length), {timeout: 30_000}).toBeGreaterThan(0)

    await openFromHost(page)
    await expect.poll(() => toggles(page).then((all) => all.at(-1)?.open === true), {timeout: 30_000}).toBe(true)

    const latest = (await toggles(page)).at(-1)
    expect(latest?.open).toBe(true)
    expect(latest?.mascotRect ?? null).toBeNull()
    await page.close()
  })
})
