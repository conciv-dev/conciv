import {cors} from 'hono/cors'
import type {MiddlewareHandler} from 'hono'
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

export type CorsVars = {cors: {allowedOrigins: string[]}}

export function corsMiddleware(): MiddlewareHandler<{Variables: CorsVars}> {
  return async (c, next) => {
    const extra = new Set(c.var.cors.allowedOrigins)
    const origin = c.req.header('origin') ?? null
    if (!originAllowed(origin, extra) || !hostAllowed(c.req.header('host') ?? null)) {
      return c.text('forbidden origin', 403)
    }
    const corsHandler = cors({
      origin: (candidate) => (originAllowed(candidate, extra) ? candidate : ''),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['content-type', CONCIV_SESSION_HEADER],
    })
    return corsHandler(c, next)
  }
}
