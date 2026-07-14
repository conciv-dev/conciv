import type {IncomingMessage, OutgoingHttpHeader, ServerResponse} from 'node:http'
import {EXTENSIONS_ROUTE} from '@conciv/extension-compiler/extensions'
import type {WidgetConfig} from '@conciv/protocol/config-types'

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void

export {EXTENSIONS_ROUTE}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export type HtmlTag = {tag: string; attrs: Record<string, string | boolean>; injectTo: 'head'}

export function htmlTags(corePort: number, opts: {widget?: WidgetConfig}): HtmlTag[] {
  return [
    {tag: 'meta', attrs: {name: 'pw-api-base', content: `http://127.0.0.1:${corePort}`}, injectTo: 'head'},
    {tag: 'meta', attrs: {name: 'pw-widget', content: JSON.stringify(opts.widget ?? {})}, injectTo: 'head'},
    {tag: 'script', attrs: {type: 'module', src: EXTENSIONS_ROUTE}, injectTo: 'head'},
  ]
}

export function widgetTags(apiBase: string, widgetConfig?: WidgetConfig): string {
  return (
    `<meta name="pw-api-base" content="${escapeAttr(apiBase)}">` +
    `<meta name="pw-widget" content="${escapeAttr(JSON.stringify(widgetConfig ?? {}))}">` +
    `<script type="module" src="${escapeAttr(EXTENSIONS_ROUTE)}"></script>`
  )
}

function injectInto(html: string, tags: string): string {
  if (html.includes('</head>')) return html.replace('</head>', `${tags}</head>`)
  if (html.includes('</body>')) return html.replace('</body>', `${tags}</body>`)
  return `${tags}${html}`
}

function toBuffer(chunk: unknown): Buffer | null {
  if (typeof chunk === 'string') return Buffer.from(chunk)
  if (Buffer.isBuffer(chunk)) return chunk
  if (chunk instanceof Uint8Array) return Buffer.from(chunk)
  return null
}

function toHeaderValue(v: unknown): OutgoingHttpHeader {
  if (typeof v === 'string' || typeof v === 'number') return v
  if (Array.isArray(v) && v.every((x): x is string => typeof x === 'string')) return v
  return String(v)
}

function headerPairs(headers: unknown): Array<[string, OutgoingHttpHeader]> {
  if (Array.isArray(headers)) {
    const pairs: Array<[string, OutgoingHttpHeader]> = []
    for (let i = 0; i + 1 < headers.length; i += 2) pairs.push([String(headers[i]), toHeaderValue(headers[i + 1])])
    return pairs
  }
  if (headers && typeof headers === 'object') {
    return Object.entries(headers)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]): [string, OutgoingHttpHeader] => [k, toHeaderValue(v)])
  }
  return []
}

function contentTypeFromPairs(pairs: Array<[string, OutgoingHttpHeader]>): string {
  const hit = pairs.find(([k]) => k.toLowerCase() === 'content-type')
  if (!hit) return ''
  const v = hit[1]
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.join(' ')
  return String(v)
}

function trailingCallback(args: ReadonlyArray<unknown>): (() => void) | undefined {
  const last = args[args.length - 1]
  return typeof last === 'function' ? () => void last() : undefined
}

const NESTED_FETCH_DESTS = new Set(['iframe', 'frame', 'embed', 'object'])

export function makeWidgetInject(apiBase: string, widgetConfig?: WidgetConfig): Middleware {
  const tags = widgetTags(apiBase, widgetConfig)
  return (req, res, next) => {
    const fetchDest = req.headers['sec-fetch-dest']
    if (typeof fetchDest === 'string' && NESTED_FETCH_DESTS.has(fetchDest)) return next()

    const chunks: Buffer[] = []
    const realWrite = res.write
    const realEnd = res.end
    const realWriteHead = res.writeHead

    const forward = <R>(fn: (...a: never[]) => R, args: unknown[]): R => Reflect.apply(fn, res, args)

    const state: {mode: 'undecided' | 'buffer' | 'passthrough'} = {mode: 'undecided'}
    const isNonHtml = (ct: string): boolean => ct !== '' && !ct.includes('text/html')
    const ensureMode = (ctHint: string): void => {
      if (state.mode !== 'undecided') return
      const ct = ctHint || String(res.getHeader('content-type') ?? '')
      state.mode = isNonHtml(ct) ? 'passthrough' : 'buffer'
    }

    const patchedWriteHead = (...args: unknown[]): ServerResponse => {
      const status = typeof args[0] === 'number' ? args[0] : res.statusCode
      const pairs = headerPairs(args.find((x, i) => i > 0 && x !== null && typeof x === 'object'))
      ensureMode(contentTypeFromPairs(pairs))
      if (state.mode === 'passthrough') return forward(realWriteHead, args)

      res.statusCode = status
      for (const [k, v] of pairs) res.setHeader(k, v)
      return res
    }
    res.writeHead = patchedWriteHead

    const patchedWrite = (...args: unknown[]): boolean => {
      ensureMode('')
      if (state.mode === 'passthrough') return forward(realWrite, args)
      const buf = toBuffer(args[0])
      if (buf) chunks.push(buf)
      const cb = trailingCallback(args)
      if (cb) cb()
      return true
    }
    res.write = patchedWrite

    const patchedEnd = (...args: unknown[]): ServerResponse => {
      ensureMode('')
      if (state.mode === 'passthrough') return forward(realEnd, args)
      const tail = toBuffer(args[0])
      if (tail) chunks.push(tail)
      const cb = trailingCallback(args)
      const body = Buffer.concat(chunks).toString('utf8')

      const shouldInject =
        String(res.getHeader('content-type') ?? '').includes('text/html') && !body.includes(EXTENSIONS_ROUTE)
      const out = shouldInject ? injectInto(body, tags) : body

      res.write = realWrite
      res.end = realEnd
      res.writeHead = realWriteHead
      res.removeHeader('transfer-encoding')
      res.setHeader('content-length', Buffer.byteLength(out))
      return cb ? forward(realEnd, [out, cb]) : forward(realEnd, [out])
    }
    res.end = patchedEnd

    next()
  }
}
