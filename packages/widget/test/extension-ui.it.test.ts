// The widget driven in a REAL browser; an extension seeded via window.__MANDARAX__.queue paints a
// header, footer, status, and keyed widget (factories return real DOM nodes — Solid inserts them, so
// the page can author them in plain JS). Real bundle, real browser, native assertions.
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {startWidgetServer, widgetScriptTag} from './helpers/widget-server.js'

function pageHtml(): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="">
    <meta name="pw-widget" content='{"quickTerminal":false}'>
    <script>
      function node(tag, text, attrs) {
        var el = document.createElement(tag)
        el.textContent = text
        if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k])
        return el
      }
      window.__MANDARAX__ = { queue: [ {
        id: 'acme',
        clientFn: function (mx) {
          mx.ui.setHeader(function () { return node('div', 'Acme banner') })
          mx.ui.setFooter(function () { return node('div', 'Acme footer') })
          mx.ui.setStatus('tokens', 'Tokens: 42')
          mx.ui.setWidget('deploy', function () { return node('button', 'Deploy now', {type: 'button'}) })
          mx.ui.setEmptyState(function () { return node('div', 'Custom welcome!') })
          // A throwing factory must be isolated by the slot's error boundary, not crash the widget.
          mx.ui.setWidget('boom', function () { throw new Error('boom') })
          mx.ui.setWidget('safe', function () { return node('div', 'Safe widget') })
        },
      } ] }
    </script>
  </head><body>
    ${widgetScriptTag}
  </body></html>`
}

describe('widget extension UI store (it) — real browser', () => {
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

  it('paints header, footer, status, and a keyed widget from an extension', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    await page.getByText('Acme banner').waitFor({state: 'visible'})
    await page.getByText('Acme footer').waitFor({state: 'visible'})
    await page.getByText('Tokens: 42').waitFor({state: 'visible'})
    await page.getByRole('button', {name: 'Deploy now'}).waitFor({state: 'visible'})
    await page.close()
  })

  it('overrides the empty state via ui.setEmptyState', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    await page.getByText('Custom welcome!').waitFor({state: 'visible'})
    expect(await page.getByText('How can I help you today?').count()).toBe(0)
    await page.close()
  })

  it('isolates a throwing widget factory behind the slot error boundary', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    // The 'boom' factory throws, but the sibling slots still render and the widget stays up.
    await page.getByText('Safe widget').waitFor({state: 'visible'})
    await page.getByRole('button', {name: 'Deploy now'}).waitFor({state: 'visible'})
    await page.close()
  })

  it('removes a status when set to null', async () => {
    const page = await browser.newPage()
    await page.goto(state.base)
    await page.getByRole('button', {name: 'Open mandarax chat'}).click()
    await page.getByText('Tokens: 42').waitFor({state: 'visible'})
    // A later extension clears the keyed status; the slot drops it (null removes).
    await page.evaluate(() => {
      window.__MANDARAX__?.use?.({id: 'clear', clientFn: (mx) => mx.ui.setStatus('tokens', null)})
    })
    await page.getByText('Tokens: 42').waitFor({state: 'detached'})
    await page.close()
  })
})
