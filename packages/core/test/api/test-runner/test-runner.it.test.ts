import {describe, it, expect, afterAll} from 'vitest'
import {z} from 'zod'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {makeVitestManager} from '../../../src/test-runner/vitest/manager.js'
import {registerTestRunnerRoutes} from '../../../src/api/test-runner/test-runner.js'
import {tsxSpawnRunner, errorSpawnRunner} from '../../helpers.js'

// Real srvx server hosting the test-runner routes over the real manager + fixture. Proves the
// JSON routes and the 422 "runner unavailable" translation end-to-end.

const fixture = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/vitest-app')

const ListSchema = z.object({files: z.array(z.object({relPath: z.string()}))})
const RunSchema = z.object({summary: z.object({failed: z.number()})})
const UnavailableSchema = z.object({available: z.boolean(), error: z.string().default('')})

async function startServer(mgr: ReturnType<typeof makeVitestManager>): Promise<{server: Server; base: string}> {
  const app = new H3()
  registerTestRunnerRoutes(app, mgr)
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  return {server, base: new URL(server.url ?? '').origin}
}

describe('test-runner routes over a real srvx server + real fixture (IT)', () => {
  const mgr = makeVitestManager(fixture, {spawnRunner: tsxSpawnRunner})
  const ready = startServer(mgr)
  afterAll(async () => {
    await mgr.stop()
    await (await ready).server.close()
  })

  it('GET /api/test-runner/list returns the fixture files', async () => {
    const {base} = await ready
    const body = ListSchema.parse(await (await fetch(`${base}/api/test-runner/list`)).json())
    expect(body.files.map((f) => f.relPath).toSorted()).toEqual(['fail.test.ts', 'pass.test.ts'])
  })

  it('POST /api/test-runner/run returns a summary with the failure', async () => {
    const {base} = await ready
    const res = await fetch(`${base}/api/test-runner/run`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}',
    })
    const body = RunSchema.parse(await res.json())
    expect(body.summary.failed).toBe(1)
  })
})

describe('test-runner routes when the runner can not init (IT) — graceful 422, not 500', () => {
  const mgr = makeVitestManager(fixture, {spawnRunner: errorSpawnRunner("Cannot find module 'vitest/node'")})
  const ready = startServer(mgr)
  afterAll(async () => {
    await mgr.stop()
    await (await ready).server.close()
  })

  it('POST /api/test-runner/run answers 422 {available:false}, not 500', async () => {
    const {base} = await ready
    const res = await fetch(`${base}/api/test-runner/run`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}',
    })
    expect(res.status).toBe(422)
    const body = UnavailableSchema.parse(await res.json())
    expect(body.available).toBe(false)
    expect(body.error).toContain('vitest unavailable')
  })

  it('GET /api/test-runner/list answers 422 {available:false}', async () => {
    const {base} = await ready
    const res = await fetch(`${base}/api/test-runner/list`)
    expect(res.status).toBe(422)
    const body = UnavailableSchema.parse(await res.json())
    expect(body.available).toBe(false)
  })
})
