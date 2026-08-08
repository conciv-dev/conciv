import type {Plugin} from 'vite'
import {defineConfig} from 'vitest/config'
import {serveRpcRouter} from '@conciv/harness-testkit/rpc-mounts'
import {makeFakeCoreRouter} from './test/helpers/fake-core-router.js'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {ciTest} from '@conciv/vitest-config'

const FAKE_CORE_ADDRESS_PATH = '/__fake-core'

const fakeCoreSocket: Plugin = {
  name: 'fake-core-socket',
  async configureServer(server) {
    const {router} = makeFakeCoreRouter()
    const served = await serveRpcRouter({router})
    server.middlewares.use((req, res, next) => {
      if (req.url !== FAKE_CORE_ADDRESS_PATH) return next()
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
          name: 'unit',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
        },
      },
      {
        plugins: [solidPlugin(), fakeCoreSocket],
        test: {
          name: 'browser',
          include: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
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
