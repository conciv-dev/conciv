import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import type {PageToNativeMessage} from '@conciv/extension-ios/bridge'
import {captureNativePosts, installNativeStub} from './helpers/native-bridge.js'

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

type Mascot = {page: Page; toggles: PanelToggled[]; notify: (toggle: PanelToggled) => void}

function isToggle(message: PageToNativeMessage): message is PanelToggled {
  return message.type === 'host.panelToggled'
}

async function openMascotNative(): Promise<Mascot> {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}})
  const mascot: Mascot = {page, toggles: [], notify: () => {}}
  const bridge = await captureNativePosts(page)
  bridge.notify = (message) => {
    if (!isToggle(message)) return
    mascot.toggles.push(message)
    mascot.notify(message)
  }
  await installNativeStub(page)
  await page.goto(`${kit.base}/native?launcher=mascot`, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => typeof window.__concivNative === 'object')
  return mascot
}

function callNative(page: Page, method: NativeMethod, arg: Record<string, unknown>): Promise<void> {
  return page.evaluate((call) => window.__concivNative?.[call.method]?.(call.arg), {method, arg})
}

const composerBox = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})

const closedRects = (all: PanelToggled[]): Rect[] =>
  all.flatMap((toggle) => (toggle.open === false && toggle.mascotRect ? [toggle.mascotRect] : []))

async function openFromHost(page: Page): Promise<void> {
  await callNative(page, 'open', {v: 1, seq: 1})
  await expectLocator(composerBox(page)).toBeVisible({timeout: 30_000})
}

describe('native live region reporting', () => {
  it('reports the mascot rect on a fresh closed mount so tap-to-open stays live', async () => {
    const mascot = await openMascotNative()
    const measured = Promise.withResolvers<PanelToggled>()
    mascot.notify = (toggle) => {
      if (toggle.open === false && toggle.mascotRect) measured.resolve(toggle)
    }
    await mascot.page.setViewportSize({width: 1200, height: 860})
    const closed = await measured.promise
    expect(closed.mascotRect?.width).toBeGreaterThan(0)
    expect(closed.mascotRect?.height).toBeGreaterThan(0)
    await mascot.page.close()
  })

  it('re-reports the mascot rect when the launcher moves and settles on a stable value', async () => {
    const mascot = await openMascotNative()
    const placed = Promise.withResolvers<PanelToggled>()
    mascot.notify = (toggle) => {
      if (toggle.open === false && toggle.mascotRect) placed.resolve(toggle)
    }
    await mascot.page.setViewportSize({width: 1200, height: 860})
    await placed.promise
    const beforeMove = mascot.toggles.length

    const moved = Promise.withResolvers<PanelToggled>()
    mascot.notify = (toggle) => {
      if (toggle.open === false && toggle.mascotRect) moved.resolve(toggle)
    }
    await mascot.page.setViewportSize({width: 760, height: 640})
    await moved.promise
    expect(closedRects(mascot.toggles.slice(beforeMove))).not.toHaveLength(0)

    await mascot.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await new Promise((resolve) => setTimeout(resolve, 400))

    const first = closedRects(mascot.toggles).at(-1)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const second = closedRects(mascot.toggles).at(-1)
    expect(second).toEqual(first)
    expect(second?.width).toBeGreaterThan(0)
    expect(second?.height).toBeGreaterThan(0)
    await mascot.page.close()
  })

  it('never reports closed mascot-region state once the panel is open', async () => {
    const mascot = await openMascotNative()
    const opened = Promise.withResolvers<PanelToggled>()
    mascot.notify = (toggle) => {
      if (toggle.open === true) opened.resolve(toggle)
    }
    await openFromHost(mascot.page)
    const openEvent = await opened.promise
    expect(openEvent.mascotRect ?? null).toBeNull()

    const settled = mascot.toggles.length
    for (const size of [
      {width: 900, height: 800},
      {width: 1100, height: 700},
      {width: 1280, height: 900},
    ]) {
      await mascot.page.setViewportSize(size)
    }
    await mascot.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await new Promise((resolve) => setTimeout(resolve, 400))

    const fresh = mascot.toggles.slice(settled)
    expect(fresh.some((toggle) => toggle.open === false)).toBe(false)
    expect(fresh.some((toggle) => Boolean(toggle.mascotRect))).toBe(false)
    await mascot.page.close()
  })

  it('reports open, not a closed mascot rect, once a session is opened from the host', async () => {
    const mascot = await openMascotNative()
    const opened = Promise.withResolvers<PanelToggled>()
    mascot.notify = (toggle) => {
      if (toggle.open === true) opened.resolve(toggle)
    }
    await openFromHost(mascot.page)
    const latest = await opened.promise
    expect(latest.open).toBe(true)
    expect(latest.mascotRect ?? null).toBeNull()
    expect(mascot.toggles.at(-1)).toEqual(latest)
    await mascot.page.close()
  })
})
