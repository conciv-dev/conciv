import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type Server} from 'node:http'
import {listenLocal} from '@conciv/extension-testkit/listen-local'

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
    <meta charset="utf-8">
    <meta name="pw-api-base" content="${opts.apiBase}">
    <meta name="pw-widget" content='${opts.widget ?? '{}'}'>
    ${backdropStyle(opts.backdrop)}
  </head><body>
    ${opts.body ?? '<div id="probe">page-bus-ok</div>'}
    <script>${embedBundle}</script>
  </body></html>`
}

export function handleHostPage(body?: string): string {
  const handleBundle = fs.readFileSync(path.join(dirname, '../dist/conciv-handle.global.js'), 'utf8')
  return `<!doctype html><html><head>
    <meta charset="utf-8">
  </head><body>
    ${body ?? '<div id="probe">page-bus-ok</div>'}
    <script>${handleBundle}</script>
  </body></html>`
}

export async function reserveDeadPort(): Promise<{base: string; port: number}> {
  const probe: Server = createServer()
  const {port} = await listenLocal(probe)
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return {base: `http://127.0.0.1:${port}`, port}
}
