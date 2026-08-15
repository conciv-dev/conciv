import {defineConfig} from 'vitest/config'
import {BaseSequencer, type TestSpecification} from 'vitest/node'
import {coreCommands} from './test/commands/core-control.js'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {browserOptimizeDeps, ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const SESSION_KILLER_SUITE = 'router-restore.browser.test.ts'

class RunSessionKillerLastSequencer extends BaseSequencer {
  override async sort(files: Array<TestSpecification>): Promise<Array<TestSpecification>> {
    // oxlint-disable-next-line unicorn/no-array-sort
    const sorted = await super.sort(files)
    const isSessionKiller = (spec: TestSpecification): boolean => spec.moduleId.endsWith(SESSION_KILLER_SUITE)
    return [...sorted.filter((spec) => !isSessionKiller(spec)), ...sorted.filter(isSessionKiller)]
  }
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
          testTimeout: ciTest().testTimeout,
          hookTimeout: ciTest().hookTimeout,
        },
      },
      {
        plugins: [solidPlugin()],
        optimizeDeps: browserOptimizeDeps(),
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
            commands: coreCommands,
          },
        },
      },
    ],
  },
})
