import type {H3, H3Event} from 'h3'
import {corsHeadersFor} from '../api/cors.js'

const HOP_BY_HOP = new Set(['host', 'origin', 'connection', 'content-length', 'accept-encoding'])

function forwardHeaders(req: Request): Headers {
  const out = new Headers()
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key)) out.set(key, value)
  })
  return out
}

async function forward(event: H3Event, trailBaseUrl: string): Promise<Response> {
  const incoming = new URL(event.req.url)
  const target = `${trailBaseUrl}${incoming.pathname}${incoming.search}`
  const method = event.req.method
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const body = hasBody ? await event.req.text() : undefined
  const upstream = await fetch(target, {method, headers: forwardHeaders(event.req), body})
  const headers = new Headers(upstream.headers)
  const cors = corsHeadersFor(event)
  for (const [key, value] of Object.entries(cors)) headers.set(key, value)
  return new Response(upstream.body, {status: upstream.status, statusText: upstream.statusText, headers})
}

export function registerDbProxy(app: H3, trailBaseUrl: string): void {
  app.all('/api/records/v1/**', (event) => forward(event, trailBaseUrl))
}
