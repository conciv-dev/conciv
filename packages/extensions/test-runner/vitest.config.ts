import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'
import type {Plugin} from 'vite'

const FILE = '/proj/app/math.test.ts'
const STREAM_EVENTS = [
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

const testRunnerStream: Plugin = {
  name: 'test-runner-stream-fixture',
  configureServer(server) {
    server.middlewares.use('/api/ext/test-runner/stream', (_req, res) => {
      res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'})
      for (const event of STREAM_EVENTS) res.write(`data: ${JSON.stringify(event)}\n\n`)
    })
  },
}

export default defineConfig({
  test: {
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
