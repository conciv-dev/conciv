import {cors} from 'hono/cors'
import type {MiddlewareHandler} from 'hono'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'] as const
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(LOOPBACK_HOSTNAMES)

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isLoopbackUrl(url: URL | null): boolean {
  if (!url) return false
  return LOOPBACK_HOSTS.has(url.hostname)
}

export function originAllowed(origin: string | null, extra: ReadonlySet<string>): boolean {
  if (!origin) return true
  return isLoopbackUrl(parseUrl(origin)) || extra.has(origin)
}

function loopbackAuthority(host: string | null): URL | null {
  if (!host) return null
  const url = parseUrl(`http://${host}`)
  if (!url) return null
  if (url.username !== '' || url.password !== '') return null
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null
  if (!isLoopbackUrl(url)) return null
  return url
}

export function loopbackHostAllowlist(host: string | null): string[] {
  const url = loopbackAuthority(host)
  if (!url) return []
  const port = url.port === '' ? '' : `:${url.port}`
  return LOOPBACK_HOSTNAMES.map((hostname) => `${hostname}${port}`)
}

function hostAllowed(host: string | null): boolean {
  return loopbackAuthority(host) !== null
}

export type CorsVars = {cors: {allowedOrigins: string[]}}

export function corsMiddleware(): MiddlewareHandler<{Variables: CorsVars}> {
  return async (c, next) => {
    const extra = new Set(c.var.cors.allowedOrigins)
    const origin = c.req.header('origin') ?? null
    if (!hostAllowed(c.req.header('host') ?? null)) return c.text('forbidden host', 403)
    if (!originAllowed(origin, extra)) return c.text('forbidden origin', 403)
    const corsHandler = cors({
      origin: (candidate) => (originAllowed(candidate, extra) ? candidate : ''),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['content-type', CONCIV_SESSION_HEADER],
    })
    return corsHandler(c, next)
  }
}
