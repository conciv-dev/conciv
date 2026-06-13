import type {IncomingMessage, ServerResponse} from 'node:http'
import {viteConfig, viteResolve, viteGraph, viteTransform, viteUrls, type ViteLike} from './tools-layer.js'
import {isMutating, type PageQuery} from '@devgent/protocol/page-protocol'
import {makeJournal} from './page-journal.js'

// The /__pw/tools/* connect middleware: the agent-facing surface (the `devgent tools` CLI
// HTTP-calls these). `vite/*` reads the live ViteDevServer; `page/*` round-trips to the
// live browser over the page-bus (a dedicated SSE stream the injected widget subscribes
// to, answering over an HTTP POST — the widget is a plain <script>, so it can't use Vite's
// HMR socket); `open` launches the user's editor.

export type ToolsServer = ViteLike
export type OpenInEditor = (file: string, line?: number) => void
type NextFn = (err?: unknown) => void

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('access-control-allow-origin', '*')
  res.end(JSON.stringify(body))
}

// Build a typed PageQuery from untrusted query-string/body input. `since`/`timeout` are
// numeric; everything else is a string. Unknown keys are dropped.
function coercePageQuery(verb: string, raw: Record<string, unknown>): Omit<PageQuery, 'requestId'> {
  const str = (k: string): string | undefined => (typeof raw[k] === 'string' ? (raw[k] as string) : undefined)
  const num = (k: string): number | undefined => {
    const n = Number(raw[k])
    return raw[k] !== undefined && raw[k] !== '' && !Number.isNaN(n) ? n : undefined
  }
  return {
    kind: verb as PageQuery['kind'],
    selector: str('selector'),
    ref: str('ref'),
    name: str('name'),
    value: str('value'),
    class: str('class'),
    prop: str('prop'),
    text: str('text'),
    html: str('html'),
    key: str('key'),
    code: str('code'),
    position: str('position') as PageQuery['position'],
    state: str('state') as PageQuery['state'],
    since: num('since'),
    timeout: num('timeout'),
  }
}

// The journaled args = the meaningful params minus the target (ref/selector) and kind.
function pageArgs(query: Omit<PageQuery, 'requestId'>): Record<string, unknown> {
  const {kind: _kind, ref: _ref, selector: _selector, since: _since, ...rest} = query
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
}

// The page-bus: deliver a query to the widget over the SSE stream (/__pw/tools/page-stream)
// and resolve when the widget POSTs the matching answer to /__pw/tools/page-reply.
function makePageBus(timeoutMs = 5000) {
  const pending = new Map<string, (data: unknown) => void>()
  const subscribers = new Set<ServerResponse>()
  const idState = {n: 0}

  function resolve(requestId: string, data: unknown): void {
    const fn = pending.get(requestId)
    if (!fn) return
    pending.delete(requestId)
    fn(data)
  }

  // Register an SSE subscriber (the widget). Returns an unsubscribe fn.
  function subscribe(res: ServerResponse): () => void {
    subscribers.add(res)
    return () => subscribers.delete(res)
  }

  function ask(query: Omit<PageQuery, 'requestId'>): Promise<unknown> {
    idState.n += 1
    const requestId = `pq${idState.n}`
    const ms = typeof query.timeout === 'number' ? query.timeout + 1000 : timeoutMs
    return new Promise((res) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        res({error: 'page did not reply (no widget connected?)'})
      }, ms)
      pending.set(requestId, (d) => {
        clearTimeout(timer)
        res(d)
      })
      const event = `data: ${JSON.stringify({requestId, ...query})}\n\n`
      if (subscribers.size === 0) {
        clearTimeout(timer)
        pending.delete(requestId)
        res({error: 'no widget connected'})
        return
      }
      for (const sub of subscribers) sub.write(event)
    })
  }

  return {ask, resolve, subscribe}
}

