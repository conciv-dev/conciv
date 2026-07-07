import {Hono} from 'hono'
import {describe, expect, it} from 'vitest'
import {corsMiddleware, type CorsVars} from '../src/api/cors.js'

describe('cors PATCH', () => {
  it('advertises PATCH in the preflight method allowlist', async () => {
    const app = new Hono<{Variables: CorsVars}>()
      .use(async (c, next) => {
        c.set('cors', {allowedOrigins: []})
        await next()
      })
      .use(corsMiddleware())
      .get('/x', (c) => c.text('ok'))
    const res = await app.request('http://127.0.0.1/x', {
      method: 'OPTIONS',
      headers: {origin: 'http://localhost:3000', 'access-control-request-method': 'PATCH'},
    })
    expect(res.headers.get('access-control-allow-methods')).toContain('PATCH')
  })
})
