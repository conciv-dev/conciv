import {handleCors, type CorsOptions, type H3, type H3Event} from 'h3'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

function isLoopback(value: string): boolean {
  const host = hostnameOf(value)
  return host !== null && LOOPBACK_HOSTS.has(host)
}

export function originAllowed(origin: string | null, extra: ReadonlySet<string>): boolean {
  if (!origin) return true
  return isLoopback(origin) || extra.has(origin)
}

function hostAllowed(host: string | null): boolean {
  if (!host) return true
  const hostname = host.split(':')[0] ?? host
  return LOOPBACK_HOSTS.has(hostname)
}

export function registerCors(app: H3, allowedOrigins: string[] = []): void {
  const extra = new Set(allowedOrigins)
  const corsOptions: CorsOptions = {
    origin: (origin) => originAllowed(origin, extra),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['content-type', CONCIV_SESSION_HEADER],
  }
  app.use((event, next) => {
    const origin = event.req.headers.get('origin')

    if (!originAllowed(origin, extra) || !hostAllowed(event.req.headers.get('host'))) {
      return new Response('forbidden origin', {status: 403})
    }
    const res = handleCors(event, corsOptions)
    return res === false ? next() : res
  })
}

export function corsHeadersFor(event: H3Event): Record<string, string> {
  const origin = event.req.headers.get('origin')
  return origin
    ? {'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'origin'}
    : {}
}
