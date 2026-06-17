import {handleCors, type CorsOptions, type H3, type H3Event} from 'h3'
import {AIDX_SESSION_HEADER} from '@opendui/aidx-protocol/chat-types'

// The core server binds to loopback (127.0.0.1) and serves a dev tool whose verbs include `eval`
// and live React `override` — arbitrary code/state mutation in the dev app. Without an origin
// guard, ANY website the developer visits could `fetch` these endpoints cross-origin. So we trust
// only: (a) requests with no Origin (the CLI / MCP client / same-origin — non-browser callers), and
// (b) browser requests whose Origin is loopback (the widget, served from the local dev server on
// whatever port) or an explicitly-allowed origin. A public site (evil.com) is neither → rejected.
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
  if (!origin) return true // no Origin header → non-browser caller (CLI, MCP, same-origin)
  return isLoopback(origin) || extra.has(origin)
}

// The Host header can't be forged by page JS, so a loopback Host blocks DNS-rebinding (where a
// malicious domain resolves to 127.0.0.1). Reject anything whose host isn't loopback. Absent Host
// (some non-browser clients) is allowed.
function hostAllowed(host: string | null): boolean {
  if (!host) return true
  const hostname = host.split(':')[0] ?? host
  return LOOPBACK_HOSTS.has(hostname)
}

export function registerCors(app: H3, allowedOrigins: string[] = []): void {
  const extra = new Set(allowedOrigins)
  const corsOptions: CorsOptions = {
    // Reflect only allowed origins so the browser never exposes responses to a disallowed site.
    origin: (origin) => originAllowed(origin, extra),
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['content-type', AIDX_SESSION_HEADER],
  }
  app.use((event, next) => {
    const origin = event.req.headers.get('origin')
    // Actively reject (not just withhold CORS headers) so a no-preflight "simple" cross-origin POST
    // can't still execute a mutation. Also block non-loopback Host (DNS rebinding).
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
