// The widget driven in a REAL browser; a page registers an extension via window.__MANDARAX__ and we
// assert the theme override + the added composer button take effect. Real bundle, real browser.
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {startWidgetServer, widgetBundle} from './helpers/widget-server.js'

// Register an extension BEFORE the widget bundle runs by seeding window.__MANDARAX__.queue; the
// bundle's installExtensionGlobal drains it on mount. clientFn sets a blue accent and adds a button.
function pageHtml(): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
    <script>
      window.__MANDARAX__ = { queue: [ {
        id: 'acme',
        clientFn: function (mx) {
          mx.ui.setTheme({ 'pw-accent': 'rgb(37, 99, 235)' })
          mx.registerComposerAction({
            id: 'deploy',
            label: 'Deploy',
            icon: function () { return null },
            onClick: function () {},
          })
        },
      } ] }
    </script>
  </head><body>
    <div id="probe">page-bus-ok</div>
    <script>${widgetBundle}</script>
  </body></html>`
}

describe('widget extensions (it) — real browser', () => {
  let browser: Browser
  let close: (() => Promise<void>) | undefined
  const state = {base: ''}

  beforeAll(async () => {
    ;({base: state.base, close} = await startWidgetServer(pageHtml()))
    browser = await chromium.launch()
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    await close?.()
  })

  it('applies an extension theme override and adds a composer action', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)

    const fab = page.getByRole('button', {name: 'Open mandarax chat'})
    await fab.waitFor({state: 'visible'})

    // The theme override set --pw-accent on :host; the FAB resolves it from the shadow root.
    const accent = await fab.evaluate((el) => getComputedStyle(el).getPropertyValue('--pw-accent').trim())
    expect(accent).toBe('rgb(37, 99, 235)')

    // The registered composer action renders as a button (registry is reactive post-mount).
    await fab.click()
    await page.getByText('How can I help you today?').waitFor({state: 'visible'})
    await page.getByRole('button', {name: 'Deploy'}).waitFor({state: 'visible'})
    await page.close()
  })
})