export function makeToolsRoute(
  server: ToolsServer,
  openInEditor: OpenInEditor,
): (req: IncomingMessage, res: ServerResponse, next: NextFn) => Promise<void> {
  const pageBus = makePageBus()
  const askPage = pageBus.ask
  const journal = makeJournal()
  return async (req, res, next) => {
    const rawUrl = req.url ?? ''
    if (!rawUrl.startsWith('/__pw/tools/')) return next()
    const url = new URL(rawUrl, 'http://x')
    const path = url.pathname
    const q = url.searchParams

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.setHeader('access-control-allow-origin', '*')
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
      res.setHeader('access-control-allow-headers', 'content-type')
      res.end()
      return
    }

    if (path === '/__pw/tools/vite/config') return sendJson(res, viteConfig(server))
    if (path === '/__pw/tools/vite/resolve') {
      return sendJson(res, await viteResolve(server, q.get('spec') ?? '', q.get('importer') ?? undefined))
    }
    if (path === '/__pw/tools/vite/graph') return sendJson(res, viteGraph(server, q.get('file') ?? ''))
    if (path === '/__pw/tools/vite/transform') {
      return sendJson(res, await viteTransform(server, q.get('url') ?? ''))
    }
    if (path === '/__pw/tools/vite/urls') return sendJson(res, viteUrls(server))
    if (path === '/__pw/tools/vite/reload' && req.method === 'POST') {
      const body = await readJson(req)
      const mods = server.moduleGraph.getModulesByFile(String(body.file ?? ''))
      if (mods && server.reloadModule) for (const m of mods) await server.reloadModule(m)
      return sendJson(res, {reloaded: true})
    }
    if (path === '/__pw/tools/vite/restart' && req.method === 'POST') {
      const body = await readJson(req)
      await server.restart?.(Boolean(body.force))
      return sendJson(res, {restarted: true})
    }

    if (path === '/__pw/tools/open' && req.method === 'POST') {
      const body = await readJson(req)
      const file = String(body.file ?? '')
      if (!file) return sendJson(res, {error: 'file required'}, 400)
      openInEditor(file, typeof body.line === 'number' ? body.line : undefined)
      return sendJson(res, {opened: file})
    }

    // The widget subscribes here; the page-bus writes query events to it.
    if (path === '/__pw/tools/page-stream') {
      res.statusCode = 200
      res.setHeader('content-type', 'text/event-stream')
      res.setHeader('cache-control', 'no-cache')
      res.setHeader('connection', 'keep-alive')
      res.setHeader('access-control-allow-origin', '*')
      res.write(': page-bus open\n\n') // open the stream immediately
      const unsubscribe = pageBus.subscribe(res)
      req.on('close', unsubscribe)
      return
    }

    if (path === '/__pw/tools/page/changes' && req.method === 'GET') return sendJson(res, journal.list())
    if (path === '/__pw/tools/page/changes/clear' && req.method === 'POST') {
      journal.clear()
      return sendJson(res, {cleared: true})
    }
    if (path.startsWith('/__pw/tools/page/')) {
      const verb = path.slice('/__pw/tools/page/'.length)
      const raw = req.method === 'POST' ? await readJson(req) : Object.fromEntries(q.entries())
      const query = coercePageQuery(verb, raw)
      const data = (await askPage(query)) as Record<string, unknown>
      if (isMutating(verb) && !(data && typeof data === 'object' && typeof data.error === 'string')) {
        journal.append({verb, ref: query.ref, selector: query.selector, args: pageArgs(query)}, Date.now())
      }
      return sendJson(res, data)
    }

    // The widget POSTs page-query answers here, resolving the pending ask().
    if (path === '/__pw/tools/page-reply' && req.method === 'POST') {
      const body = await readJson(req)
      if (typeof body.requestId === 'string') pageBus.resolve(body.requestId, body.data)
      return sendJson(res, {ok: true})
    }

    return next()
  }
}
