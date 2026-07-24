import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {handleHostPage, serveHost} from './helpers/host.js'
import {proxyTo, type ProxyCore} from './helpers/proxy.js'

const ASSISTANT_TEXT = 'Rebound reply'

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

async function mountHandle(page: Page, apiBase: string): Promise<void> {
  await page.evaluate((base) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    window.concivTestHandle = window.ConcivHandle.makeHandle(base)
    void window.concivTestHandle.mount(el)
  }, apiBase)
}

async function sendTurn(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
  await input.fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
}

async function panelSession(): Promise<string | null> {
  const state = await kit.rpc.navigation.get(undefined)
  const entry = state?.entries.find((row) => row.href.startsWith('/panel/'))
  if (!entry) return null
  return (entry.href.split('/')[2] ?? '').split('?')[0] ?? null
}

describe('handle.rebind survives same-core port drift', () => {
  let proxyA: ProxyCore
  let proxyB: ProxyCore

  beforeAll(async () => {
    proxyA = await proxyTo(kit.base)
    proxyB = await proxyTo(kit.base)
  })

  afterAll(async () => {
    await proxyB.close()
  })

  it('re-points rpc and SSE to the new port, keeps the panel open and the session', async () => {
    const page = await browser.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})

    await mountHandle(page, proxyA.base)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect
      .poll(() => page.getByRole('textbox', {name: 'Message the conciv agent'}).isVisible(), {timeout: 30_000})
      .toBe(true)

    await sendTurn(page, 'first message before the drift')
    await expect.poll(() => page.getByText(ASSISTANT_TEXT).count(), {timeout: 30_000}).toBe(1)
    await expect.poll(() => panelSession(), {timeout: 30_000}).not.toBeNull()
    const sessionBefore = await panelSession()

    const beforeB = proxyB.requestCount()
    await page.evaluate((base) => window.concivTestHandle.rebind(base), proxyB.base)
    await proxyA.close()

    await expect
      .poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 30_000})
      .toBe(true)
    await expect.poll(() => page.getByText(ASSISTANT_TEXT).count(), {timeout: 30_000}).toBe(0)
    await expect
      .poll(() => page.getByRole('textbox', {name: 'Message the conciv agent'}).isVisible(), {timeout: 30_000})
      .toBe(true)

    await sendTurn(page, 'second message after the drift')
    await expect.poll(() => page.getByText(ASSISTANT_TEXT).count(), {timeout: 30_000}).toBe(1)

    expect(proxyB.requestCount()).toBeGreaterThan(beforeB)
    expect(await panelSession()).toBe(sessionBefore)
    expect(sessionBefore).not.toBeNull()
    expect(pageErrors).toEqual([])
    await page.close()
  })
})
