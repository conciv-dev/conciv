import type {Plugin} from 'vite'
import {defineConfig} from 'vitest/config'
import {BaseSequencer, type TestSpecification} from 'vitest/node'
import {serveRpcRouter} from '@conciv/harness-testkit/rpc-mounts'
import {makeFakeCoreRouter} from './test/helpers/fake-core-router.js'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const FAKE_CORE_ADDRESS_PATH = '/__fake-core'

const SESSION_KILLER_SUITE = 'router-restore.browser.test.ts'

class RunSessionKillerLastSequencer extends BaseSequencer {
  override async sort(files: Array<TestSpecification>): Promise<Array<TestSpecification>> {
    // oxlint-disable-next-line unicorn/no-array-sort
    const sorted = await super.sort(files)
    const isSessionKiller = (spec: TestSpecification): boolean => spec.moduleId.endsWith(SESSION_KILLER_SUITE)
    return [...sorted.filter((spec) => !isSessionKiller(spec)), ...sorted.filter(isSessionKiller)]
  }
}

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
    sequence: {sequencer: RunSessionKillerLastSequencer},
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
          ...ciTestSolidBrowser(),
          name: 'browser',
          include: ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx'],
          fileParallelism: false,
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
