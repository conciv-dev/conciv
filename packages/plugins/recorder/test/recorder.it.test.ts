import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {expect} from 'playwright/test'
import {test} from '@conciv/browser-fixture'
import {openPluginWidget} from '@conciv/plugin-testkit/widget-suite'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

const WIDGET_BUNDLE = path.join(PACKAGE_DIR, 'node_modules/@conciv/embed/dist/conciv-widget.global.js')

describe('the recorder in the widget', () => {
  test('is an active plugin with a browser part, and with the old extension Recorder view hidden shows its Recorder tab with nothing recorded yet for this page', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'recorder-widget',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
    })
    try {
      const page = widget.page
      await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
      await page.getByRole('link', {name: 'Settings'}).click({timeout: 30_000})
      await page.getByRole('tab', {name: 'Plugins', exact: true}).click({timeout: 30_000})
      await expect(page.getByRole('switch', {name: 'recorder'})).toBeChecked({timeout: 30_000})
      await expect(page.getByText('Server', {exact: true})).toBeVisible({timeout: 30_000})
      await page.getByRole('tab', {name: 'Views', exact: true}).click()
      const oldRecorderView = page.getByRole('checkbox', {name: /^Recorder/})
      await page
        .getByRole('region', {name: 'Tab bar'})
        .getByText(/^Recorder/)
        .click()
      await expect(oldRecorderView).not.toBeChecked()
      await page.getByRole('button', {name: 'Back to chat'}).click()
      const recorderTab = page.getByRole('tab', {name: 'Recorder', exact: true})
      await recorderTab.click()
      await expect(page.getByRole('tab', {name: 'Recorder', exact: true, selected: true})).toBeVisible()
      await expect(page.getByText('No recording yet: interact with the page first.', {exact: true})).toBeVisible({
        timeout: 30_000,
      })
    } finally {
      await widget.close()
    }
  }, 120_000)
})
