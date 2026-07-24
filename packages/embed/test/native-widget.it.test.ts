import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'

const nativeDistDir = fileURLToPath(new URL('../dist/', import.meta.url))

const IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

const NEUTRAL_GRAB = {
  text: 'Payroll Deposit',
  preview: {kind: 'image', dataUrl: IMAGE_DATA_URL, width: 361, height: 72},
  rect: {x: 16, y: 232, width: 361, height: 72},
  source: {componentName: 'PaymentCardCell', filePath: '', lineNumber: null},
  subtree: {
    class: 'PaymentCardCell',
    a11yId: 'PaymentsScreen/payrollRow',
    text: 'Payroll Deposit',
    rect: {x: 16, y: 232, width: 361, height: 72},
    children: [
      {
        class: 'UILabel',
        a11yId: null,
        text: 'Payroll Deposit',
        rect: {x: 28, y: 240, width: 180, height: 20},
        children: [],
      },
    ],
  },
}

let browser: Browser
let kit: CoreKit

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootCoreKit({id: 'fake-native', text: 'Hello from conciv', nativePageDir: nativeDistDir})
}, 60_000)

afterAll(async () => {
  await browser.close()
  await kit.cleanup()
})

type P2n = {type: string; requestId?: string}

async function openNative(): Promise<Page> {
  const page = await browser.newPage()
  await page.addInitScript(() => {
    const w = window as unknown as {__p2n: unknown[]; __rebinds: unknown[]; webkit: unknown}
    w.__p2n = []
    w.__rebinds = []
    w.webkit = {messageHandlers: {concivBridge: {postMessage: (message: unknown) => w.__p2n.push(message)}}}
    window.addEventListener('conciv:rebind', (event) => w.__rebinds.push((event as CustomEvent).detail))
  })
  await page.goto(`${kit.base}/native`, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => typeof (window as unknown as {__concivNative?: unknown}).__concivNative === 'object')
  return page
}

const outbound = (page: Page): Promise<P2n[]> => page.evaluate(() => (window as unknown as {__p2n: P2n[]}).__p2n)

const countType = (messages: P2n[], type: string): number => messages.filter((message) => message.type === type).length

function callNative(page: Page, method: string, arg: Record<string, unknown>): Promise<void> {
  return page.evaluate(
    ([m, a]) => (window as unknown as {__concivNative: Record<string, (x: unknown) => void>}).__concivNative[m]?.(a),
    [method, arg] as const,
  )
}

const composerBox = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})
const grabButton = (page: Page) => page.getByRole('button', {name: 'Select an element from the page'})

describe('native widget bridge', () => {
  it('installs the native bridge, re-posts readiness, and settles after the first acked call and handshake', async () => {
    const page = await openNative()
    await expect
      .poll(() => outbound(page).then((m) => countType(m, 'bridge.ready')), {timeout: 5000})
      .toBeGreaterThan(1)
    await expect
      .poll(() => outbound(page).then((m) => countType(m, 'handshake.hello')), {timeout: 5000})
      .toBeGreaterThan(1)

    await callNative(page, 'grabCapability', {v: 1, seq: 1, grabbable: true})
    await callNative(page, 'handshake', {v: 1, seq: 2, apiBase: kit.base, token: null})

    await new Promise((resolve) => setTimeout(resolve, 1200))
    const settled = await outbound(page)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const later = await outbound(page)
    expect(countType(later, 'bridge.ready')).toBe(countType(settled, 'bridge.ready'))
    expect(countType(later, 'handshake.hello')).toBe(countType(settled, 'handshake.hello'))
    await page.close()
  })

  it('opens the panel on native open and is idempotent, and closes on native close', async () => {
    const page = await openNative()
    await callNative(page, 'open', {v: 1, seq: 1})
    await callNative(page, 'open', {v: 1, seq: 2})
    await expect.poll(() => composerBox(page).count(), {timeout: 30_000}).toBe(1)
    expect(await composerBox(page).isVisible()).toBe(true)
    await callNative(page, 'close', {v: 1, seq: 3})
    await expect.poll(() => composerBox(page).isVisible(), {timeout: 30_000}).toBe(false)
    await page.close()
  })

  it('drives the native grab provider: pick posts a requestId and a matching image grabResult stages the preview', async () => {
    const page = await openNative()
    const rpcBodies: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/rpc/')) rpcBodies.push(request.postData() ?? '')
    })
    await callNative(page, 'open', {v: 1, seq: 1})
    await expect.poll(() => composerBox(page).isVisible(), {timeout: 30_000}).toBe(true)

    await grabButton(page).click()
    await expect.poll(() => outbound(page).then((m) => countType(m, 'grab.pick')), {timeout: 30_000}).toBe(1)
    const pick = (await outbound(page)).find((message) => message.type === 'grab.pick')
    expect(pick?.requestId).toBeTruthy()

    await callNative(page, 'grabResult', {v: 1, seq: 2, requestId: pick?.requestId, grab: NEUTRAL_GRAB})
    await expect.poll(() => page.locator(`img[src="${IMAGE_DATA_URL}"]`).count(), {timeout: 30_000}).toBe(1)
    await expect
      .poll(() => rpcBodies.some((body) => body.includes('[view]') && body.includes('PaymentCardCell')), {
        timeout: 30_000,
      })
      .toBe(true)
    await page.close()
  })

  it('ignores a grabResult whose requestId does not match the pending pick', async () => {
    const page = await openNative()
    await callNative(page, 'open', {v: 1, seq: 1})
    await expect.poll(() => composerBox(page).isVisible(), {timeout: 30_000}).toBe(true)
    await grabButton(page).click()
    await expect.poll(() => outbound(page).then((m) => countType(m, 'grab.pick')), {timeout: 30_000}).toBe(1)

    await callNative(page, 'grabResult', {v: 1, seq: 2, requestId: 'not-the-pending-one', grab: NEUTRAL_GRAB})
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(await page.locator(`img[src="${IMAGE_DATA_URL}"]`).count()).toBe(0)
    await page.close()
  })

  it('surfaces a visible error when native reports an incompatible bridge version', async () => {
    const page = await openNative()
    await callNative(page, 'bridgeIncompatible', {v: 1, seq: 1, nativeMinV: 2, nativeMaxV: 3})
    await expect
      .poll(() => page.getByText('Update the conciv widget', {exact: false}).isVisible(), {timeout: 30_000})
      .toBe(true)
    await page.close()
  })

  it('dispatches conciv:rebind when a handshake reports a different same-core base', async () => {
    const page = await openNative()
    await callNative(page, 'handshake', {v: 1, seq: 1, apiBase: 'http://127.0.0.1:1/moved', token: null})
    await expect
      .poll(() => page.evaluate(() => (window as unknown as {__rebinds: {apiBase?: string}[]}).__rebinds), {
        timeout: 30_000,
      })
      .toEqual([{apiBase: 'http://127.0.0.1:1/moved'}])
    await page.close()
  })
})
