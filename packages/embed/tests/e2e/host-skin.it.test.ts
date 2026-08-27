import {expect, test, type Page} from '@playwright/test'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage} from '../helpers/host.js'
import {openPanel} from './helpers/panel.js'

const CONCIV_DARK_SURFACE = 'rgb(23, 22, 26)'
const CONCIV_LIGHT_SURFACE = 'rgb(255, 255, 255)'
const TERMINAL_DARK_SURFACE = 'rgb(14, 17, 16)'
const TERMINAL_LIGHT_SURFACE = 'rgb(251, 250, 246)'

const CONCIV_MENU_RADIUS = '4px'
const TERMINAL_MENU_RADIUS = '2px'
const MENU_PADDING = '8px'

const CONCIV_THREAD_INSET = '20px'
const TERMINAL_THREAD_INSET = '18.8px'
const FRAME_HANDLE_HEIGHT = '8px'

const SKIN_SWITCHER = `<h1>Host page</h1>
<style>html.terminal-look { --conciv-skin: terminal; }</style>
<button type="button" id="host-skin" onclick="document.documentElement.classList.toggle('terminal-look')">Toggle host skin</button>`

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeEach(async () => {
  kit = await bootEmbedKit()
  host = await serveHost((url) =>
    hostPage({
      apiBase: kit.base,
      widget: '{"quickTerminal":false}',
      body: SKIN_SWITCHER,
      htmlAttributes: url.searchParams.get('html') ?? '',
    }),
  )
})

test.afterEach(async () => {
  await host.close()
  await kit.cleanup()
})

function panelSurface(page: Page) {
  return page.getByRole('dialog', {name: 'conciv chat agent'})
}

function threadSurface(page: Page) {
  return page.getByRole('log')
}

function sessionMenu(page: Page) {
  return page.getByRole('dialog', {name: 'Session options'})
}

function frameHandle(page: Page) {
  return page.getByRole('separator', {name: 'Resize chat height'})
}

function effectsSurface(page: Page) {
  return page.locator('[data-conciv-effects]').locator('div').first()
}

async function openWidgetOn(page: Page, htmlAttributes: string): Promise<void> {
  await page.goto(`${host.base}/?html=${encodeURIComponent(htmlAttributes)}`, {waitUntil: 'domcontentloaded'})
  await openPanel(page)
}

test.describe('the host page selects a skin with the --conciv-skin custom property', () => {
  test('renders the terminal skin when the host root declares it', async ({page}) => {
    await openWidgetOn(page, 'style="--conciv-skin: terminal; color-scheme: dark"')
    await expect(panelSurface(page)).toHaveCSS('background-color', TERMINAL_DARK_SURFACE)
  })

  test('renders the terminal skin in the light scheme too', async ({page}) => {
    await openWidgetOn(page, 'style="--conciv-skin: terminal; color-scheme: light"')
    await expect(panelSurface(page)).toHaveCSS('background-color', TERMINAL_LIGHT_SURFACE)
  })

  test('renders the default skin when the host root declares nothing', async ({page}) => {
    await openWidgetOn(page, 'style="color-scheme: dark"')
    await expect(panelSurface(page)).toHaveCSS('background-color', CONCIV_DARK_SURFACE)
  })

  test('renders the default skin in the light scheme when the host declares nothing', async ({page}) => {
    await openWidgetOn(page, 'style="color-scheme: light"')
    await expect(panelSurface(page)).toHaveCSS('background-color', CONCIV_LIGHT_SURFACE)
  })

  test('re-skins live when a host class flip changes the declared value', async ({page}) => {
    await openWidgetOn(page, 'style="color-scheme: dark"')
    await expect(panelSurface(page)).toHaveCSS('background-color', CONCIV_DARK_SURFACE)

    await page.getByRole('button', {name: 'Toggle host skin'}).click()
    await expect(panelSurface(page)).toHaveCSS('background-color', TERMINAL_DARK_SURFACE)

    await page.getByRole('button', {name: 'Toggle host skin'}).click()
    await expect(panelSurface(page)).toHaveCSS('background-color', CONCIV_DARK_SURFACE)
  })
})

