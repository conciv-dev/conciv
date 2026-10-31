import {configDefaults, defineConfig} from 'vitest/config'
import {coreCommands} from './test/commands/core-control.js'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {TANSTACK_AI_SOLID_DEPS, browserOptimizeDeps, ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const PERF_SUITE = 'test/calm-perf.browser.test.tsx'
const PERF_MODE = 'perf'
const MASCOT_DEPS = ['@conciv/mascot > gsap', '@conciv/mascot > gsap/MotionPathPlugin']
const SHELL_DEPS = ['@tanstack/hotkeys', '@tanstack/solid-hotkeys', '@solid-primitives/mutation-observer']
const BROWSER_SUITES = ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx']

export default defineConfig(({mode}) => ({
  test: {
    ...ciTest(),
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
        optimizeDeps: browserOptimizeDeps([...TANSTACK_AI_SOLID_DEPS, ...MASCOT_DEPS, ...SHELL_DEPS]),
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
