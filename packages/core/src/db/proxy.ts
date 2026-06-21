import type {H3, H3Event} from 'h3'
import {corsHeadersFor} from '../api/cors.js'

const REQUEST_HOP_BY_HOP = new Set(['host', 'origin', 'connection', 'content-length', 'accept-encoding'])
const RESPONSE_HOP_BY_HOP = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection'])

function forwardHeaders(req: Request): Headers {
  const out = new Headers()
  req.headers.forEach((value, key) => {
    if (!REQUEST_HOP_BY_HOP.has(key)) out.set(key, value)
  })
  return out
}

function responseHeaders(upstream: Response, event: H3Event): Headers {
  const out = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!RESPONSE_HOP_BY_HOP.has(key)) out.set(key, value)
  })
  for (const [key, value] of Object.entries(corsHeadersFor(event))) out.set(key, value)
  return out
}

async function forward(event: H3Event, trailBaseUrl: string): Promise<Response> {
  const incoming = new URL(event.req.url)
  const target = `${trailBaseUrl}${incoming.pathname}${incoming.search}`
  const method = event.req.method
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const body = hasBody ? await event.req.text() : undefined
  const upstream = await fetch(target, {method, headers: forwardHeaders(event.req), body})
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders(upstream, event),
  })
}

export function registerDbProxy(app: H3, trailBaseUrl: string): void {
  app.all('/api/records/v1/**', (event) => forward(event, trailBaseUrl))
}
