import path from 'node:path'
import {fileURLToPath} from 'node:url'
import solid from 'vite-plugin-solid'
import {defineConfig} from 'vitest/config'
import {storybookTest} from '@storybook/addon-vitest/vitest-plugin'
import {playwright} from '@vitest/browser-playwright'
import type {Plugin} from 'vite'

// One vitest config, three projects:
//  - `widget` (node): boots a tiny Node http server serving the real built global bundle + scripted
//    /__pw/* endpoints, then drives the widget in a real Chromium via Playwright. Real transport, real
//    browser, real bundle — scripted fixtures, no mocks. A dedicated config (taking precedence over
//    vite.config.ts, the lib build) keeps the runner out of the build pipeline.
//  - `widget-browser`: real-browser component tests that render the widget's own Solid source (compiled
//    on the fly by vite-plugin-solid). The test module and the widget share ONE module graph so
//    @mandarax/extension's runtime context is the same instance the Component reads via useContext.
//  - `storybook`: the widget's stories run as real browser tests via the Storybook vitest addon.
// Never jsdom.
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
  sessionId: 'mandarax_test',
  harnessSessionId: 'tok-test',
  name: 'Tests',
  origin: 'chat',
  cwd: '/app',
  lock: {held: false, role: null},
  usage: null,
  harness: {id: 'claude', name: 'Claude', canLaunch: false},
}

// A settled assistant turn whose chain holds a test_runner tool-call + its result — what the chat panel
// hydrates from /api/chat/history. Same-origin, so the browser-mounted panel reaches it.
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

// The Storybook browser project is skipped in CI (SKIP_STORYBOOK_TESTS=1): an upstream vitest/storybook
// cold dep-optimize reload race fails it on CI's constrained runners. It runs locally via `pnpm test`.
// TODO: re-enable in CI once the upstream issue is resolved.
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

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
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
      ...(process.env.SKIP_STORYBOOK_TESTS ? [] : [storybook]),
    ],
  },
})
