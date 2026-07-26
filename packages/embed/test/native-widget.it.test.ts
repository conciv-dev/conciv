import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {PageToNativeSchema, type PageToNativeMessage} from '@conciv/extension-ios/bridge'

type NativeMethod = keyof NonNullable<Window['__concivNative']>

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

async function openNative(): Promise<Page> {
  const page = await browser.newPage()
  await page.addInitScript(() => {
    window.__p2n = []
    window.__rebinds = []
    window.webkit = {messageHandlers: {concivBridge: {postMessage: (message) => window.__p2n.push(message)}}}
    window.addEventListener('conciv:rebind', (event) => window.__rebinds.push(event.detail))
  })
  await page.goto(`${kit.base}/native`, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => typeof window.__concivNative === 'object')
  return page
}

const outbound = async (page: Page): Promise<PageToNativeMessage[]> => {
  const raw = await page.evaluate(() => window.__p2n)
  return raw.flatMap((entry) => {
    const parsed = PageToNativeSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

const countType = (messages: PageToNativeMessage[], type: PageToNativeMessage['type']): number =>
  messages.filter((message) => message.type === type).length

const findByType = <Type extends PageToNativeMessage['type']>(
  messages: PageToNativeMessage[],
  type: Type,
): Extract<PageToNativeMessage, {type: Type}> | undefined =>
  messages.find((message): message is Extract<PageToNativeMessage, {type: Type}> => message.type === type)

function callNative(page: Page, method: NativeMethod, arg: Record<string, unknown>): Promise<void> {
  return page.evaluate((call) => window.__concivNative?.[call.method]?.(call.arg), {method, arg})
}

const composerBox = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})
const grabButton = (page: Page) => page.getByRole('button', {name: 'Select an element from the page'})
const panel = (page: Page) => page.getByRole('dialog', {name: 'conciv chat agent'})
const grabPreview = (page: Page) => panel(page).locator('img')

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

    await callNative(page, 'grabCapability', {v: 1, seq: 2, grabbable: true})
    await grabButton(page).click()
    await expect.poll(() => outbound(page).then((m) => countType(m, 'grab.pick')), {timeout: 30_000}).toBe(1)
    const pick = findByType(await outbound(page), 'grab.pick')
    expect(pick?.requestId).toBeTruthy()

    await callNative(page, 'grabResult', {v: 1, seq: 3, requestId: pick?.requestId, grab: NEUTRAL_GRAB})
    await expect.poll(() => panel(page).getByText('PaymentCardCell').isVisible(), {timeout: 30_000}).toBe(true)
    expect(await grabPreview(page).getAttribute('src')).toBe(IMAGE_DATA_URL)
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
    await callNative(page, 'grabCapability', {v: 1, seq: 2, grabbable: true})
    await grabButton(page).click()
    await expect.poll(() => outbound(page).then((m) => countType(m, 'grab.pick')), {timeout: 30_000}).toBe(1)

    await callNative(page, 'grabResult', {v: 1, seq: 3, requestId: 'not-the-pending-one', grab: NEUTRAL_GRAB})
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(await panel(page).getByText('PaymentCardCell').count()).toBe(0)
    expect(await grabPreview(page).count()).toBe(0)
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
      .poll(() => page.evaluate(() => window.__rebinds), {
        timeout: 30_000,
      })
      .toEqual([{apiBase: 'http://127.0.0.1:1/moved'}])
    await page.close()
  })
})
