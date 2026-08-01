import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {until} from '@conciv/harness-testkit/until'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {PageToNativeSchema, type PageToNativeMessage} from '@conciv/extension-ios/bridge'

const nativeDistDir = fileURLToPath(new URL('../dist/', import.meta.url))

type NativeMethod = keyof NonNullable<Window['__concivNative']>
type PanelToggled = Extract<PageToNativeMessage, {type: 'host.panelToggled'}>
type Rect = NonNullable<PanelToggled['mascotRect']>

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
    window.__p2n = []
    window.webkit = {messageHandlers: {concivBridge: {postMessage: (message) => window.__p2n.push(message)}}}
  })
  await page.goto(`${kit.base}/native?launcher=mascot`, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => typeof window.__concivNative === 'object')
  return page
}

const toggles = async (page: Page): Promise<PanelToggled[]> => {
  const raw = await page.evaluate(() => window.__p2n)
  return raw.flatMap((entry) => {
    const parsed = PageToNativeSchema.safeParse(entry)
    return parsed.success && parsed.data.type === 'host.panelToggled' ? [parsed.data] : []
  })
}

function callNative(page: Page, method: NativeMethod, arg: Record<string, unknown>): Promise<void> {
  return page.evaluate((call) => window.__concivNative?.[call.method]?.(call.arg), {method, arg})
}

const composerBox = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})

const untilReported = (probe: () => Promise<boolean>): Promise<void> =>
  until(probe, {hangGuardMs: 30_000, intervalMs: 100})

const closedRects = (all: PanelToggled[]): Rect[] =>
  all.flatMap((toggle) => (toggle.open === false && toggle.mascotRect ? [toggle.mascotRect] : []))

async function openFromHost(page: Page): Promise<void> {
  await callNative(page, 'open', {v: 1, seq: 1})
  await expectLocator(composerBox(page)).toBeVisible({timeout: 30_000})
}

describe('native live region reporting', () => {
  it('reports the mascot rect on a fresh closed mount so tap-to-open stays live', async () => {
    const page = await openMascotNative()
    await page.setViewportSize({width: 1200, height: 860})
    await untilReported(async () =>
      (await toggles(page)).some((toggle) => toggle.open === false && Boolean(toggle.mascotRect)),
    )
    const closed = (await toggles(page)).findLast((toggle) => toggle.open === false && Boolean(toggle.mascotRect))
    expect(closed?.mascotRect?.width).toBeGreaterThan(0)
    expect(closed?.mascotRect?.height).toBeGreaterThan(0)
    await page.close()
  })

  it('re-reports the mascot rect when the launcher moves and settles on a stable value', async () => {
    const page = await openMascotNative()
    await page.setViewportSize({width: 1200, height: 860})
    await untilReported(async () => closedRects(await toggles(page)).length > 0)
    const beforeMove = (await toggles(page)).length

    await page.setViewportSize({width: 760, height: 640})
    await untilReported(async () => closedRects((await toggles(page)).slice(beforeMove)).length > 0)

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
    await untilReported(async () => (await toggles(page)).length > 0)

    await openFromHost(page)
    await untilReported(async () => (await toggles(page)).some((toggle) => toggle.open === true))

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
    await untilReported(async () => (await toggles(page)).length > 0)

    await openFromHost(page)
    await untilReported(async () => (await toggles(page)).at(-1)?.open === true)

    const latest = (await toggles(page)).at(-1)
    expect(latest?.open).toBe(true)
    expect(latest?.mascotRect ?? null).toBeNull()
    await page.close()
  })
})
