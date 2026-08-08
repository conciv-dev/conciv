import {describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Locator, Page} from 'playwright'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'
import {hostPage, serveHost} from './helpers/host.js'

const suite = setupWidgetSuite()

const COMPOSER_NAME = 'Message the conciv agent'

function composer(page: Page) {
  return page.getByRole('textbox', {name: COMPOSER_NAME})
}

async function ensurePanelClosed(page: Page): Promise<void> {
  const minimize = page.getByRole('button', {name: 'Minimize conciv chat'})
  const opener = page.getByRole('button', {name: 'Open conciv chat'})
  await expectLocator(minimize.or(opener)).toBeVisible({timeout: 30_000})
  if (await minimize.isVisible()) await minimize.click()
  await expectLocator(opener).toBeVisible({timeout: 30_000})
}

function selectedText(page: Page): Promise<string> {
  return page.evaluate(() => document.getSelection()?.toString() ?? '')
}

type HostedPanel = {host: Awaited<ReturnType<typeof serveHost>>; page: Page; hostButton: Locator}

async function openPanelOverFocusedHostButton(): Promise<HostedPanel> {
  const host = await serveHost(() =>
    hostPage({
      apiBase: suite.kit().base,
      widget: '{"quickTerminal":false}',
      body: '<button id="host-action">Host action</button>',
    }),
  )
  const page = await suite.browser().newPage()
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  await ensurePanelClosed(page)
  const hostButton = page.getByRole('button', {name: 'Host action'})
  await hostButton.click()
  await expectLocator(hostButton).toBeFocused()
  await page.evaluate(() => window.dispatchEvent(new Event('conciv:open-panel')))
  await expectLocator(composer(page)).toBeVisible({timeout: 30_000})
  return {host, page, hostButton}
}

describe('panel open focuses the composer', () => {
  it('focuses the composer input when the panel opens', async () => {
    const page = await suite.browser().newPage()
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await expectLocator(composer(page)).toBeFocused({timeout: 10_000})
    await page.keyboard.type('typed without clicking')
    await expectLocator(composer(page)).toHaveText('typed without clicking')
    await page.close()
  })
})

describe('an open panel leaves the rest of the page alone', () => {
  it('leaves focus on the host page field the user moved to while a reply streams', async () => {
    const host = await serveHost(() =>
      hostPage({
        apiBase: suite.kit().base,
        widget: '{"quickTerminal":false}',
        body: '<input id="host-field" aria-label="Host field">',
      }),
    )
    const page = await suite.browser().newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    const stop = page.getByRole('button', {name: 'Stop generating'})
    const hostField = page.getByRole('textbox', {name: 'Host field'})

    suite.kit().harness.script.hold()
    try {
      await composer(page).fill('a question the user stops waiting for')
      await page.getByRole('button', {name: 'Send message'}).click()
      await expectLocator(stop).toBeVisible({timeout: 30_000})
      await hostField.click()
      await expectLocator(hostField).toBeFocused({timeout: 10_000})
    } finally {
      suite.kit().harness.script.release()
    }

    await expectLocator(stop).toBeHidden({timeout: 30_000})
    await expectLocator(hostField).toBeFocused({timeout: 10_000})
    await page.keyboard.type('typed on the host page')
    await expectLocator(hostField).toHaveValue('typed on the host page')
    await page.close()
    await host.close()
  })

  it('keeps a transcript selection alive while a reply streams', async () => {
    const page = await suite.browser().newPage()
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    const stop = page.getByRole('button', {name: 'Stop generating'})

    suite.kit().harness.script.hold()
    try {
      await composer(page).fill('a question whose answer the user selects')
      await page.getByRole('button', {name: 'Send message'}).click()
      await expectLocator(stop).toBeVisible({timeout: 30_000})
      const reply = page.getByText('Hello from conciv').first()
      await expectLocator(reply).toBeVisible({timeout: 30_000})
      await reply.click({clickCount: 3})
      await expectLocator(composer(page)).not.toBeFocused({timeout: 10_000})
      expect(await selectedText(page)).toContain('Hello from conciv')
    } finally {
      suite.kit().harness.script.release()
    }

    await expectLocator(stop).toBeHidden({timeout: 30_000})
    await expectLocator(composer(page)).not.toBeFocused({timeout: 10_000})
    expect(await selectedText(page)).toContain('Hello from conciv')
    await page.close()
  })
})

describe('a programmatic open still hands the composer the focus', () => {
  it('focuses the composer when the host page opens the panel from its own focused button', async () => {
    const {host, page} = await openPanelOverFocusedHostButton()
    await expectLocator(composer(page)).toBeFocused({timeout: 10_000})
    await page.close()
    await host.close()
  })
})

describe('panel close restores focus: host element captured at open wins, FAB is the fallback', () => {
  it('closing via the FAB restores the host element that was focused before a programmatic open', async () => {
    const {host, page, hostButton} = await openPanelOverFocusedHostButton()
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expectLocator(hostButton).toBeFocused({timeout: 10_000})
    await page.close()
    await host.close()
  })

  it('closing via the panel header restores the host element that was focused before the open', async () => {
    const {host, page, hostButton} = await openPanelOverFocusedHostButton()
    await page.getByRole('button', {name: 'Close chat'}).click()
    await expectLocator(hostButton).toBeFocused({timeout: 10_000})
    await page.close()
    await host.close()
  })

  it('collapsing the panel by dragging its resize handle shut restores the host element', async () => {
    const {host, page, hostButton} = await openPanelOverFocusedHostButton()

    const handle = page.getByRole('separator', {name: 'Resize chat height'})
    const grip = await handle.boundingBox()
    if (!grip) throw new Error('the resize handle is not laid out')
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 600, {steps: 12})
    await page.mouse.up()
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    await expectLocator(hostButton).toBeFocused({timeout: 10_000})
    await page.close()
    await host.close()
  })

  it('closing via the FAB falls back to FAB focus when no host element was captured at open time', async () => {
    const page = await suite.browser().newPage()
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await ensurePanelClosed(page)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expectLocator(composer(page)).toBeVisible({timeout: 30_000})
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeFocused({timeout: 10_000})
    await page.close()
  })
})
