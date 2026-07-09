import {describe, it, expect, afterEach, beforeAll, afterAll} from 'vitest'
import {serveApp, type ServedApp} from '@conciv/harness-testkit'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {StatePlane} from '@conciv/db/server'
import {makeApp} from '../../src/app.js'
import {resolveConfig} from '../../src/config.js'
import {markerWriter} from '../../src/store/markers.js'
import {startTestStore} from '../helpers/state-plane.js'

const ORIGIN = 'http://localhost:3000'
const dirs: string[] = []

let plane: StatePlane

beforeAll(async () => {
  plane = await startTestStore()
}, 120000)

afterAll(async () => plane.stop())

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
    store: plane.store,
    markers: markerWriter(plane.records),
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
    const {served, base} = await startServer()
    state.served = served
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
    const {served, base} = await startServer()
    state.served = served
    const res = await fetch(`${base}/api/chat/models`, {headers: {origin: ORIGIN}})
    expect(res.status).toBe(200)
    const allowOrigin = res.headers.get('access-control-allow-origin')
    expect(allowOrigin).toBe(ORIGIN)
    expect(allowOrigin).not.toBe('*')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('echoes CORS headers on the SSE stream (page/stream), not a wildcard', async () => {
    const {served, base} = await startServer()
    state.served = served
    const ctrl = new AbortController()
    const res = await fetch(`${base}/api/page/stream`, {headers: {origin: ORIGIN}, signal: ctrl.signal})
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    ctrl.abort()
  })
})
