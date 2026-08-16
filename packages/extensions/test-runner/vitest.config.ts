import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'
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
  {type: 'test', id: 't-works', file: FILE, name: 'works', state: 'pass', durationMs: 1},
  {
    type: 'test',
    id: 't-broken',
    file: FILE,
    name: 'broken',
    state: 'fail',
    durationMs: 1,
    error: {file: FILE, name: 'broken', message: 'boom', stack: 'boom', line: 3},
  },
  {type: 'test', id: 't-shared-first', file: FILE, name: 'shares a title', state: 'pass', durationMs: 1},
  {type: 'test', id: 't-shared-second', file: FILE, name: 'shares a title', state: 'pass', durationMs: 1},
  {
    type: 'run-end',
    runId: 'run-1',
    summary: {passed: 3, failed: 1, skipped: 0, durationMs: 4},
    failures: [{file: FILE, name: 'broken', message: 'boom', stack: 'boom', line: 3}],
    tests: [
      {id: 't-works', file: FILE, name: 'works', state: 'pass', durationMs: 1},
      {
        id: 't-broken',
        file: FILE,
        name: 'broken',
        state: 'fail',
        durationMs: 1,
        error: {file: FILE, name: 'broken', message: 'boom', stack: 'boom', line: 3},
      },
      {id: 't-shared-first', file: FILE, name: 'shares a title', state: 'pass', durationMs: 1},
      {id: 't-shared-second', file: FILE, name: 'shares a title', state: 'pass', durationMs: 1},
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

const RUN_EVENT_GAP_MS = 120
const RUN_END_DELAY_MS = 2500

function runEventDelay(event: TestEvent, index: number): number {
  return event.type === 'run-end' ? RUN_END_DELAY_MS : index * RUN_EVENT_GAP_MS
}

const fixtureManager: TestRunnerManager = {
  list: async () => ({files: []}),
  run: async () => cannedStatus,
  status: () => cannedStatus,
  subscribeRaw: (cb) => {
    const timers = STREAM_EVENTS.slice(1).map((event, index) =>
      setTimeout(() => cb(event), runEventDelay(event, index)),
    )
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
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
          ...ciTestSolidBrowser(),
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
