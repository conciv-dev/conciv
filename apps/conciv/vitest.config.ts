import {configDefaults, defineConfig} from 'vitest/config'
import unocss from '@unocss/postcss'
import unoConfig from './uno.config.js'
import type {UserConfig} from 'unocss'
import {coreCommands} from './test/commands/core-control.js'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import {TANSTACK_AI_SOLID_DEPS, browserOptimizeDeps, ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const PERF_SUITE = 'test/calm-perf.browser.test.tsx'
const PERF_MODE = 'perf'
const MASCOT_DEPS = ['@conciv/mascot > gsap', '@conciv/mascot > gsap/MotionPathPlugin']
const SHELL_DEPS = [
  '@tanstack/hotkeys',
  '@tanstack/solid-hotkeys',
  '@solid-primitives/mutation-observer',
  'semver/functions/lt',
  'semver/functions/valid',
]
const TEST_UNO_CONFIG: UserConfig = {
  ...unoConfig,
  configFile: false,
  content: {...unoConfig.content, filesystem: [...(unoConfig.content?.filesystem ?? []), 'test/**/*.{ts,tsx}']},
}
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
        css: {postcss: {plugins: [unocss({configOrPath: TEST_UNO_CONFIG})]}},
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
            provider: playwright({contextOptions: {timezoneId: 'Pacific/Kiritimati'}}),
            instances: mode === PERF_MODE ? [{browser: 'chromium'}, {browser: 'firefox'}] : [{browser: 'chromium'}],
            commands: coreCommands,
          },
        },
      },
    ],
  },
}))
