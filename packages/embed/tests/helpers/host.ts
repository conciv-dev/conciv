import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type Server} from 'node:http'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const embedBundle = fs.readFileSync(path.join(dirname, '../../dist/conciv-widget.global.js'), 'utf8')

const HOST_BACKDROPS: Record<string, string> = {
  'light-stripes': 'repeating-linear-gradient(45deg, #ffffff 0 14px, #ff0000 14px 28px)',
  'dark-stripes': 'repeating-linear-gradient(45deg, #000000 0 14px, #0000ff 14px 28px)',
}

function backdropStyle(backdrop: string | null | undefined): string {
  const stripes = backdrop === null || backdrop === undefined ? undefined : HOST_BACKDROPS[backdrop]
  if (stripes === undefined) return ''
  return `<style>html,body{min-height:100%;margin:0}body{background:${stripes}}</style>`
}

export function hostPage(opts: {apiBase: string; widget?: string; body?: string; backdrop?: string | null}): string {
  return `<!doctype html><html><head>
    <meta name="pw-api-base" content="${opts.apiBase}">
    <meta name="pw-widget" content='${opts.widget ?? '{}'}'>
    ${backdropStyle(opts.backdrop)}
  </head><body>
    ${opts.body ?? '<div id="probe">page-bus-ok</div>'}
    <script>${embedBundle}</script>
  </body></html>`
}

export function wsProbeHostPage(body?: string): string {
  const probeBundle = fs.readFileSync(path.join(dirname, '../dist/conciv-ws-probe.global.js'), 'utf8')
  return `<!doctype html><html><head></head><body>
    ${body ?? '<div id="probe">page-bus-ok</div>'}
    <script>${probeBundle}</script>
  </body></html>`
}

export function handleHostPage(body?: string): string {
  const handleBundle = fs.readFileSync(path.join(dirname, '../dist/conciv-handle.global.js'), 'utf8')
  return `<!doctype html><html><head></head><body>
    ${body ?? '<div id="probe">page-bus-ok</div>'}
    <script>${handleBundle}</script>
  </body></html>`
}

export async function listenLocal(server: Server): Promise<{base: string; port: number; close: () => Promise<void>}> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    base: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

export async function serveHost(html: (url: URL) => string): Promise<{base: string; close: () => Promise<void>}> {
  const server: Server = createServer((req, res) => {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    res.end(html(new URL(req.url ?? '/', 'http://127.0.0.1')))
  })
  const {base, close} = await listenLocal(server)
  return {
    base,
    close: async () => {
      try {
        await close()
      } catch (error) {
        console.error('[embed-testkit] host close failed:', error)
      }
    },
  }
}
