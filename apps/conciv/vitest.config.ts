import {configDefaults, defineConfig} from 'vitest/config'
import {BaseSequencer, type TestSpecification} from 'vitest/node'
import {coreCommands} from './test/commands/core-control.js'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {TANSTACK_AI_SOLID_DEPS, browserOptimizeDeps, ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const SESSION_KILLER_SUITE = 'router-restore.browser.test.ts'
const PERF_SUITE = 'test/calm-perf.browser.test.tsx'
const PERF_MODE = 'perf'
const BROWSER_SUITES = ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx']

class RunSessionKillerLastSequencer extends BaseSequencer {
  override async sort(files: Array<TestSpecification>): Promise<Array<TestSpecification>> {
    // oxlint-disable-next-line unicorn/no-array-sort
    const sorted = await super.sort(files)
    const isSessionKiller = (spec: TestSpecification): boolean => spec.moduleId.endsWith(SESSION_KILLER_SUITE)
    return [...sorted.filter((spec) => !isSessionKiller(spec)), ...sorted.filter(isSessionKiller)]
  }
}

export default defineConfig(({mode}) => ({
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
        optimizeDeps: browserOptimizeDeps(TANSTACK_AI_SOLID_DEPS),
        test: {
          ...ciTestSolidBrowser(),
          name: 'browser',
          include: mode === PERF_MODE ? [PERF_SUITE] : BROWSER_SUITES,
          exclude: mode === PERF_MODE ? configDefaults.exclude : [...configDefaults.exclude, PERF_SUITE],
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
}))
