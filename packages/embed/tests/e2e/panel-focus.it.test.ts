import {expect, test, type Locator, type Page} from '@playwright/test'
import {gateRpcCalls} from '@conciv/extension-testkit/rpc-fault'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'
import {currentHref} from '@conciv/extension-testkit/navigation-state'
import {until} from '@conciv/harness-testkit/until'
import {hostPage} from '../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'

const suite = setupWidgetSuite()

const COMPOSER_NAME = 'Message the conciv agent'
const SESSION_PILL_NAME = 'Session: New session'
const SESSIONS_LIST = ['sessions', 'list'] as const

function composer(page: Page) {
  return page.getByRole('textbox', {name: COMPOSER_NAME})
}

function sessionPill(page: Page) {
  return page.getByRole('button', {name: SESSION_PILL_NAME})
}

async function ensurePanelClosed(page: Page): Promise<void> {
  const minimize = page.getByRole('button', {name: 'Minimize conciv chat'})
  const opener = page.getByRole('button', {name: 'Open conciv chat'})
  await expect(minimize.or(opener)).toBeVisible({timeout: 30_000})
  if (await minimize.isVisible()) await minimize.click()
  await expect(opener).toBeVisible({timeout: 30_000})
}

type HostedPanel = {host: Awaited<ReturnType<typeof serveHost>>; page: Page; hostButton: Locator}

const dedicatedHosts: Array<{close: () => Promise<void>}> = []

test.afterEach(async () => {
  for (const dedicatedHost of dedicatedHosts.splice(0)) await dedicatedHost.close()
})

async function openPanelOverFocusedHostButton(page: Page): Promise<HostedPanel> {
  const host = await serveHost(() =>
    hostPage({
      apiBase: suite.kit().base,
      widget: '{"quickTerminal":false}',
      body: '<button id="host-action">Host action</button>',
    }),
  )
  dedicatedHosts.push(host)
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  await ensurePanelClosed(page)
  const hostButton = page.getByRole('button', {name: 'Host action'})
  await hostButton.click()
  await expect(hostButton).toBeFocused()
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('conciv-dispatch-event', {
        detail: {type: 'panel:open', payload: undefined, pluginId: 'panel'},
      }),
    ),
  )
  await expect(composer(page)).toBeVisible({timeout: 30_000})
  return {host, page, hostButton}
}

test.describe('panel open focuses the composer', () => {
  test('focuses the composer input when the panel opens', async ({page}) => {
    test.setTimeout(90_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await expect(composer(page)).toBeFocused({timeout: 10_000})
    await page.keyboard.type('typed without clicking')
    await expect(composer(page)).toHaveText('typed without clicking')
  })

  test('paints the shell while the session list is still loading, then focuses the composer', async ({page}) => {
    test.setTimeout(90_000)
    const host = await serveHost(() =>
      hostPage({apiBase: suite.kit().base, widget: '{"quickTerminal":false,"transport":"fetch"}'}),
    )
    dedicatedHosts.push(host)
    const sessionListGate = await gateRpcCalls(page, {path: SESSIONS_LIST})
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    try {
      await sessionListGate.awaitCaptured(1)
      await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 15_000})
      expect(sessionListGate.pending()).toBeGreaterThan(0)
    } finally {
      await sessionListGate.dispose()
    }
    await openPanel(page)
    await expect(sessionPill(page)).toBeVisible({timeout: 30_000})
    await expect(composer(page)).toBeFocused({timeout: 30_000})
    await page.keyboard.type('typed after the session list resolved')
    await expect(composer(page)).toHaveText('typed after the session list resolved')
  })
})

test.describe('panel close restores focus: host element captured at open wins, FAB is the fallback', () => {
  test('closing via the FAB restores the host element that was focused before a programmatic open', async ({page}) => {
    test.setTimeout(120_000)
    const {hostButton} = await openPanelOverFocusedHostButton(page)
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expect(hostButton).toBeFocused({timeout: 10_000})
  })

  test('closing via the panel header restores the host element that was focused before the open', async ({page}) => {
    test.setTimeout(120_000)
    const {hostButton} = await openPanelOverFocusedHostButton(page)
    await page.getByRole('button', {name: 'Close chat'}).click()
    await expect(hostButton).toBeFocused({timeout: 10_000})
  })

  test('collapsing the panel by dragging its resize handle shut restores the host element', async ({page}) => {
    test.setTimeout(180_000)
    const {hostButton} = await openPanelOverFocusedHostButton(page)

    const handle = page.getByRole('separator', {name: 'Resize chat height'})
    const grip = await handle.boundingBox()
    if (!grip) throw new Error('the resize handle is not laid out')
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 600, {steps: 12})
    await page.mouse.up()
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    await expect(hostButton).toBeFocused({timeout: 10_000})
  })

  test('closing via the FAB falls back to FAB focus when no host element was captured at open time', async ({page}) => {
    test.setTimeout(120_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await ensurePanelClosed(page)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect(composer(page)).toBeVisible({timeout: 30_000})
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeFocused({timeout: 10_000})
  })

  test('closing a boot-restored open panel falls back to FAB focus', async ({page}) => {
    test.setTimeout(180_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await until(async () => (await currentHref(suite.kit())).includes('open=true'), {
      hangGuardMs: 30_000,
      intervalMs: 100,
    })
    expect(await currentHref(suite.kit())).toContain('open=true')

    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await page.getByRole('button', {name: 'Close chat'}).click()
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeFocused({timeout: 10_000})
  })

  test('closing the phone sheet falls back to FAB focus once the launcher remounts', async ({page}) => {
    test.setTimeout(180_000)
    await page.setViewportSize({width: 390, height: 780})
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await ensurePanelClosed(page)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect(composer(page)).toBeVisible({timeout: 30_000})
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeHidden({timeout: 30_000})
    await page.getByRole('button', {name: 'Close chat'}).click()
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeFocused({timeout: 10_000})
  })
})
