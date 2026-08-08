import {describe, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Page} from 'playwright'
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

describe('panel close restores focus: host element captured at open wins, FAB is the fallback', () => {
  it('closing via the FAB restores the host element that was focused before a programmatic open', async () => {
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
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expectLocator(hostButton).toBeFocused({timeout: 10_000})
    await page.close()
    await host.close()
  })

  it('closing via the panel header restores the host element that was focused before the open', async () => {
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
    await page.getByRole('button', {name: 'Close chat'}).click()
    await expectLocator(hostButton).toBeFocused({timeout: 10_000})
    await page.close()
    await host.close()
  })

  it('collapsing the panel by dragging its resize handle shut restores the host element', async () => {
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
