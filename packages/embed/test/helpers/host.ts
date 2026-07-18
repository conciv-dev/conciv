import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type Server} from 'node:http'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const embedBundle = fs.readFileSync(path.join(dirname, '../../dist/conciv-widget.global.js'), 'utf8')

export function hostPage(opts: {apiBase: string; widget?: string; body?: string}): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="${opts.apiBase}">
    <meta name="pw-widget" content='${opts.widget ?? '{}'}'>
  </head><body>
    ${opts.body ?? '<div id="probe">page-bus-ok</div>'}
    <script>${embedBundle}</script>
  </body></html>`
}

export function handleHostPage(): string {
  const handleBundle = fs.readFileSync(path.join(dirname, '../dist/conciv-handle.global.js'), 'utf8')
  return `<!doctype html><html><head></head><body>
    <div id="probe">page-bus-ok</div>
    <script>${handleBundle}</script>
  </body></html>`
}

export async function serveHost(html: () => string): Promise<{base: string; close: () => Promise<void>}> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    res.end(html())
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
