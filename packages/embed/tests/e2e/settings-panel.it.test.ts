import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect, test, type Page} from '@playwright/test'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage} from '../helpers/host.js'
import {openPanel} from './helpers/panel.js'

const HOST_TOGGLE = `<h1>Host page</h1><button type="button" id="host-theme" onclick="document.documentElement.classList.toggle('dark')">Toggle host theme</button>`

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeEach(async () => {
  kit = await bootEmbedKit({globalStateDir: mkdtempSync(join(tmpdir(), 'conciv-settings-home-'))})
  host = await serveHost(() =>
    hostPage({
      apiBase: kit.base,
      widget: '{"quickTerminal":false}',
      body: HOST_TOGGLE,
      htmlAttributes: 'class="light"',
    }),
  )
})

test.afterEach(async () => {
  await host.close()
  await kit.cleanup()
})

function widgetRoot(page: Page) {
  return page.locator('[data-conciv-script-root] > div')
}

function schemeOption(page: Page, name: string) {
  return page.getByRole('radio', {name})
}

async function chooseScheme(page: Page, name: string): Promise<void> {
  await page.getByText(name, {exact: true}).click()
  await expect(schemeOption(page, name)).toBeChecked()
}

function scopeBadge(page: Page) {
  return page.getByRole('button', {name: /^Color scheme source:/})
}

async function openWidget(page: Page): Promise<void> {
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  await openPanel(page)
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Session options'}).click()
  await page.getByRole('button', {name: 'Settings'}).click()
  await expect(page.getByRole('heading', {name: 'Appearance'})).toBeVisible()
}

test('the session rail menu opens the settings view on its appearance section', async ({page}) => {
  await openWidget(page)
  await openSettings(page)

  await expect(page.getByText('SETTINGS', {exact: true})).toBeVisible()
  await expect(page.getByRole('link', {name: 'Appearance'})).toBeVisible()
  await expect(schemeOption(page, 'Auto')).toBeChecked()
})

test('choosing dark puts the dark scheme class on the widget root right away', async ({page}) => {
  await openWidget(page)
  await expect(widgetRoot(page)).toHaveClass(/\blight\b/)

  await openSettings(page)
  await chooseScheme(page, 'Dark')

  await expect(widgetRoot(page)).toHaveClass(/\bdark\b/)
})

test('the chosen scheme survives a reload of the host page', async ({page}) => {
  await openWidget(page)
  await openSettings(page)
  await chooseScheme(page, 'Dark')
  await expect(widgetRoot(page)).toHaveClass(/\bdark\b/)

  await page.goto(host.base, {waitUntil: 'domcontentloaded'})

  await expect(widgetRoot(page)).toHaveClass(/\bdark\b/)
})

test('auto hands the scheme back to the host page and follows it live', async ({page}) => {
  await openWidget(page)
  await openSettings(page)
  await chooseScheme(page, 'Dark')
  await expect(widgetRoot(page)).toHaveClass(/\bdark\b/)

  await page.getByRole('button', {name: 'Toggle host theme'}).click()
  await expect(widgetRoot(page)).toHaveClass(/\bdark\b/)

  await chooseScheme(page, 'Auto')
  await expect(widgetRoot(page)).toHaveClass(/\bdark\b/)

  await page.getByRole('button', {name: 'Toggle host theme'}).click()
  await expect(widgetRoot(page)).toHaveClass(/\blight\b/)
})

test('the scope badge applies the scheme to all projects and resets it back to the default', async ({page}) => {
  await openWidget(page)
  await openSettings(page)
  await expect(scopeBadge(page)).toHaveAccessibleName(/DEFAULT/)

  await chooseScheme(page, 'Dark')
  await expect(scopeBadge(page)).toHaveAccessibleName(/PROJECT/)

  await scopeBadge(page).click()
  await page.getByRole('menuitem', {name: 'Apply to all projects'}).click()
  await expect(scopeBadge(page)).toHaveAccessibleName(/GLOBAL/)
  await expect(widgetRoot(page)).toHaveClass(/\bdark\b/)

  await scopeBadge(page).click()
  await page.getByRole('menuitem', {name: 'Reset to default'}).click()
  await expect(scopeBadge(page)).toHaveAccessibleName(/DEFAULT/)
  await expect(schemeOption(page, 'Auto')).toBeChecked()
  await expect(widgetRoot(page)).toHaveClass(/\blight\b/)
})

test('a widget on another page repaints from the live settings notification', async ({page, context}) => {
  const other = await context.newPage()
  await other.goto(host.base, {waitUntil: 'domcontentloaded'})
  await openPanel(other)
  await expect(widgetRoot(other)).toHaveClass(/\blight\b/)

  await openWidget(page)
  await openSettings(page)
  await chooseScheme(page, 'Dark')

  await expect(widgetRoot(other)).toHaveClass(/\bdark\b/)
  await other.close()
})
