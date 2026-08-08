import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page, type WebSocket as PageWebSocket} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {handleHostPage, serveHost} from './helpers/host.js'
import {mountHandle, remountHandle, unmountHandle} from './helpers/handle.js'
import {chatBox, openChatPanel, sendChatMessage} from './helpers/chat.js'
import {rpcObserverFor, setNavigation} from './helpers/navigation.js'

const ASSISTANT_TEXT = 'Hello from conciv'

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  host = await serveHost(() => handleHostPage())
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

async function openPage(): Promise<Page> {
  const page = await browser.newPage()
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

describe('createConciv lifecycle', () => {
  it('mounts, unmounts, and remounts the widget', async () => {
    const page = await openPage()
    await mountHandle(page, kit.base)
    await expectLocator(fab(page)).toBeVisible({timeout: 30_000})
    await unmountHandle(page)
    await expectLocator(fab(page)).toHaveCount(0, {timeout: 30_000})
    await remountHandle(page)
    await expectLocator(fab(page)).toBeVisible({timeout: 30_000})
    await page.close()
  })

  it('threads the mounted api base to extension surfaces when the host page has no pw-api-base meta', async () => {
    const page = await openPage()
    await mountHandle(page, kit.base)
    const probe = page.getByRole('status', {name: 'host api base probe'})
    await expectLocator(probe).toHaveText(kit.base, {timeout: 30_000})
    await page.close()
  })

  it('a second mount on an already-mounted handle is a no-op', async () => {
    const page = await openPage()
    await page.evaluate((base) => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      const handle = window.ConcivHandle.makeHandle(base)
      void handle.mount(el)
      void handle.mount(el)
    }, kit.base)
    await expectLocator(fab(page)).toHaveCount(1, {timeout: 30_000})
    expect(await fab(page).count()).toBe(1)
    await page.close()
  })

  it('unmount during mount leaves nothing behind', async () => {
    const page = await openPage()
    await page.evaluate((base) => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      const handle = window.ConcivHandle.makeHandle(base)
      void handle.mount(el)
      handle.unmount()
    }, kit.base)
    await expectLocator(fab(page)).toHaveCount(0, {timeout: 30_000})
    expect(await page.evaluate(() => document.querySelector('[data-conciv-root]') === null)).toBe(true)
    await page.close()
  })

  it('restores the host __TSR_ROUTER__ global on unmount', async () => {
    const page = await openPage()
    await page.evaluate(() => {
      Reflect.set(window, '__TSR_ROUTER__', {hostSentinel: true})
    })
    await mountHandle(page, kit.base)
    await expectLocator(fab(page)).toBeVisible({timeout: 30_000})
    await unmountHandle(page)
    const restored = await page.evaluate(() => {
      const value = Reflect.get(window, '__TSR_ROUTER__')
      return typeof value === 'object' && value !== null && 'hostSentinel' in value
    })
    expect(restored).toBe(true)
    await page.close()
  })

  it('unmounts cleanly with an open panel and a completed turn', async () => {
    const page = await openPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await mountHandle(page, kit.base)
    await fab(page).click()
    await expectLocator(chatBox(page)).toBeVisible({timeout: 30_000})
    await chatBox(page).fill('hello')
    await chatBox(page).press('Enter')
    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await unmountHandle(page)
    await expectLocator(fab(page)).toHaveCount(0, {timeout: 30_000})
    expect(pageErrors).toEqual([])
    await page.close()
  })

  it('closes the tab rpc websocket on unmount and dials a fresh one on remount', async () => {
    expect(await setNavigation(kit, [{href: '/'}])).toBe(true)
    const page = await openPage()
    const observer = rpcObserverFor(page)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    const socketOpened = rpcSocket(page)
    await mountHandle(page, kit.base)
    const socket = await socketOpened
    await openChatPanel(page)
    await sendChatMessage(page, 'before the unmount')
    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})

    const closed = closedWithin(socket, SOCKET_CLOSE_TIMEOUT_MS)
    await unmountHandle(page)
    await expectLocator(fab(page)).toHaveCount(0, {timeout: 30_000})
    expect(await closed).toBe(true)

    await remountHandle(page)
    await expectLocator(chatBox(page)).toBeVisible({timeout: 30_000})
    const mark = observer.mark()
    await sendChatMessage(page, 'after the remount')
    const remounted = await observer.completed({path: ['chat', 'send'], since: mark, timeout: 30_000})
    expect(remounted.transport).toBe('websocket')
    expect(pageErrors).toEqual([])
    await page.close()
  })
})
