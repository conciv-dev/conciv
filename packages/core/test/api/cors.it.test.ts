import {describe, it, expect, afterEach} from 'vitest'
import {serve, type Server} from 'srvx'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {makeApp} from '../../src/app.js'
import {resolveConfig} from '../../src/config.js'

// Real HTTP round-trip for the engine's CORS. The widget lives on the host app's origin
// (e.g. http://localhost:3000) and talks to the standalone engine on its own port — cross-origin,
// with credentials (`credentials: 'include'` / `withCredentials: true`). So every engine route
// must echo the caller's Origin and set allow-credentials, and preflight must 204. A wildcard
// `access-control-allow-origin: *` is INVALID with credentials and the browser blocks it.

const ORIGIN = 'http://localhost:3000'
const dirs: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'conciv-cors-it-'))
  dirs.push(d)
  return d
}

async function startServer(): Promise<{server: Server; base: string}> {
  const root = tmp()
  const cfg = resolveConfig({}, root)
  const {app} = await makeApp({
    cfg,
    cwd: root,
    openInEditor: () => {},
    spawnHarness: () => {
      throw new Error('spawnHarness must not be called by these read-only CORS probes')
    },
  })
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  return {server, base: new URL(server.url ?? '').origin}
}

describe('engine CORS (IT, real http, cross-origin + credentials)', () => {
  const state = {server: undefined as Server | undefined}
  afterEach(async () => {
    if (state.server) await state.server.close()
    state.server = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  it('answers the preflight (OPTIONS) for the probe route with 204 + echoed origin + credentials', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await fetch(`${base}/api/chat/models`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'content-type',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('preflight for a session-scoped request allows the conciv-session-id header + DELETE', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await fetch(`${base}/api/chat/session`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'conciv-session-id, content-type',
      },
    })
    expect(res.status).toBe(204)
    const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase()
    expect(allowHeaders).toContain('conciv-session-id')
    expect(res.headers.get('access-control-allow-methods') ?? '').toContain('DELETE')
  })

  it('echoes CORS headers on the actual probe GET /api/chat/models (never *)', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await fetch(`${base}/api/chat/models`, {headers: {origin: ORIGIN}})
    expect(res.status).toBe(200)
    const allowOrigin = res.headers.get('access-control-allow-origin')
    expect(allowOrigin).toBe(ORIGIN)
    expect(allowOrigin).not.toBe('*')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('echoes CORS headers on the SSE stream (page/stream), not a wildcard', async () => {
    const {server, base} = await startServer()
    state.server = server
    const ctrl = new AbortController()
    const res = await fetch(`${base}/api/page/stream`, {headers: {origin: ORIGIN}, signal: ctrl.signal})
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    ctrl.abort()
  })
})
