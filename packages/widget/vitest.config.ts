import solid from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {defineConfig} from 'vitest/config'
import type {Plugin} from 'vite'

// A settled assistant turn whose chain holds a test_runner tool-call + its result — what the chat
// panel hydrates from /api/chat/history. Same-origin, so the browser-mounted panel reaches it.
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
  sessionId: 'mandarax_test',
  harnessSessionId: 'tok-test',
  name: 'Tests',
  origin: 'chat',
  cwd: '/app',
  lock: {held: false, role: null},
  usage: null,
  harness: {id: 'claude', name: 'Claude', canLaunch: false},
}

const chatHistoryFixture: Plugin = {
  name: 'chat-history-fixture',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? ''
      const json = (body: unknown) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(body))
      }
      if (url.startsWith('/api/chat/session/resolve')) return json({sessionId: 'mandarax_test'})
      if (url.startsWith('/api/chat/sessions')) return json({sessions: []})
      if (url.startsWith('/api/chat/history')) return json(HISTORY)
      if (url.startsWith('/api/chat/session')) return json(SESSION)
      next()
    })
  },
}

// Two projects. `widget` (node): the http-server-backed integration tests that drive the built global
// bundle in Chromium via Playwright. `widget-browser`: real-browser component tests that render the
// widget's own Solid source (compiled on the fly by vite-plugin-solid) — used for extension rendering,
// where the test module and the widget share ONE module graph so @mandarax/extension's runtime context
// is the same instance the Component reads via useContext. Real browser, real Solid, no jsdom.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'widget',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 90_000,
          hookTimeout: 90_000,
        },
      },
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
    ],
  },
})
