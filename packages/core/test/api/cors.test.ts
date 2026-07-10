import {describe, it, expect} from 'vitest'
import {Hono} from 'hono'
import {corsMiddleware, originAllowed, type CorsVars} from '../../src/cors.js'

function corsApp(allowed: string[] = []) {
  return new Hono<{Variables: CorsVars}>()
    .use(async (c, next) => {
      c.set('cors', {allowedOrigins: allowed})
      await next()
    })
    .use(corsMiddleware())
}

describe('originAllowed', () => {
  const none = new Set<string>()
  it('allows a missing Origin (non-browser caller: CLI, MCP)', () => {
    expect(originAllowed(null, none)).toBe(true)
  })
  it('allows loopback origins on any port', () => {
    expect(originAllowed('http://localhost:5173', none)).toBe(true)
    expect(originAllowed('http://127.0.0.1:3000', none)).toBe(true)
  })
  it('rejects public origins', () => {
    expect(originAllowed('https://evil.com', none)).toBe(false)
    expect(originAllowed('http://attacker.localhost.evil.com', none)).toBe(false)
  })
  it('allows an explicitly-listed extra origin (LAN dev)', () => {
    expect(originAllowed('http://192.168.1.5:5173', new Set(['http://192.168.1.5:5173']))).toBe(true)
    expect(originAllowed('http://192.168.1.9:5173', new Set(['http://192.168.1.5:5173']))).toBe(false)
  })
})

describe('corsMiddleware', () => {
  function makeApp(allowed: string[] = []) {
    return corsApp(allowed).get('/api/ping', (c) => c.json({ok: true}))
  }

  it('403s a cross-origin (public site) request', async () => {
    const res = await makeApp().request('http://127.0.0.1/api/ping', {headers: {origin: 'https://evil.com'}})
    expect(res.status).toBe(403)
  })

  it('allows a loopback-origin request and reflects the origin', async () => {
    const res = await makeApp().request('http://127.0.0.1/api/ping', {headers: {origin: 'http://localhost:5173'}})
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('allows a no-Origin request (CLI/MCP)', async () => {
    const res = await makeApp().request('http://127.0.0.1/api/ping')
    expect(res.status).toBe(200)
  })
})
