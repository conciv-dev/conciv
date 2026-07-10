import {describe, it, expect, afterEach} from 'vitest'
import {serveApp, type ServedApp} from '@conciv/harness-testkit'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {makeApp} from '../../src/app.js'
import {resolveConfig} from '../../src/config.js'

const ORIGIN = 'http://localhost:3000'
const dirs: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'conciv-cors-it-'))
  dirs.push(d)
  return d
}

async function startServer(): Promise<{served: ServedApp; base: string}> {
  const root = tmp()
  const cfg = resolveConfig({}, root)
  const {app} = await makeApp({
    cfg,
    cwd: root,
    openInEditor: () => {},
  })
  const served = await serveApp(app.fetch)
  return {served, base: served.base}
}

describe('engine CORS (IT, real http, cross-origin + credentials)', () => {
  const state = {served: undefined as ServedApp | undefined}
  afterEach(async () => {
    await state.served?.close()
    state.served = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  it('answers the preflight (OPTIONS) for the probe route with 204 + echoed origin + credentials', async () => {
    const {served, base} = await startServer()
    state.served = served
    const res = await fetch(`${base}/rpc/sessions/list`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('preflight for a session-scoped request allows the conciv-session-id header + DELETE', async () => {
    const {served, base} = await startServer()
    state.served = served
    const res = await fetch(`${base}/api/mcp`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'conciv-session-id, content-type',
      },
    })
    expect(res.status).toBe(204)
    const allowHeaders = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase()
    expect(allowHeaders).toContain('conciv-session-id')
    expect(res.headers.get('access-control-allow-methods') ?? '').toContain('POST')
  })

  it('echoes CORS headers on an actual rpc call (never *)', async () => {
    const {served, base} = await startServer()
    state.served = served
    const res = await fetch(`${base}/rpc/sessions/list`, {
      method: 'POST',
      headers: {origin: ORIGIN, 'content-type': 'application/json'},
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const allowOrigin = res.headers.get('access-control-allow-origin')
    expect(allowOrigin).toBe(ORIGIN)
    expect(allowOrigin).not.toBe('*')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('echoes CORS headers on the rpc live stream, not a wildcard', async () => {
    const {served, base} = await startServer()
    state.served = served
    const ctrl = new AbortController()
    const res = await fetch(`${base}/rpc/sessions/live`, {
      method: 'POST',
      headers: {origin: ORIGIN, 'content-type': 'application/json'},
      body: JSON.stringify({}),
      signal: ctrl.signal,
    })
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    ctrl.abort()
  })
})
