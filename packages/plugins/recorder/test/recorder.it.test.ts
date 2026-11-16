import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {expect} from 'playwright/test'
import {test} from '@conciv/browser-fixture'
import {openPluginWidget} from '@conciv/plugin-testkit/widget-suite'
import {rpcSocketFor, type RpcSocketCall} from '@conciv/plugin-testkit/rpc-socket'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

const WIDGET_BUNDLE = path.join(PACKAGE_DIR, 'node_modules/@conciv/embed/dist/conciv-widget.global.js')

function isRecordingWindowRead(call: RpcSocketCall): boolean {
  return call.path.join('.') === 'plugin.call' && (JSON.stringify(call.input) ?? '').includes('"method":"window"')
}

describe('the recorder in the widget', () => {
  test('is an active plugin with a browser part, and with the old extension Recorder view hidden shows its Recorder tab loading the recording in the panel, then with nothing recorded yet for this page, then replays what the user does in the page without the widget', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'recorder-widget',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
      body: '<button type="button" onclick="this.textContent = \'Pressed by the user\'">Press me</button>',
    })
    try {
      const page = widget.page
      const socket = rpcSocketFor(page)
      await socket.installed
      const windowRead = Promise.withResolvers<void>()
      socket.rule((call) => {
        if (!isRecordingWindowRead(call)) return 'pass'
        void windowRead.promise.then(() => call.forward())
        return 'handled'
      })
      await page.reload({waitUntil: 'domcontentloaded'})
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
      await expect(page.getByText('Loading recording…', {exact: true})).toBeVisible({timeout: 30_000})
      await expect(page.getByText('Reconnecting to your workspace.', {exact: true})).toBeHidden()
      windowRead.resolve()
      await expect(page.getByText('No recording yet: interact with the page first.', {exact: true})).toBeVisible({
        timeout: 30_000,
      })
      await page.getByRole('button', {name: 'Press me', exact: true}).click()
      await expect(page.getByRole('button', {name: 'Pressed by the user', exact: true})).toBeVisible()
      const replay = page.frameLocator('iframe')
      await expect(replay.getByRole('button', {name: 'Pressed by the user', exact: true})).toBeAttached({
        timeout: 30_000,
      })
      await expect(replay.getByRole('tab', {name: 'Recorder', exact: true})).toHaveCount(0)
    } finally {
      await widget.close()
    }
  }, 120_000)
})
