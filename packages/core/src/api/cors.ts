import {handleCors, type CorsOptions, type H3, type H3Event} from 'h3'
import {AIDX_SESSION_HEADER} from '@aidx/protocol/chat-types'

// DELETE is needed for forgetting a session; the aidx-session-id header rides every session-scoped
// request, so it must be allow-listed or the browser's preflight blocks the request cross-origin.
const corsOptions: CorsOptions = {
  origin: () => true,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['content-type', AIDX_SESSION_HEADER],
}

export function registerCors(app: H3): void {
  app.use((event, next) => {
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
