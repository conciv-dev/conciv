import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'
import {ciTest} from '@conciv/vitest-config'
import type {Plugin} from 'vite'
import {RPCHandler} from '@orpc/server/node'
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

const testRunnerStream: Plugin = {
  name: 'test-runner-stream-fixture',
  configureServer(server) {
    const handler = new RPCHandler(makeTestRunnerRouter(fixtureManager))
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/rpc/ext/test-runner')) return next()
      void handler
        .handle(req, res, {prefix: '/rpc/ext/test-runner', context: {request: new Request('http://localhost')}})
        .then((result) => {
          if (!result.matched) next()
        })
    })
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
        },
      },
      {
        plugins: [solid(), testRunnerStream],
        test: {
          name: 'test-runner-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 60_000,
          browser: {enabled: true, headless: true, provider: playwright({}), instances: [{browser: 'chromium'}]},
        },
      },
    ],
  },
})
