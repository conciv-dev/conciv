import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {handleHostPage, serveHost} from './helpers/host.js'
import {rpcObserverFor} from '@conciv/extension-testkit/rpc-observer'
import {setNavigation, waitForNavigationWrite} from './helpers/navigation.js'
import {proxyTo, type ProxyCore} from './helpers/proxy.js'
import {mountHandle, rebindHandle} from './helpers/handle.js'
import {chatBox, openChatPanel, sendChatMessage} from './helpers/chat.js'

const ASSISTANT_TEXT = 'Rebound reply'
const USER_TEXT = 'first message before the drift'
const SECOND_USER_TEXT = 'second message after the drift'

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

function observedPage(page: Page): Page {
  rpcObserverFor(page)
  return page
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

  it('re-points rpc and SSE to the new port, keeps the panel open, the session, and delivers the next turn', async () => {
    const page = observedPage(await browser.newPage())
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})

    await mountHandle(page, proxyA.base)
    await openChatPanel(page)

    const apiBaseProbe = page.getByRole('status', {name: 'host api base probe'})
    await expectLocator(apiBaseProbe).toHaveText(proxyA.base, {timeout: 30_000})

    const routed = waitForNavigationWrite(page)
    await sendChatMessage(page, USER_TEXT)
    await expectLocator(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})
    await routed
    const sessionBefore = await panelSession()
    expect(sessionBefore).not.toBeNull()

    const beforeB = proxyB.trafficCount()
    await rebindHandle(page, proxyB.base)
    await proxyA.close()

    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await expectLocator(chatBox(page)).toBeVisible({timeout: 30_000})

    await expectLocator(apiBaseProbe).toHaveText(proxyB.base, {timeout: 30_000})

    await expectLocator(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    await expectLocator(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

    await sendChatMessage(page, SECOND_USER_TEXT)
    await expectLocator(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: 30_000})
    await expectLocator(page.getByText(SECOND_USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    await expectLocator(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})

    expect(proxyB.trafficCount()).toBeGreaterThan(beforeB)
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
    const page = observedPage(await browser.newPage())
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

    const beforeD = proxyD.trafficCount()
    await rebindHandle(page, proxyD.base)
    await proxyC.close()

    await expectLocator(surfaceProbe).toHaveText(proxyD.base, {timeout: 15_000})
    await expectLocator(viewProbe).toHaveText(proxyD.base, {timeout: 15_000})
    await expectLocator(probeTab).toHaveAttribute('aria-selected', 'true', {timeout: 15_000})
    expect(proxyD.trafficCount()).toBeGreaterThan(beforeD)
    expect(pageErrors).toEqual([])
    await page.close()
  })
})

describe('handle.rebind quiesces the old connection before tearing consumers down', () => {
  let proxyE: ProxyCore
  let proxyF: ProxyCore

  beforeAll(async () => {
    proxyE = await proxyTo(kit.base)
    proxyF = await proxyTo(kit.base)
  })

  afterAll(async () => {
    await proxyE.close()
    await proxyF.close()
  })

  it('writes nothing more to the old core once rebind is called', async () => {
    const page = observedPage(await browser.newPage())
    const framesSentPerSocket: number[] = []
    page.on('websocket', (socket) => {
      if (!socket.url().includes('/rpc-ws')) return
      const index = framesSentPerSocket.length
      framesSentPerSocket.push(0)
      socket.on('framesent', () => {
        framesSentPerSocket[index] = (framesSentPerSocket[index] ?? 0) + 1
      })
    })
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})

    await mountHandle(page, proxyE.base)
    await openChatPanel(page)

    const apiBaseProbe = page.getByRole('status', {name: 'host api base probe'})
    await expectLocator(apiBaseProbe).toHaveText(proxyE.base, {timeout: 30_000})

    const sentBeforeRebind = framesSentPerSocket[0] ?? 0
    await rebindHandle(page, proxyF.base)
    await expectLocator(apiBaseProbe).toHaveText(proxyF.base, {timeout: 30_000})

    expect(framesSentPerSocket[0]).toBe(sentBeforeRebind)
    await page.close()
  })
})

describe('handle.rebind to the base the widget is already on re-runs the transport probe', () => {
  let blockedCore: ProxyCore

  beforeAll(async () => {
    blockedCore = await proxyTo(kit.base, {blockUpgrades: true})
  })

  afterAll(async () => {
    await blockedCore.close()
  })

  it('rides the websocket after the blocked upgrade path opens up again', async () => {
    const page = await browser.newPage()
    const observer = rpcObserverFor(page)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})

    await mountHandle(page, blockedCore.base)
    await openChatPanel(page)
    await sendChatMessage(page, 'while upgrades are blocked')
    const blocked = await observer.completed({path: ['chat', 'send'], timeout: 30_000})
    expect(blocked.transport).toBe('fetch')

    blockedCore.setUpgradesBlocked(false)
    const mark = observer.mark()
    await rebindHandle(page, blockedCore.base)
    await expectLocator(chatBox(page)).toBeVisible({timeout: 30_000})
    await sendChatMessage(page, 'after the upgrade path opens')

    const reprobed = await observer.completed({path: ['chat', 'send'], since: mark, timeout: 30_000})
    expect(reprobed.transport).toBe('websocket')
    await page.close()
  })
})
