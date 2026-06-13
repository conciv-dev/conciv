import {describe, it, expect, afterAll} from 'vitest'
import {createServer, type Server} from 'node:http'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {makeVitestManager} from '../src/vitest-manager.js'
import {makeVitestRoute} from '../src/vitest-route.js'
import {tsxSpawnRunner, errorSpawnRunner} from './helpers.js'

// Real http server hosting the vitest route over the real manager + fixture. Proves the
// JSON routes and the 422 "vitest unavailable" translation end-to-end.

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')

function listen(server: Server): Promise<string> {
  return new Promise((r) =>
    server.listen(0, '127.0.0.1', () => {
      const a = server.address()
      r(`http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`)
    }),
  )
}

describe('vitest-route over a real http server + real fixture (IT)', () => {
  const mgr = makeVitestManager(fixture, {spawnRunner: tsxSpawnRunner})
  const route = makeVitestRoute(mgr)
  const server = createServer((req, res) => void route(req, res, () => res.writeHead(404).end()))
  const ready = listen(server)
  afterAll(async () => {
    await mgr.stop()
    server.close()
  })

  it('GET /__pw/tools/vitest/list returns the fixture files', async () => {
    const base = await ready
    const body = (await (await fetch(`${base}/__pw/tools/vitest/list`)).json()) as {files: {relPath: string}[]}
    expect(body.files.map((f) => f.relPath).toSorted()).toEqual(['fail.test.ts', 'pass.test.ts'])
  })

  it('POST /__pw/tools/vitest/run returns a summary with the failure', async () => {
    const base = await ready
    const res = await fetch(`${base}/__pw/tools/vitest/run`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}',
    })
    const body = (await res.json()) as {summary: {failed: number}}
    expect(body.summary.failed).toBe(1)
  })
})

describe('vitest-route when vitest can not init (IT) — graceful 422, not 500', () => {
  const mgr = makeVitestManager(fixture, {spawnRunner: errorSpawnRunner("Cannot find module 'vitest/node'")})
  const route = makeVitestRoute(mgr)
  const server = createServer((req, res) => void route(req, res, () => res.writeHead(404).end()))
  const ready = listen(server)
  afterAll(async () => {
    await mgr.stop()
    server.close()
  })

  it('POST /__pw/tools/vitest/run answers 422 {available:false}, not 500', async () => {
    const base = await ready
    const res = await fetch(`${base}/__pw/tools/vitest/run`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {available: boolean; error: string}
    expect(body.available).toBe(false)
    expect(body.error).toContain('vitest unavailable')
  })

  it('GET /__pw/tools/vitest/list answers 422 {available:false}', async () => {
    const base = await ready
    const res = await fetch(`${base}/__pw/tools/vitest/list`)
    expect(res.status).toBe(422)
    const body = (await res.json()) as {available: boolean}
    expect(body.available).toBe(false)
  })
})
