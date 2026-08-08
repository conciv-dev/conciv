import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {handleHostPage, serveHost} from './helpers/host.js'
import {setNavigation, waitForNavigationWrite} from './helpers/navigation.js'
import {proxyTo, type ProxyCore} from './helpers/proxy.js'

const ASSISTANT_TEXT = 'Rebound reply'
const USER_TEXT = 'first message before the drift'

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

beforeEach(async () => {
  expect(await setNavigation(kit, [{href: '/'}])).toBe(true)
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

async function openPanelTabs(page: Page): Promise<void> {
  const opener = page.getByRole('button', {name: 'Open conciv chat'})
  await expectLocator(opener).toBeVisible({timeout: 30_000})
  await opener.click()
  await expectLocator(page.getByRole('tab', {name: 'Mount probe'})).toBeVisible({timeout: 30_000})
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
    await expectLocator(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})

    const apiBaseProbe = page.getByRole('status', {name: 'host api base probe'})
    await expectLocator(apiBaseProbe).toHaveText(proxyA.base, {timeout: 30_000})

    const routed = waitForNavigationWrite(page)
    await sendTurn(page, USER_TEXT)
    await expectLocator(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})
    await routed
    const sessionBefore = await panelSession()
    expect(sessionBefore).not.toBeNull()

    const beforeB = proxyB.requestCount()
    await page.evaluate((base) => window.concivTestHandle.rebind(base), proxyB.base)
    await proxyA.close()

    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await expectLocator(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})

    await expectLocator(apiBaseProbe).toHaveText(proxyB.base, {timeout: 30_000})

    await expectLocator(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    await expectLocator(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

    await sendTurn(page, 'second message after the drift')

    expect(proxyB.requestCount()).toBeGreaterThan(beforeB)
    expect(await panelSession()).toBe(sessionBefore)
    expect(sessionBefore).not.toBeNull()
    expect(pageErrors).toEqual([])
    await page.close()
  })
})

describe('handle.rebind remounts extension surfaces on the new core', () => {
  let proxyC: ProxyCore
  let proxyD: ProxyCore

  beforeAll(async () => {
    proxyC = await proxyTo(kit.base)
    proxyD = await proxyTo(kit.base)
  })

  afterAll(async () => {
    await proxyD.close()
  })

  it('rebuilds the global surface and the open extension view against the new base', async () => {
    const page = await browser.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})

    await mountHandle(page, proxyC.base)
    await openPanelTabs(page)

    const surfaceProbe = page.getByRole('status', {name: 'surface mount api base'})
    const viewProbe = page.getByRole('status', {name: 'view mount api base'})
    await expectLocator(surfaceProbe).toHaveText(proxyC.base, {timeout: 30_000})

    const probeTab = page.getByRole('tab', {name: 'Mount probe'})
    await probeTab.click()
    await expectLocator(viewProbe).toHaveText(proxyC.base, {timeout: 30_000})

    const beforeD = proxyD.requestCount()
    await page.evaluate((base) => window.concivTestHandle.rebind(base), proxyD.base)
    await proxyC.close()

    await expectLocator(surfaceProbe).toHaveText(proxyD.base, {timeout: 15_000})
    await expectLocator(viewProbe).toHaveText(proxyD.base, {timeout: 15_000})
    await expectLocator(probeTab).toHaveAttribute('aria-selected', 'true', {timeout: 15_000})
    expect(proxyD.requestCount()).toBeGreaterThan(beforeD)
    expect(pageErrors).toEqual([])
    await page.close()
  })
})
