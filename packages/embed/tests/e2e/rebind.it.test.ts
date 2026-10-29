import {expect, test, type Page} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {handleHostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {watchChatWire} from '@conciv/extension-testkit/chat-wire'
import {until} from '@conciv/harness-testkit/until'
import {CHAT_WS_PATH} from '@conciv/protocol/chat-types'
import {proxyTo, type ProxyCore} from '../helpers/proxy.js'
import {mountHandle, openHostWithHandle, rebindHandle} from './helpers/handle.js'
import {chatBox, openChatPanel, sendChatMessage} from './helpers/chat.js'

const ASSISTANT_TEXT = 'Rebound reply'
const USER_TEXT = 'first message before the drift'
const SECOND_USER_TEXT = 'second message after the drift'

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeEach(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  host = await serveHost(() => handleHostPage())
})

test.afterEach(async () => {
  await host.close()
  await kit.cleanup()
})

async function openPanelTabs(page: Page): Promise<void> {
  const opener = page.getByRole('button', {name: 'Open conciv chat'})
  await expect(opener).toBeVisible({timeout: 30_000})
  await opener.click()
  await expect(page.getByRole('tab', {name: 'Mount probe'})).toBeVisible({timeout: 30_000})
}

async function panelSession(): Promise<string | null> {
  const state = await kit.rpc.navigation.get(undefined)
  const entry = state?.entries.find((row) => row.href.startsWith('/panel/'))
  if (!entry) return null
  return (entry.href.split('/')[2] ?? '').split('?')[0] ?? null
}

test.describe('handle.rebind survives same-core port drift', () => {
  let proxyA: ProxyCore
  let proxyB: ProxyCore

  test.beforeEach(async () => {
    proxyA = await proxyTo(kit.base)
    proxyB = await proxyTo(kit.base)
  })

  test.afterEach(async () => {
    await proxyB.close()
  })

  test('re-points rpc and SSE to the new port, keeps the panel open, the session, and delivers the next turn', async ({
    page,
  }) => {
    test.setTimeout(480_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})

    await mountHandle(page, proxyA.base)
    await openChatPanel(page)

    const apiBaseProbe = page.getByRole('status', {name: 'host api base probe'})
    await expect(apiBaseProbe).toHaveText(proxyA.base, {timeout: 30_000})

    await until(async () => (await panelSession()) !== null, {hangGuardMs: 30_000, intervalMs: 100})
    const sessionBefore = await panelSession()
    expect(sessionBefore).not.toBeNull()

    await sendChatMessage(page, USER_TEXT)
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

    const beforeB = proxyB.trafficCount()
    await rebindHandle(page, proxyB.base)
    await proxyA.close()

    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await expect(chatBox(page)).toBeVisible({timeout: 30_000})

    await expect(apiBaseProbe).toHaveText(proxyB.base, {timeout: 30_000})

    await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(1, {timeout: 30_000})

    await sendChatMessage(page, SECOND_USER_TEXT)
    await expect(page.getByText(ASSISTANT_TEXT)).toHaveCount(2, {timeout: 30_000})
    await expect(page.getByText(SECOND_USER_TEXT)).toHaveCount(1, {timeout: 30_000})
    await expect(page.getByText(USER_TEXT)).toHaveCount(1, {timeout: 30_000})

    expect(proxyB.trafficCount()).toBeGreaterThan(beforeB)
    expect(await panelSession()).toBe(sessionBefore)
    expect(sessionBefore).not.toBeNull()
    expect(pageErrors).toEqual([])
  })
})

test.describe('handle.rebind remounts extension surfaces on the new core', () => {
  let proxyC: ProxyCore
  let proxyD: ProxyCore

  test.beforeEach(async () => {
    proxyC = await proxyTo(kit.base)
    proxyD = await proxyTo(kit.base)
  })

  test.afterEach(async () => {
    await proxyD.close()
  })

  test('rebuilds the global surface and the open extension view against the new base', async ({page}) => {
    test.setTimeout(240_000)
    const pageErrors = await openHostWithHandle(page, host.base, proxyC.base)
    await openPanelTabs(page)

    const surfaceProbe = page.getByRole('status', {name: 'surface mount api base'})
    const viewProbe = page.getByRole('status', {name: 'view mount api base'})
    await expect(surfaceProbe).toHaveText(proxyC.base, {timeout: 30_000})

    const probeTab = page.getByRole('tab', {name: 'Mount probe'})
    await probeTab.click()
    await expect(viewProbe).toHaveText(proxyC.base, {timeout: 30_000})

    const beforeD = proxyD.trafficCount()
    await rebindHandle(page, proxyD.base)
    await proxyC.close()

    await expect(surfaceProbe).toHaveText(proxyD.base, {timeout: 15_000})
    await expect(viewProbe).toHaveText(proxyD.base, {timeout: 15_000})
    await expect(probeTab).toHaveAttribute('aria-selected', 'true', {timeout: 15_000})
    expect(proxyD.trafficCount()).toBeGreaterThan(beforeD)
    expect(pageErrors).toEqual([])
  })
})

test.describe('handle.rebind quiesces the old connection before tearing consumers down', () => {
  let proxyE: ProxyCore
  let proxyF: ProxyCore

  test.beforeEach(async () => {
    proxyE = await proxyTo(kit.base)
    proxyF = await proxyTo(kit.base)
  })

  test.afterEach(async () => {
    await proxyE.close()
    await proxyF.close()
  })

  test('writes nothing more to the old core once rebind is called', async ({page}) => {
    test.setTimeout(180_000)
    const wire = watchChatWire(page)
    const framesSentPerSocket: number[] = []
    page.on('websocket', (socket) => {
      if (!socket.url().includes(CHAT_WS_PATH)) return
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
    await expect(apiBaseProbe).toHaveText(proxyE.base, {timeout: 30_000})

    await rebindHandle(page, proxyF.base)
    await expect(apiBaseProbe).toHaveText(proxyF.base, {timeout: 30_000})

    const settledOnOldSocket = framesSentPerSocket[0] ?? 0
    const sentOnNewCore = wire.nextTurn()
    await sendChatMessage(page, SECOND_USER_TEXT)
    await sentOnNewCore

    expect(framesSentPerSocket[0]).toBe(settledOnOldSocket)
  })
})

test.describe('handle.rebind to the base the widget is already on re-runs the transport probe', () => {
  let blockedCore: ProxyCore

  test.beforeEach(async () => {
    blockedCore = await proxyTo(kit.base, {blockUpgrades: true})
  })

  test.afterEach(async () => {
    await blockedCore.close()
  })

  test('rides the websocket after the blocked upgrade path opens up again', async ({page}) => {
    test.setTimeout(180_000)
    const wire = watchChatWire(page)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})

    await mountHandle(page, blockedCore.base)
    await openChatPanel(page)
    const blocked = wire.nextTurn()
    await sendChatMessage(page, 'while upgrades are blocked')
    expect((await blocked).transport).toBe('fetch')

    blockedCore.setUpgradesBlocked(false)
    await rebindHandle(page, blockedCore.base)
    await expect(chatBox(page)).toBeVisible({timeout: 30_000})
    const reprobed = wire.nextTurn()
    await sendChatMessage(page, 'after the upgrade path opens')
    expect((await reprobed).transport).toBe('websocket')
  })
})
