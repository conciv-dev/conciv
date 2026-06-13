import type {IncomingMessage, ServerResponse} from 'node:http'
import {isVitestUnavailable, type VitestManager} from './vitest-manager.js'

// The /__pw/tools/vitest/* + /__pw/vitest/stream connect middleware. Mirrors
// tools-route.ts (JSON + CORS helpers) and the page-bus SSE shape: the widget's
// VitestPanel subscribes to the stream; the agent drives runs over the JSON routes.

type NextFn = (err?: unknown) => void
// The card is now rendered from the agent's `devgent tools vitest run` tool-result in the chat
// transcript (so it's in history + persists), not injected as a side-channel gen-UI spec.
// The card's "Open <file>:<line>" action posts to /__pw/tools/open (tools-route), so this
// route needs no deps.

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

function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : undefined
}

// Translate a typed "vitest unavailable" failure (no vitest in the previewed app, or an
// unsupported API shape) into a 422 JSON body rather than letting it bubble to a 500.
// Returns true when handled; the caller returns immediately.
function send422IfUnavailable(res: ServerResponse, e: unknown): boolean {
  if (!isVitestUnavailable(e)) return false
  sendJson(res, {available: false, error: e.message}, 422)
  return true
}

export function makeVitestRoute(
  mgr: VitestManager,
): (req: IncomingMessage, res: ServerResponse, next: NextFn) => Promise<void> {
  return async (req, res, next) => {
    const raw = req.url ?? ''
    if (!raw.startsWith('/__pw/tools/vitest/') && raw !== '/__pw/vitest/stream') return next()
    const url = new URL(raw, 'http://x')
    const path = url.pathname

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.setHeader('access-control-allow-origin', '*')
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
      res.setHeader('access-control-allow-headers', 'content-type')
      res.end()
      return
    }

    if (path === '/__pw/vitest/stream') {
      res.statusCode = 200
      res.setHeader('content-type', 'text/event-stream')
      res.setHeader('cache-control', 'no-cache')
      res.setHeader('connection', 'keep-alive')
      res.setHeader('access-control-allow-origin', '*')
      res.write(': vitest-bus open\n\n')
      // emitSnapshot is pure (never inits vitest), so it can't throw even when the app has
      // no vitest — it reports {watching:false, summary:0…} and the stream stays open.
      res.write(`data: ${JSON.stringify(mgr.emitSnapshot())}\n\n`)
      // Guard each write: after a client half-closes the socket, res.write throws
      // ERR_STREAM_WRITE_AFTER_END. Without this guard the throw propagates out of the
      // manager's emit() for-loop and starves every OTHER subscriber. On failure, drop
      // this subscriber so the loop continues delivering to the rest.
      const unsub = mgr.subscribeRaw((e) => {
        try {
          res.write(`data: ${JSON.stringify(e)}\n\n`)
        } catch {
          unsub()
        }
      })
      req.on('close', unsub)
      return
    }

    if (path === '/__pw/tools/vitest/list') {
      try {
        const listed = await mgr.list(url.searchParams.get('failed') === '1')
        return sendJson(res, listed)
      } catch (e) {
        if (send422IfUnavailable(res, e)) return
        throw e
      }
    }
    if (path === '/__pw/tools/vitest/status') return sendJson(res, mgr.status())
    // Defensive @vitest/ui link-out: returns {available:false} when the app has no
    // @vitest/ui dep or the URL can't be determined; the widget hides the link then.
    if (path === '/__pw/tools/vitest/ui') return sendJson(res, await mgr.openUiServer())
    if (path === '/__pw/tools/vitest/run' && req.method === 'POST') {
      const body = await readJson(req)
      try {
        const result = await mgr.run({
          patterns: asStringArray(body.patterns),
          testNamePattern: typeof body.testNamePattern === 'string' ? body.testNamePattern : undefined,
          failedOnly: body.failedOnly === true,
        })
        return sendJson(res, result)
      } catch (e) {
        if (send422IfUnavailable(res, e)) return
        throw e
      }
    }
    if (path === '/__pw/tools/vitest/stop' && req.method === 'POST') {
      await mgr.stop()
      return sendJson(res, {stopped: true})
    }
    return next()
  }
}
