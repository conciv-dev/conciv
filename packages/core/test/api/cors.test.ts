import {describe, it, expect, afterEach} from 'vitest'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {registerCors, originAllowed} from '../../src/api/cors.js'

// The CORS guard is the dev server's only defense against a malicious website fetching the
// loopback API cross-origin (eval/override = code/state execution). Loopback + no-Origin pass;
// public origins are actively rejected (403), not merely denied CORS headers.

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

describe('registerCors middleware (real http)', () => {
  let server: Server | undefined
  afterEach(async () => {
    await server?.close(true)
    server = undefined
  })

  async function start(allowed: string[] = []): Promise<string> {
    const app = new H3()
    registerCors(app, allowed)
    app.get('/api/ping', () => ({ok: true}))
    server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
    await server.ready()
    return new URL(server.url ?? '').origin
  }

  it('403s a cross-origin (public site) request', async () => {
    const base = await start()
    const res = await fetch(`${base}/api/ping`, {headers: {origin: 'https://evil.com'}})
    expect(res.status).toBe(403)
  })

  it('allows a loopback-origin request and reflects the origin', async () => {
    const base = await start()
    const res = await fetch(`${base}/api/ping`, {headers: {origin: 'http://localhost:5173'}})
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('allows a no-Origin request (CLI/MCP)', async () => {
    const base = await start()
    const res = await fetch(`${base}/api/ping`)
    expect(res.status).toBe(200)
  })
})
