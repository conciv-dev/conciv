import {expect, test, type Page} from '@playwright/test'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage} from '../helpers/host.js'
import {openPanel} from './helpers/panel.js'

const DARK_SURFACE = 'rgb(23, 22, 26)'
const LIGHT_SURFACE = 'rgb(255, 255, 255)'

const HOST_TOGGLE = `<h1>Host page</h1><button type="button" id="host-theme" onclick="document.documentElement.classList.toggle('dark')">Toggle host theme</button>`

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeEach(async () => {
  kit = await bootEmbedKit()
  host = await serveHost((url) =>
    hostPage({
      apiBase: kit.base,
      widget: '{"quickTerminal":false}',
      body: HOST_TOGGLE,
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

async function openWidgetOn(page: Page, htmlAttributes: string): Promise<void> {
  await page.goto(`${host.base}/?html=${encodeURIComponent(htmlAttributes)}`, {waitUntil: 'domcontentloaded'})
  await openPanel(page)
}

test.describe('widget adapts to the host page color scheme', () => {
  test('follows a color-scheme declared on the host root element', async ({page}) => {
    await openWidgetOn(page, 'style="color-scheme: light"')
    await expect(panelSurface(page)).toHaveCSS('background-color', LIGHT_SURFACE)

    await openWidgetOn(page, 'style="color-scheme: dark"')
    await expect(panelSurface(page)).toHaveCSS('background-color', DARK_SURFACE)
  })

  test('follows a light or dark class on the host root element', async ({page}) => {
    await openWidgetOn(page, 'class="light"')
    await expect(panelSurface(page)).toHaveCSS('background-color', LIGHT_SURFACE)

    await openWidgetOn(page, 'class="dark"')
    await expect(panelSurface(page)).toHaveCSS('background-color', DARK_SURFACE)
  })

  test('follows a data-theme attribute on the host root element', async ({page}) => {
    await openWidgetOn(page, 'data-theme="light"')
    await expect(panelSurface(page)).toHaveCSS('background-color', LIGHT_SURFACE)

    await openWidgetOn(page, 'data-theme="dark"')
    await expect(panelSurface(page)).toHaveCSS('background-color', DARK_SURFACE)
  })

  test('re-resolves when the host page toggles its theme class at runtime', async ({page}) => {
    await openWidgetOn(page, 'class="light"')
    await expect(panelSurface(page)).toHaveCSS('background-color', LIGHT_SURFACE)

    await page.getByRole('button', {name: 'Toggle host theme'}).click()
    await expect(panelSurface(page)).toHaveCSS('background-color', DARK_SURFACE)

    await page.getByRole('button', {name: 'Toggle host theme'}).click()
    await expect(panelSurface(page)).toHaveCSS('background-color', LIGHT_SURFACE)
  })
})

test.describe('a popped-out window carries the resolved scheme', () => {
  test.use({colorScheme: 'dark'})

  test('renders light when the host page it was opened from is light', async ({page}) => {
    await openWidgetOn(page, 'class="light"')
    await expect(panelSurface(page)).toHaveCSS('background-color', LIGHT_SURFACE)

    await page.getByRole('button', {name: 'Session options'}).click()
    const opened = page.context().waitForEvent('page')
    await page.getByRole('button', {name: 'Pop out to a window'}).click()
    const pip = await opened

    await expect(pip.locator('html')).toHaveCSS('color-scheme', 'light')

    await page.getByRole('button', {name: 'Toggle host theme'}).click()
    await expect(pip.locator('html')).toHaveCSS('color-scheme', 'dark')
  })
})

test.describe('widget falls back to the operating system preference', () => {
  test.describe('with a dark system preference', () => {
    test.use({colorScheme: 'dark'})

    test('renders dark on a host page that declares no scheme signal', async ({page}) => {
      await openWidgetOn(page, '')
      await expect(panelSurface(page)).toHaveCSS('background-color', DARK_SURFACE)
    })

    test('still honours an explicit light signal on the host page', async ({page}) => {
      await openWidgetOn(page, 'data-theme="light"')
      await expect(panelSurface(page)).toHaveCSS('background-color', LIGHT_SURFACE)
    })
  })

  test.describe('with a light system preference', () => {
    test.use({colorScheme: 'light'})

    test('renders light on a host page that declares no scheme signal', async ({page}) => {
      await openWidgetOn(page, '')
      await expect(panelSurface(page)).toHaveCSS('background-color', LIGHT_SURFACE)
    })
  })
})
