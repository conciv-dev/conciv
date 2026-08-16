import {expect, test, type Page} from '@playwright/test'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage} from '../helpers/host.js'
import {openPanelOnNewSession} from './helpers/panel.js'
import type {WidgetSuite} from './helpers/suite.js'

const HOST_SEARCH_HOTKEY = `
  <button type="button">Host focus target</button>
  <div id="host-search" role="status" aria-label="host search">host search idle</div>
  <script>
    function isEditingContent(event) {
      var element = event.target
      var tagName = element.tagName
      return element.isContentEditable || tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA'
    }
    window.addEventListener('keydown', function (event) {
      if (event.key !== '/') return
      if (isEditingContent(event)) return
      event.preventDefault()
      document.getElementById('host-search').textContent = 'host search open'
    })
  </script>
`

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeEach(async () => {
  kit = await bootEmbedKit()
  host = await serveHost(() =>
    hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: HOST_SEARCH_HOTKEY}),
  )
})

test.afterEach(async () => {
  await host.close()
  await kit.cleanup()
})

const suite: WidgetSuite = {kit: () => kit, host: () => host}

const composer = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})
const hostSearch = (page: Page) => page.getByRole('status', {name: 'host search'})

test.describe('host-page keyboard hotkeys and the widget composer', () => {
  test('a slash typed into the composer never reaches the host search hotkey', async ({page}) => {
    test.setTimeout(120_000)
    await openPanelOnNewSession(page, suite)
    const input = composer(page)
    await input.click()
    await expect(input).toHaveText('')

    await input.pressSequentially('run tests in lib/utils')
    await expect(input).toHaveText(/utils/, {timeout: 30_000})

    await expect(hostSearch(page)).toHaveText('host search idle')
    await expect(input).toHaveText('run tests in lib/utils')
  })

  test('a slash pressed with focus on the host page still fires the host search hotkey', async ({page}) => {
    test.setTimeout(120_000)
    await openPanelOnNewSession(page, suite)

    await page.getByRole('button', {name: 'Host focus target'}).click()
    await page.keyboard.press('/')

    await expect(hostSearch(page)).toHaveText('host search open', {timeout: 30_000})
  })
})
