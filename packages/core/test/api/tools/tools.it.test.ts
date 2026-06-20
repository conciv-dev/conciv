import {afterEach, describe, expect, it} from 'vitest'
import {serve, type Server} from 'srvx'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {makeApp} from '../../../src/app.js'
import {resolveConfig} from '../../../src/config.js'

const ORIGIN = 'http://localhost:3000'
const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'mandarax-tools-it-'))
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
      throw new Error('spawnHarness must not be called by tool-run tests')
    },
  })
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  return {server, base: new URL(server.url ?? '').origin}
}

async function run(base: string, name: string, input: unknown): Promise<Response> {
  return fetch(`${base}/api/tools/run`, {
    method: 'POST',
    headers: {origin: ORIGIN, 'content-type': 'application/json'},
    body: JSON.stringify({name, input}),
  })
}

describe('shared tool-run endpoint (IT) — the canvas-comments built-in', () => {
  const state = {server: undefined as Server | undefined}
  afterEach(async () => {
    if (state.server) await state.server.close()
    state.server = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  it('runs the built-in canvas.draw then canvas.read reflects it', async () => {
    const {server, base} = await startServer()
    state.server = server

    const drew = await run(base, 'canvas.draw', {elements: [{id: 'r1', version: 1, type: 'rectangle'}]})
    expect(drew.status).toBe(200)
    expect((await drew.json()).result).toEqual({ok: true, count: 1})

    const read = await run(base, 'canvas.read', {})
    const elements = (await read.json()).result.elements as {id: string}[]
    expect(elements.map((e) => e.id)).toEqual(['r1'])
  })

  it('returns 404 for an unknown tool', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await run(base, 'does.not.exist', {})
    expect(res.status).toBe(404)
  })

  it('rejects a cross-origin caller (loopback gate)', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await fetch(`${base}/api/tools/run`, {
      method: 'POST',
      headers: {origin: 'https://evil.example', 'content-type': 'application/json'},
      body: JSON.stringify({name: 'canvas.read', input: {}}),
    })
    expect(res.status).toBe(403)
  })
})
