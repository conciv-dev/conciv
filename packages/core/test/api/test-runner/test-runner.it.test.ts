import {describe, it, expect, afterAll} from 'vitest'
import {z} from 'zod'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {runnerUnavailableError, type TestRunnerManager, type ListResult} from '@opendui/aidx-protocol/runner-types'
import type {TestEvent, TestRunResult} from '@opendui/aidx-protocol/test-types'
import {registerTestRunnerRoutes} from '../../../src/api/test-runner/test-runner.js'
import {registerErrorHandler} from '../../../src/api/errors.js'

// Route IT over a real srvx server. The runner is faked at the TestRunnerManager seam so this
// proves the HTTP layer (JSON routes + the 422 "runner unavailable" translation) in isolation;
// the real vitest execution is covered by @opendui/aidx-test-runner's own vitest IT.

const FILES: ListResult = {
  files: [
    {file: '/app/fail.test.ts', relPath: 'fail.test.ts'},
    {file: '/app/pass.test.ts', relPath: 'pass.test.ts'},
  ],
}
const RESULT: TestRunResult = {
  summary: {passed: 1, failed: 1, skipped: 0, durationMs: 3},
  failures: [{file: '/app/fail.test.ts', name: 'fails', message: 'boom', stack: 'boom'}],
  tests: [],
}
const EMPTY: TestRunResult = {summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0}, failures: [], tests: []}
const SNAPSHOT: TestEvent = {type: 'snapshot', files: [], summary: EMPTY.summary, watching: false}

// A working fake manager + one that fails the typed "unavailable" way. Plain objects against the
// TestRunnerManager interface — the route's only contract.
function fakeManager(): TestRunnerManager {
  return {
    list: async () => FILES,
    run: async () => RESULT,
    status: () => RESULT,
    subscribeRaw: () => () => {},
    emitSnapshot: () => SNAPSHOT,
    openUiServer: async () => ({available: false}),
    stop: async () => {},
  }
}
function unavailableManager(): TestRunnerManager {
  const fail = () => Promise.reject(runnerUnavailableError('vitest', "Cannot find module 'vitest/node'"))
  return {
    list: fail,
    run: fail,
    status: () => EMPTY,
    subscribeRaw: () => () => {},
    emitSnapshot: () => SNAPSHOT,
    openUiServer: async () => ({available: false}),
    stop: async () => {},
  }
}

async function startServer(mgr: TestRunnerManager): Promise<{server: Server; base: string}> {
  const app = new H3()
  registerErrorHandler(app)
  registerTestRunnerRoutes(app, mgr)
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  return {server, base: new URL(server.url ?? '').origin}
}

const ListSchema = z.object({files: z.array(z.object({relPath: z.string()}))})
const RunSchema = z.object({summary: z.object({failed: z.number()})})
const UnavailableSchema = z.object({available: z.boolean(), error: z.string().default('')})

describe('test-runner routes over a real srvx server (IT)', () => {
  const ready = startServer(fakeManager())
  afterAll(async () => {
    await (await ready).server.close()
  })

  it('GET /api/test-runner/list returns the runner files', async () => {
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
  const ready = startServer(unavailableManager())
  afterAll(async () => {
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
