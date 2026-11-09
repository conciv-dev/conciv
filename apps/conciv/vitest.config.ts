import {configDefaults, defineConfig, type TestProjectInlineConfiguration} from 'vitest/config'
import {coreCommands} from './test/commands/core-control.js'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {TANSTACK_AI_SOLID_DEPS, browserOptimizeDeps, ciTest, ciTestSolidBrowser} from '@conciv/vitest-config'

const PERF_SUITE = 'test/calm-perf.browser.test.tsx'
const MASCOT_DEPS = ['@conciv/mascot > gsap', '@conciv/mascot > gsap/MotionPathPlugin']
const SHELL_DEPS = [
  '@tanstack/hotkeys',
  '@tanstack/solid-hotkeys',
  '@solid-primitives/mutation-observer',
  'semver/functions/lt',
  'semver/functions/valid',
]
const BUILT_PACKAGE = /\/packages\/.+\/dist\//
const BROWSER_SUITES = ['test/**/*.browser.test.ts', 'test/**/*.browser.test.tsx']

type BrowserName = 'chromium' | 'firefox'

function browserProject(
  name: string,
  include: string[],
  exclude: string[],
  browsers: BrowserName[],
): TestProjectInlineConfiguration {
  return {
    plugins: [UnoCSS(), solidPlugin()],
    optimizeDeps: browserOptimizeDeps([...TANSTACK_AI_SOLID_DEPS, ...MASCOT_DEPS, ...SHELL_DEPS]),
    test: {
      ...ciTestSolidBrowser(),
      name,
      include,
      exclude,
      fileParallelism: false,
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({contextOptions: {timezoneId: 'Pacific/Kiritimati'}}),
        instances: browsers.map((browser) => ({browser})),
        commands: coreCommands,
      },
    },
  }
}

export default defineConfig({
  test: {
    ...ciTest(),
    server: {deps: {external: [BUILT_PACKAGE]}},
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
      browserProject('browser', BROWSER_SUITES, [...configDefaults.exclude, PERF_SUITE], ['chromium']),
      browserProject('perf', [PERF_SUITE], configDefaults.exclude, ['chromium', 'firefox']),
    ],
  },
})