test.describe('an unrecognised skin name degrades to the default', () => {
  test('renders the default skin and warns exactly once', async ({page}) => {
    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning' && message.text().includes('--conciv-skin')) warnings.push(message.text())
    })

    await openWidgetOn(page, 'style="--conciv-skin: nope; color-scheme: dark"')
    await expect(panelSurface(page)).toHaveCSS('background-color', CONCIV_DARK_SURFACE)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('"nope"')
    expect(warnings[0]).toContain('"conciv"')
  })
})

test.describe('every render root the widget owns follows the active skin', () => {
  test('a menu portalled past the app wrap renders on the active skin', async ({page}) => {
    await openWidgetOn(page, 'style="color-scheme: dark"')
    await page.getByRole('button', {name: 'Session options'}).click()
    await expect(sessionMenu(page)).toHaveCSS('background-color', CONCIV_DARK_SURFACE)
    await expect(sessionMenu(page)).toHaveCSS('border-radius', CONCIV_MENU_RADIUS)

    await openWidgetOn(page, 'style="--conciv-skin: terminal; color-scheme: dark"')
    await page.getByRole('button', {name: 'Session options'}).click()
    await expect(sessionMenu(page)).toHaveCSS('background-color', TERMINAL_DARK_SURFACE)
    await expect(sessionMenu(page)).toHaveCSS('border-radius', TERMINAL_MENU_RADIUS)
  })

  test('a portalled menu keeps the frame spacing rather than the conversation density', async ({page}) => {
    await openWidgetOn(page, 'style="color-scheme: dark"')
    await page.getByRole('button', {name: 'Session options'}).click()
    await expect(sessionMenu(page)).toHaveCSS('padding', MENU_PADDING)

    await openWidgetOn(page, 'style="--conciv-skin: terminal; color-scheme: dark"')
    await page.getByRole('button', {name: 'Session options'}).click()
    await expect(sessionMenu(page)).toHaveCSS('padding', MENU_PADDING)
  })

  test('the body-level effects overlay resolves the skin panel token', async ({page}) => {
    await openWidgetOn(page, 'style="color-scheme: dark"')
    await expect(effectsSurface(page)).toHaveCSS('--chat-panel', /#17161a/)

    await openWidgetOn(page, 'style="--conciv-skin: terminal; color-scheme: dark"')
    await expect(effectsSurface(page)).toHaveCSS('--chat-panel', /#0e1110/)
  })

  test('a popped-out window carries both the scheme and the skin', async ({page}) => {
    await openWidgetOn(page, 'style="--conciv-skin: terminal; color-scheme: light"')
    await expect(panelSurface(page)).toHaveCSS('background-color', TERMINAL_LIGHT_SURFACE)

    await page.getByRole('button', {name: 'Session options'}).click()
    const opened = page.context().waitForEvent('page')
    await page.getByRole('button', {name: 'Pop out to a window'}).click()
    const pip = await opened

    await expect(pip.locator('html')).toHaveCSS('color-scheme', 'light')
    await expect(pip.getByRole('log')).toHaveCSS('padding-inline-start', TERMINAL_THREAD_INSET)
  })
})

test.describe('the density anchor scales the conversation surfaces only', () => {
  test('the thread inset tightens under terminal', async ({page}) => {
    await openWidgetOn(page, 'style="color-scheme: dark"')
    await expect(threadSurface(page)).toHaveCSS('padding-inline-start', CONCIV_THREAD_INSET)

    await openWidgetOn(page, 'style="--conciv-skin: terminal; color-scheme: dark"')
    await expect(threadSurface(page)).toHaveCSS('padding-inline-start', TERMINAL_THREAD_INSET)
  })

  test('the panel frame keeps its geometry under every skin', async ({page}) => {
    await openWidgetOn(page, 'style="color-scheme: dark"')
    await expect(frameHandle(page)).toHaveCSS('height', FRAME_HANDLE_HEIGHT)

    await openWidgetOn(page, 'style="--conciv-skin: terminal; color-scheme: dark"')
    await expect(frameHandle(page)).toHaveCSS('height', FRAME_HANDLE_HEIGHT)
  })
})
