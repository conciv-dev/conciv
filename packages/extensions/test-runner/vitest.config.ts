import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'
import type {Plugin} from 'vite'
import {RPCHandler} from '@orpc/server/node'
import {rpcConnectionContext, rpcHandlerOptions} from '@conciv/extension/rpc-mount'
import {serveExtensionRpc} from '@conciv/harness-testkit/rpc-mounts'
import {makeTestRunnerRouter} from './src/server.js'
import type {TestEvent, TestRunResult} from './src/shared/events.js'
import type {TestRunnerManager} from './src/runner/contract.js'

const FILE = '/proj/app/math.test.ts'
const STREAM_EVENTS: TestEvent[] = [
  {type: 'snapshot', files: [], summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0}, watching: false},
  {type: 'run-start', runId: 'run-1', files: [FILE]},
  {type: 'test', file: FILE, name: 'works', state: 'pass', durationMs: 1},
  {
    type: 'test',
    file: FILE,
    name: 'broken',
    state: 'fail',
    durationMs: 1,
    error: {file: FILE, name: 'broken', message: 'boom', stack: 'boom', line: 3},
  },
  {
    type: 'run-end',
    runId: 'run-1',
    summary: {passed: 1, failed: 1, skipped: 0, durationMs: 2},
    failures: [{file: FILE, name: 'broken', message: 'boom', stack: 'boom', line: 3}],
    tests: [
      {file: FILE, name: 'works', state: 'pass', durationMs: 1},
      {
        file: FILE,
        name: 'broken',
        state: 'fail',
        durationMs: 1,
        error: {file: FILE, name: 'broken', message: 'boom', stack: 'boom', line: 3},
      },
    ],
  },
]

const runEnd = STREAM_EVENTS.at(-1)
const cannedStatus: TestRunResult =
  runEnd && runEnd.type === 'run-end'
    ? {summary: runEnd.summary, failures: runEnd.failures, tests: runEnd.tests}
    : {summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0}, failures: [], tests: []}

const snapshotEvent: TestEvent = {
  type: 'snapshot',
  files: [],
  summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0},
  watching: false,
}

const fixtureManager: TestRunnerManager = {
  list: async () => ({files: []}),
  run: async () => cannedStatus,
  status: () => cannedStatus,
  subscribeRaw: (cb) => {
    for (const event of STREAM_EVENTS.slice(1)) cb(event)
    return () => {}
  },
  emitSnapshot: () => snapshotEvent,
  openUiServer: async () => ({available: false}),
  stop: async () => {},
}

const FIXTURE_ORIGIN = 'http://127.0.0.1'
const FIXTURE_BASE_PATH = '/__test-runner-fixture'

const testRunnerStream: Plugin = {
  name: 'test-runner-stream-fixture',
  async configureServer(server) {
    const router = makeTestRunnerRouter(fixtureManager)
    const composite = {ext: {'test-runner': router}}
    const handler = new RPCHandler(composite, rpcHandlerOptions())
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/rpc/')) return next()
      void handler
        .handle(req, res, {
          prefix: '/rpc',
          context: rpcConnectionContext(new URL(req.url, FIXTURE_ORIGIN).toString()),
        })
        .then((result) => {
          if (!result.matched) next()
        })
    })
    const served = await serveExtensionRpc({slug: 'test-runner', router})
    server.middlewares.use((req, res, next) => {
      if (req.url !== FIXTURE_BASE_PATH) return next()
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({base: served.base, wsUrl: served.wsUrl}))
    })
    served.unref()
    server.httpServer?.on('close', () => void served.close())
  },
}

export default defineConfig({
  test: {
    ...ciTest(),
    projects: [
      {
        test: {
          name: 'test-runner',
          include: ['test/**/*.it.test.ts'],
          exclude: ['test/fixtures/**', 'node_modules/**', 'dist/**'],
          testTimeout: 30_000,
          fileParallelism: false,
        },
      },
      {
        plugins: [solid(), testRunnerStream],
        test: {
          ...ciTest(),
          name: 'test-runner-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 60_000,
          fileParallelism: false,
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
