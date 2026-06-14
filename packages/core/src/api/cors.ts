import {handleCors, type CorsOptions, type H3, type H3Event} from 'h3'

const corsOptions: CorsOptions = {
  origin: () => true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['content-type'],
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
