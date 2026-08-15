import {Buffer} from 'node:buffer'
import {fileURLToPath} from 'node:url'
import {expect, test, type Page} from '@playwright/test'
import type {DraftRow} from '@conciv/contract'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import type {PageToNativeMessage} from '@conciv/extension-ios/bridge'
import {GRAB_MIME, parseGrabPayload, type GrabPayload} from '@conciv/grab/grab-attachment'
import {captureNativePosts, installNativeStub, type NativeBridge} from './helpers/native-bridge.js'
import {untilPanelDraft} from './helpers/drafts.js'

type NativeMethod = keyof NonNullable<Window['__concivNative']>

const nativeDistDir = fileURLToPath(new URL('../../dist/', import.meta.url))

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

function grabPayloadOf(draft: DraftRow): GrabPayload | null {
  const attachment = draft.attachments.find((candidate) => candidate.contentType === GRAB_MIME)
  if (!attachment) return null
  return parseGrabPayload(Buffer.from(attachment.data, 'base64').toString('utf8'))
}

let kit: CoreKit

test.beforeAll(async () => {
  kit = await bootCoreKit({id: 'fake-native', text: 'Hello from conciv', nativePageDir: nativeDistDir})
})

test.afterAll(async () => {
  await kit.cleanup()
})

type Native = {
  page: Page
  bridge: NativeBridge
  rebinds: {apiBase?: string}[]
  onRebind: () => void
}

async function openNative(page: Page): Promise<Native> {
  const bridge = await captureNativePosts(page)
  const native: Native = {page, bridge, rebinds: [], onRebind: () => {}}
  await page.exposeFunction('concivNativeRebind', (detail: {apiBase?: string}) => {
    native.rebinds.push(detail)
    native.onRebind()
  })
  await installNativeStub(page)
  await page.addInitScript(() => {
    window.addEventListener('conciv:rebind', (event) => void window.concivNativeRebind(event.detail))
  })
  await page.goto(`${kit.base}/native`, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => typeof window.__concivNative === 'object')
  return native
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

test.describe('native widget bridge', () => {
  test('installs the native bridge, re-posts readiness, and settles after the first acked call and handshake', async ({
    page: fixturePage,
  }) => {
    const {page, bridge} = await openNative(fixturePage)
    const reposted = Promise.withResolvers<PageToNativeMessage[]>()
    bridge.notify = () => {
      if (countType(bridge.posted, 'bridge.ready') > 1 && countType(bridge.posted, 'handshake.hello') > 1) {
        reposted.resolve(bridge.posted)
      }
    }
    expect(countType(await reposted.promise, 'bridge.ready')).toBeGreaterThan(1)

    await callNative(page, 'grabCapability', {v: 1, seq: 1, grabbable: true})
    await callNative(page, 'handshake', {v: 1, seq: 2, apiBase: kit.base, token: null})

    await new Promise((resolve) => setTimeout(resolve, 1200))
    const settled = [...bridge.posted]
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const later = bridge.posted
    expect(countType(later, 'bridge.ready')).toBe(countType(settled, 'bridge.ready'))
    expect(countType(later, 'handshake.hello')).toBe(countType(settled, 'handshake.hello'))
  })

  test('opens the panel on native open and is idempotent, and closes on native close', async ({page: fixturePage}) => {
    const {page} = await openNative(fixturePage)
    await callNative(page, 'open', {v: 1, seq: 1})
    await callNative(page, 'open', {v: 1, seq: 2})
    await expect(composerBox(page)).toHaveCount(1, {timeout: 30_000})
    await expect(composerBox(page)).toBeVisible()
    await callNative(page, 'close', {v: 1, seq: 3})
    await expect(composerBox(page)).toBeHidden({timeout: 30_000})
  })

  test('drives the native grab provider: pick posts a requestId and a matching image grabResult stages the preview', async ({
    page: fixturePage,
  }) => {
    test.setTimeout(120_000)
    const {page, bridge} = await openNative(fixturePage)
    const picked = Promise.withResolvers<PageToNativeMessage>()
    bridge.notify = (message) => {
      if (message.type === 'grab.pick') picked.resolve(message)
    }
    await callNative(page, 'open', {v: 1, seq: 1})
    await expect(composerBox(page)).toBeVisible({timeout: 30_000})

    await callNative(page, 'grabCapability', {v: 1, seq: 2, grabbable: true})
    await grabButton(page).click()
    await picked.promise
    const pick = findByType(bridge.posted, 'grab.pick')
    expect(pick?.requestId).toBeTruthy()
    expect(countType(bridge.posted, 'grab.pick')).toBe(1)

    await callNative(page, 'grabResult', {v: 1, seq: 3, requestId: pick?.requestId, grab: NEUTRAL_GRAB})
    await expect(panel(page).getByText('PaymentCardCell')).toBeVisible({timeout: 30_000})
    await expect(grabPreview(page)).toHaveAttribute('src', IMAGE_DATA_URL)
    await untilPanelDraft(kit, (draft) => {
      const payload = grabPayloadOf(draft)
      return payload !== null && payload.text.includes('[view]') && payload.text.includes('PaymentCardCell')
    })
  })

  test('ignores a grabResult whose requestId does not match the pending pick', async ({page: fixturePage}) => {
    const {page, bridge} = await openNative(fixturePage)
    const picked = Promise.withResolvers<PageToNativeMessage>()
    bridge.notify = (message) => {
      if (message.type === 'grab.pick') picked.resolve(message)
    }
    await callNative(page, 'open', {v: 1, seq: 1})
    await expect(composerBox(page)).toBeVisible({timeout: 30_000})
    await callNative(page, 'grabCapability', {v: 1, seq: 2, grabbable: true})
    await grabButton(page).click()
    await picked.promise
    expect(countType(bridge.posted, 'grab.pick')).toBe(1)

    await callNative(page, 'grabResult', {v: 1, seq: 3, requestId: 'not-the-pending-one', grab: NEUTRAL_GRAB})
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(await panel(page).getByText('PaymentCardCell').count()).toBe(0)
    expect(await grabPreview(page).count()).toBe(0)
  })

  test('surfaces a visible error when native reports an incompatible bridge version', async ({page: fixturePage}) => {
    const {page} = await openNative(fixturePage)
    await callNative(page, 'bridgeIncompatible', {v: 1, seq: 1, nativeMinV: 2, nativeMaxV: 3})
    await expect(page.getByText('Update the conciv widget', {exact: false})).toBeVisible({timeout: 30_000})
  })

  test('dispatches conciv:rebind when a handshake reports a different same-core base', async ({page: fixturePage}) => {
    const native = await openNative(fixturePage)
    const rebound = Promise.withResolvers<{apiBase?: string}[]>()
    native.onRebind = () => rebound.resolve(native.rebinds)
    await callNative(native.page, 'handshake', {v: 1, seq: 1, apiBase: 'http://127.0.0.1:1/moved', token: null})
    expect(await rebound.promise).toEqual([{apiBase: 'http://127.0.0.1:1/moved'}])
  })
})
