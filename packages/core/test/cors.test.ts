import {Hono} from 'hono'
import {describe, expect, it} from 'vitest'
import {corsMiddleware} from '../src/api/cors.js'

describe('cors PATCH', () => {
  it('advertises PATCH in the preflight method allowlist', async () => {
    const app = new Hono()
    app.use(corsMiddleware())
    app.get('/x', (c) => c.text('ok'))
    const res = await app.request('http://127.0.0.1/x', {
      method: 'OPTIONS',
      headers: {origin: 'http://localhost:3000', 'access-control-request-method': 'PATCH'},
    })
    expect(res.headers.get('access-control-allow-methods')).toContain('PATCH')
  })
})
