import {readFileSync} from 'node:fs'
import {createServer, type Server} from 'node:http'
import {afterAll, beforeAll, describe, it} from 'vitest'
import {chromium, type Browser} from 'playwright'

const bundle = readFileSync(new URL('../dist/canvas-overlay.global.js', import.meta.url), 'utf8')
// Load the overlay bundle, mount it into a light-DOM host (Excalidraw can't draw inside a shadow root),
// and expose the handle for the test to drive.
const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <script>${bundle}</script>
  <script>
    const host = document.createElement('div')
    host.style.position = 'fixed'; host.style.inset = '0'; host.style.pointerEvents = 'none'
    document.body.appendChild(host)
    window.__overlay = window.__MANDARAX_CANVAS__.mount(host, {roomId: 'it-room'})
  </script>
</body></html>`

function startServer(): Promise<{base: string; close: () => Promise<void>}> {
  return new Promise((resolve) => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, {'content-type': 'text/html'})
      res.end(HTML)
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r()))})
    })
  })
}

describe('canvas overlay (it) — real browser', () => {
  let browser: Browser
  let close: (() => Promise<void>) | undefined
  const state = {base: ''}
  beforeAll(async () => {
    ;({base: state.base, close} = await startServer())
    browser = await chromium.launch()
  }, 90_000)
  afterAll(async () => {
    await browser?.close()
    await close?.()
  })

  it('mounts the overlay (Excalidraw + our controls) and renders a Solid pin from the doc', async () => {
    const page = await browser.newPage()
    await page.goto(state.base, {waitUntil: 'domcontentloaded'})

    // Our own controls render (zen-free Excalidraw + the Draw/Comment toggle bar).
    await page.getByRole('button', {name: 'Draw'}).waitFor({state: 'visible'})

    // Add a pin to the doc; the Solid pins layer reactively renders a marker for it.
    await page.evaluate(() =>
      (window as unknown as {__overlay: {doc: {pins: {set: (k: string, v: unknown) => void}}}}).__overlay.doc.pins.set(
        'c1',
        {commentId: 'c1', x: 50, y: 60, pinState: 'locked'},
      ),
    )
    await page.getByRole('button', {name: 'comment pin c1'}).waitFor({state: 'visible'})

    await page.close()
  })
})
