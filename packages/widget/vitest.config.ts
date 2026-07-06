import path from 'node:path'
import {fileURLToPath} from 'node:url'
import solid from 'vite-plugin-solid'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'
import type {Plugin} from 'vite'

//    /__pw/* endpoints, then drives the widget in a real Chromium via Playwright. Real transport, real

const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

const FILE = '/proj/app/math.test.ts'
const TEST_RUN_RESULT = {
  summary: {passed: 1, failed: 1, skipped: 0, durationMs: 12},
  failures: [{file: FILE, name: 'this fails on purpose', message: 'expected 200 to be 401', stack: '', line: 4}],
  tests: [
    {file: FILE, name: 'one plus one', state: 'pass', durationMs: 1},
    {
      file: FILE,
      name: 'this fails on purpose',
      state: 'fail',
      durationMs: 2,
      error: {file: FILE, name: 'this fails on purpose', message: 'expected 200 to be 401', stack: '', line: 4},
    },
  ],
}
const HISTORY = [
  {
    id: 'h1',
    role: 'assistant',
    parts: [
      {type: 'text', content: 'Ran the tests.'},
      {type: 'tool-call', id: 'tc1', name: 'test_runner', arguments: '{"action":"run"}', state: 'input-complete'},
      {type: 'tool-result', toolCallId: 'tc1', content: JSON.stringify(TEST_RUN_RESULT), state: 'complete'},
    ],
  },
]
const SESSION = {
  sessionId: 'conciv_test',
  harnessSessionId: 'tok-test',
  name: 'Tests',
  origin: 'chat',
  cwd: '/app',
  lock: {held: false, role: null},
  usage: null,
  harness: {id: 'claude', name: 'Claude', canLaunch: false},
}

const SNAPSHOT = {type: 'CUSTOM', name: 'conciv-snapshot', value: {generating: false, messages: HISTORY}}

const chatHistoryFixture: Plugin = {
  name: 'chat-history-fixture',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? ''
      const json = (body: unknown) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(body))
      }
      if (url.startsWith('/api/chat/session/resolve')) return json({sessionId: 'conciv_test'})
      if (url.startsWith('/api/chat/sessions')) return json({sessions: []})
      if (url.startsWith('/api/chat/attach')) {
        res.setHeader('content-type', 'text/event-stream')
        res.setHeader('cache-control', 'no-cache')
        res.write(`data: ${JSON.stringify(SNAPSHOT)}\n\n`)
        return
      }
      if (url.startsWith('/api/chat/session')) return json(SESSION)
      next()
    })
  },
}

const storybook = {
  extends: true as const,
  plugins: [storybookTest({configDir: path.join(dirname, '.storybook')})],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{browser: 'chromium' as const}],
    },
  },
}

const e2e = {
  extends: true as const,
  test: {
    name: 'widget-e2e',
    environment: 'node',
    include: ['test/terminal-mode.it.test.ts'],
    testTimeout: 150_000,
    hookTimeout: 150_000,
  },
}

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'widget',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/terminal-mode.it.test.ts', '**/node_modules/**'],
          testTimeout: 90_000,
          hookTimeout: 90_000,
        },
      },
      ...(process.env.CONCIV_E2E ? [e2e] : []),
      {
        plugins: [solid(), chatHistoryFixture],
        test: {
          name: 'widget-browser',
          include: ['test/**/*.browser.test.tsx'],
          testTimeout: 90_000,
          hookTimeout: 90_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{browser: 'chromium'}],
          },
        },
      },
      ...(process.env.SKIP_STORYBOOK_TESTS ? [] : [storybook]),
    ],
  },
})
