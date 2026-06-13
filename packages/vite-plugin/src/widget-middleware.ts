import type {IncomingMessage, OutgoingHttpHeader, ServerResponse} from 'node:http'
import {createReadStream} from 'node:fs'

// The widget injection + serving middlewares. Kept framework-agnostic (plain node http types)
// so they work for SSR frameworks (TanStack Start) and plain index.html apps alike: the inject
// middleware rewrites the FINAL html response rather than relying on vite's transformIndexHtml
// (which only fires for a static index.html). Both are plain connect-style middlewares.

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void

// Where the plugin serves the bundled @devgent/widget global by default.
export const DEFAULT_WIDGET_ROUTE = '/@devgent/widget.js'

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// The tags injected into the page: an empty api-base (⇒ same-origin /__pw), the preview id,
// and the widget bundle script. `defer` so it runs after the DOM is parsed (it mounts onto
// document.body).
export function widgetTags(widgetUrl: string, previewId: string): string {
  return (
    `<meta name="pw-api-base" content="">` +
    `<meta name="pw-preview-id" content="${escapeAttr(previewId)}">` +
    `<script src="${escapeAttr(widgetUrl)}" defer></script>`
  )
}

function injectInto(html: string, tags: string): string {
  if (html.includes('</head>')) return html.replace('</head>', `${tags}</head>`)
  if (html.includes('</body>')) return html.replace('</body>', `${tags}</body>`)
  return `${tags}${html}`
}

// Serve the prebuilt widget global bundle at `route`, so a host app needs only the plugin —
// no separate static-serve wiring.
export function makeWidgetServe(filePath: string, route: string = DEFAULT_WIDGET_ROUTE): Middleware {
  return (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]
    if (path !== route) {
      next()
      return
    }
    res.setHeader('content-type', 'text/javascript')
    createReadStream(filePath).pipe(res)
  }
}

function toBuffer(chunk: unknown): Buffer | null {
  if (typeof chunk === 'string') return Buffer.from(chunk)
  if (Buffer.isBuffer(chunk)) return chunk
  if (chunk instanceof Uint8Array) return Buffer.from(chunk)
  return null
}

// writeHead headers come in two shapes: an OutgoingHttpHeaders object, or a flat
// [k, v, k, v, …] array (srvx / TanStack Start's runtime uses the array form). Normalize both
// to [name, value] pairs.
function headerPairs(headers: unknown): Array<[string, OutgoingHttpHeader]> {
  if (Array.isArray(headers)) {
    return headers.reduce<Array<[string, OutgoingHttpHeader]>>((pairs, _x, i, arr) => {
      if (i % 2 === 0 && i + 1 < arr.length) pairs.push([String(arr[i]), arr[i + 1] as OutgoingHttpHeader])
      return pairs
    }, [])
  }
  if (headers && typeof headers === 'object') {
    return Object.entries(headers).filter(([, v]) => v !== undefined) as Array<[string, OutgoingHttpHeader]>
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
  return typeof last === 'function' ? (last as () => void) : undefined
}

// Inject the widget into every text/html response by buffering the body and inserting the tags
// before </head> (fallback </body>). The content-type often isn't known until late (SSR
// runtimes call writeHead with a flat header array, then stream the body), so we BUFFER whenever
// the type isn't yet definitively non-html and only decide at end() from the final headers.
// writeHead's headers are applied via setHeader so a deferred flush still emits them. Non-html
// responses (assets, SSE, JSON) stream through untouched, and a document already carrying the
// widget (e.g. a static app where transformIndexHtml injected it) isn't re-injected.
export function makeWidgetInject(widgetUrl: string, previewId: string): Middleware {
  const tags = widgetTags(widgetUrl, previewId)
  return (_req, res, next) => {
    const chunks: Buffer[] = []
    const realWrite = res.write.bind(res)
    const realEnd = res.end.bind(res)
    const realWriteHead = res.writeHead.bind(res)
    // 'passthrough' once we know it's non-html (stream as-is); 'buffer' otherwise (html or still
    // unknown — capture the body, decide at end). Latched on the first writeHead/write/end.
    const state: {mode: 'undecided' | 'buffer' | 'passthrough'} = {mode: 'undecided'}
    const isNonHtml = (ct: string): boolean => ct !== '' && !ct.includes('text/html')
    const ensureMode = (ctHint: string): void => {
      if (state.mode !== 'undecided') return
      const ct = ctHint || String(res.getHeader('content-type') ?? '')
      state.mode = isNonHtml(ct) ? 'passthrough' : 'buffer'
    }

    res.writeHead = function patchedWriteHead(
      this: ServerResponse,
      ...args: Parameters<ServerResponse['writeHead']>
    ): ServerResponse {
      const status = typeof args[0] === 'number' ? args[0] : res.statusCode
      const pairs = headerPairs(args.find((x, i) => i > 0 && x !== null && typeof x === 'object'))
      ensureMode(contentTypeFromPairs(pairs))
      if (state.mode === 'passthrough') return realWriteHead(...args)
      // Buffer/defer: record status + headers so end() can flush them with the injected length.
      res.statusCode = status
      for (const [k, v] of pairs) res.setHeader(k, v)
      return res
    } as ServerResponse['writeHead']

    res.write = function patchedWrite(this: ServerResponse, ...args: Parameters<ServerResponse['write']>): boolean {
      ensureMode('')
      if (state.mode === 'passthrough') return realWrite(...args)
      const buf = toBuffer(args[0])
      if (buf) chunks.push(buf)
      const cb = trailingCallback(args)
      if (cb) cb()
      return true
    } as ServerResponse['write']

    res.end = function patchedEnd(this: ServerResponse, ...args: Parameters<ServerResponse['end']>): ServerResponse {
      ensureMode('')
      if (state.mode === 'passthrough') return realEnd(...args)
      const tail = toBuffer(args[0])
      if (tail) chunks.push(tail)
      const cb = trailingCallback(args)
      const body = Buffer.concat(chunks).toString('utf8')
      // Decide for real now that all headers are set. Only inject into actual html documents.
      const shouldInject =
        String(res.getHeader('content-type') ?? '').includes('text/html') && !body.includes(widgetUrl)
      const out = shouldInject ? injectInto(body, tags) : body
      // Restore the originals before flushing: Node's end() calls this.write() internally, and
      // re-entering our buffering write would swallow the body.
      res.write = realWrite
      res.end = realEnd
      res.writeHead = realWriteHead
      res.removeHeader('transfer-encoding')
      res.setHeader('content-length', Buffer.byteLength(out))
      return cb ? realEnd(out, cb) : realEnd(out)
    } as ServerResponse['end']

    next()
  }
}
