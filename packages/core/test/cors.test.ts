import {H3} from 'h3'
import {describe, expect, it} from 'vitest'
import {registerCors} from '../src/api/cors.js'

describe('cors PATCH', () => {
  it('advertises PATCH in the preflight method allowlist', async () => {
    const app = new H3()
    registerCors(app)
    app.get('/x', () => 'ok')
    const res = await app.fetch(
      new Request('http://127.0.0.1/x', {
        method: 'OPTIONS',
        headers: {origin: 'http://localhost:3000', 'access-control-request-method': 'PATCH'},
      }),
    )
    expect(res.headers.get('access-control-allow-methods')).toContain('PATCH')
  })
})
