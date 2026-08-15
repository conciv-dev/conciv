import {expect, test, type Page, type WebSocket as PageWebSocket} from '@playwright/test'
import {watchRpcWire} from '@conciv/extension-testkit/rpc-wire'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {handleHostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {mountHandle, remountHandle, unmountHandle} from './helpers/handle.js'
import {chatBox, openChatPanel, sendChatMessage} from './helpers/chat.js'
import {setNavigation} from './helpers/navigation.js'

const ASSISTANT_TEXT = 'Hello from conciv'

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  host = await serveHost(() => handleHostPage())
})

test.afterAll(async () => {
  await host.close()
  await kit.cleanup()
})

async function openPage(page: Page): Promise<Page> {
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  return page
}

const fab = (page: Page) => page.getByRole('button', {name: 'Open conciv chat'})

const SOCKET_CLOSE_TIMEOUT_MS = 5_000

function closedWithin(socket: PageWebSocket, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    socket.on('close', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

function rpcSocket(page: Page): Promise<PageWebSocket> {
  return page.waitForEvent('websocket', {
    predicate: (socket) => socket.url().includes('/rpc-ws'),
    timeout: 30_000,
  })
}

test.describe('createConciv lifecycle', () => {
  test('mounts, unmounts, and remounts the widget', async ({page}) => {
    test.setTimeout(120_000)
    await openPage(page)
    await mountHandle(page, kit.base)
    await expect(fab(page)).toBeVisible({timeout: 30_000})
    await unmountHandle(page)
    await expect(fab(page)).toHaveCount(0, {timeout: 30_000})
    await remountHandle(page)
    await expect(fab(page)).toBeVisible({timeout: 30_000})
  })

  test('threads the mounted api base to extension surfaces when the host page has no pw-api-base meta', async ({
    page,
  }) => {
    await openPage(page)
    await mountHandle(page, kit.base)
    const probe = page.getByRole('status', {name: 'host api base probe'})
    await expect(probe).toHaveText(kit.base, {timeout: 30_000})
  })

  test('a second mount on an already-mounted handle is a no-op', async ({page}) => {
    await openPage(page)
    await page.evaluate((base) => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      const handle = window.ConcivHandle.makeHandle(base)
      void handle.mount(el)
      void handle.mount(el)
    }, kit.base)
    await expect(fab(page)).toHaveCount(1, {timeout: 30_000})
    expect(await fab(page).count()).toBe(1)
  })

  test('unmount during mount leaves nothing behind', async ({page}) => {
    await openPage(page)
    await page.evaluate((base) => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      const handle = window.ConcivHandle.makeHandle(base)
      void handle.mount(el)
      handle.unmount()
    }, kit.base)
    await expect(fab(page)).toHaveCount(0, {timeout: 30_000})
    expect(await page.evaluate(() => document.querySelector('[data-conciv-root]') === null)).toBe(true)
  })

  test('restores the host __TSR_ROUTER__ global on unmount', async ({page}) => {
    await openPage(page)
    await page.evaluate(() => {
      Reflect.set(window, '__TSR_ROUTER__', {hostSentinel: true})
    })
    await mountHandle(page, kit.base)
    await expect(fab(page)).toBeVisible({timeout: 30_000})
    await unmountHandle(page)
    const restored = await page.evaluate(() => {
      const value = Reflect.get(window, '__TSR_ROUTER__')
      return typeof value === 'object' && value !== null && 'hostSentinel' in value
    })
    expect(restored).toBe(true)
  })

  test('unmounts cleanly with an open panel and a completed turn', async ({page}) => {
    test.setTimeout(120_000)
    await openPage(page)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await mountHandle(page, kit.base)
    await fab(page).click()
    await expect(chatBox(page)).toBeVisible({timeout: 30_000})
    await chatBox(page).fill('hello')
    await chatBox(page).press('Enter')
    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await unmountHandle(page)
    await expect(fab(page)).toHaveCount(0, {timeout: 30_000})
    expect(pageErrors).toEqual([])
  })

  test('closes the tab rpc websocket on unmount and dials a fresh one on remount', async ({page}) => {
    test.setTimeout(180_000)
    expect(await setNavigation(kit, [{href: '/'}])).toBe(true)
    const wire = watchRpcWire(page)
    await openPage(page)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    const socketOpened = rpcSocket(page)
    await mountHandle(page, kit.base)
    const socket = await socketOpened
    await openChatPanel(page)
    await sendChatMessage(page, 'before the unmount')
    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

    const closed = closedWithin(socket, SOCKET_CLOSE_TIMEOUT_MS)
    await unmountHandle(page)
    await expect(fab(page)).toHaveCount(0, {timeout: 30_000})
    expect(await closed).toBe(true)

    await remountHandle(page)
    await expect(chatBox(page)).toBeVisible({timeout: 30_000})
    const remounted = wire.nextChatSend()
    await sendChatMessage(page, 'after the remount')
    expect((await remounted).transport).toBe('websocket')
    expect(pageErrors).toEqual([])
  })
})
