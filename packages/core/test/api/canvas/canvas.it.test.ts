import {afterEach, describe, expect, it} from 'vitest'
import {serve, type Server} from 'srvx'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import * as Y from 'yjs'
import {makeApp} from '../../../src/app.js'
import {resolveConfig} from '../../../src/config.js'

const ORIGIN = 'http://localhost:3000'
const dirs: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'mandarax-canvas-it-'))
  dirs.push(d)
  return d
}

async function startServer(): Promise<{server: Server; base: string}> {
  const cfg = resolveConfig({}, tmp())
  const app = makeApp({
    cfg,
    cwd: tmp(),
    openInEditor: () => {},
    spawnHarness: () => {
      throw new Error('spawnHarness must not be called by canvas relay tests')
    },
  })
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  return {server, base: new URL(server.url ?? '').origin}
}

// Read SSE frames until `data:` lines yield a matching JSON object or timeout.
async function firstSnapshot(base: string, session: string): Promise<{type: string; update: string}> {
  const res = await fetch(`${base}/api/canvas/sync?session=${session}`, {headers: {origin: ORIGIN}})
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const {value, done} = await reader.read()
      if (done) throw new Error('stream ended before a snapshot frame')
      buffer += decoder.decode(value, {stream: true})
      const line = buffer.split('\n').find((l) => l.startsWith('data: '))
      if (line) return JSON.parse(line.slice(6))
    }
  } finally {
    await reader.cancel()
  }
}

describe('canvas relay (IT, real http + yjs)', () => {
  const state = {server: undefined as Server | undefined}
  afterEach(async () => {
    if (state.server) await state.server.close()
    state.server = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  it('accepts a posted update and serves it back in the SSE snapshot', async () => {
    const {server, base} = await startServer()
    state.server = server

    // Client builds a Yjs update adding one element, posts it as base64.
    const doc = new Y.Doc()
    doc.getMap('elements').set('rect-1', {id: 'rect-1', version: 1})
    const update = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
    const post = await fetch(`${base}/api/canvas/update`, {
      method: 'POST',
      headers: {origin: ORIGIN, 'content-type': 'application/json'},
      body: JSON.stringify({session: 's1', update}),
    })
    expect(post.status).toBe(200)

    // A fresh subscriber gets the merged state in its snapshot frame.
    const frame = await firstSnapshot(base, 's1')
    expect(frame.type).toBe('snapshot')
    const mirror = new Y.Doc()
    Y.applyUpdate(mirror, new Uint8Array(Buffer.from(frame.update, 'base64')))
    expect(mirror.getMap('elements').has('rect-1')).toBe(true)
  })

  it('runs the doctor sweep over http and returns a report', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await fetch(`${base}/api/canvas/doctor`, {method: 'POST', headers: {origin: ORIGIN}})
    expect(res.status).toBe(200)
    const {report} = await res.json()
    expect(report).toEqual({fresh: 0, reAnchored: 0, drifted: 0, orphaned: 0, ambiguous: 0})
  })

  it('rejects a cross-origin (non-loopback) caller', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await fetch(`${base}/api/canvas/update`, {
      method: 'POST',
      headers: {origin: 'https://evil.example', 'content-type': 'application/json'},
      body: JSON.stringify({session: 's1', update: 'AAA'}),
    })
    expect(res.status).toBe(403)
  })
})
