import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {handleHostPage, serveHost} from './helpers/host.js'

const ASSISTANT_TEXT = 'Hello from conciv'

type Handle = {mount: (el: HTMLElement) => Promise<void>; unmount: () => void}

declare global {
  interface Window {
    ConcivHandle: {makeHandle: (apiBase: string) => Handle}
    __handle: Handle
    __el: HTMLElement
    __TSR_ROUTER__?: unknown
  }
}

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

async function mountHandle(page: Page, apiBase: string): Promise<void> {
  await page.evaluate((base) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    window.__el = el
    window.__handle = window.ConcivHandle.makeHandle(base)
    void window.__handle.mount(el)
  }, apiBase)
}

describe('createConciv lifecycle', () => {
  it('mounts, unmounts, and remounts the widget', async () => {
    const page = await openPage()
    await mountHandle(page, kit.base)
    await expect.poll(() => fab(page).isVisible(), {timeout: 15_000}).toBe(true)
    await page.evaluate(() => window.__handle.unmount())
    await expect.poll(() => fab(page).count(), {timeout: 5_000}).toBe(0)
    await page.evaluate(() => void window.__handle.mount(window.__el))
    await expect.poll(() => fab(page).isVisible(), {timeout: 15_000}).toBe(true)
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
    await expect.poll(() => fab(page).count(), {timeout: 15_000}).toBe(1)
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
    await expect.poll(() => fab(page).count(), {timeout: 5_000}).toBe(0)
    expect(await page.evaluate(() => document.querySelector('[data-conciv-root]') === null)).toBe(true)
    await page.close()
  })

  it('restores the host __TSR_ROUTER__ global on unmount', async () => {
    const page = await openPage()
    await page.evaluate(() => {
      window.__TSR_ROUTER__ = {hostSentinel: true}
    })
    await mountHandle(page, kit.base)
    await expect.poll(() => fab(page).isVisible(), {timeout: 15_000}).toBe(true)
    await page.evaluate(() => window.__handle.unmount())
    const restored = await page.evaluate(() => {
      const value = window.__TSR_ROUTER__
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
    const box = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.poll(() => box.isVisible(), {timeout: 15_000}).toBe(true)
    await box.fill('hello')
    await box.press('Enter')
    await expect.poll(() => page.getByText(ASSISTANT_TEXT).first().isVisible(), {timeout: 20_000}).toBe(true)
    await page.evaluate(() => window.__handle.unmount())
    await expect.poll(() => fab(page).count(), {timeout: 5_000}).toBe(0)
    expect(pageErrors).toEqual([])
    await page.close()
  })
})
