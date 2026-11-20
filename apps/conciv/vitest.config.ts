import {fileURLToPath} from 'node:url'
import {configDefaults, defineConfig, type TestProjectInlineConfiguration} from 'vitest/config'
import {coreCommands} from './test/commands/core-control.js'
import {playwright} from '@vitest/browser-playwright'
import solidPlugin from 'vite-plugin-solid'
import UnoCSS from 'unocss/vite'
import {searchForWorkspaceRoot} from 'vite'
import {
  HOOK_TIMEOUT_MS,
  TANSTACK_AI_SOLID_DEPS,
  TEST_TIMEOUT_MS,
  browserOptimizeDeps,
  ciTest,
  ciTestSolidBrowser,
} from '@conciv/vitest-config'
import {ciTestDom} from '@conciv/vitest-config/dom'

const PERF_SUITE = 'test/calm-perf.browser.test.tsx'
const MASCOT_DEPS = ['@conciv/mascot > gsap', '@conciv/mascot > gsap/MotionPathPlugin']
const SHELL_DEPS = [
  '@tanstack/hotkeys',
  '@tanstack/solid-hotkeys',
  '@solid-primitives/mutation-observer',
  'semver/functions/lt',
  'semver/functions/valid',
]
const REACT_PAGE_DEPS = ['react', 'react-dom/client']
const BUILT_PACKAGE = /\/packages\/.+\/dist\//
const BROWSER_SUITES = [
  'test/**/*.browser.test.ts',
  'test/**/*.browser.test.tsx',
  'src/runtime/persistence/**/*.browser.test.ts',
]

type BrowserName = 'chromium' | 'firefox'

const TIMEZONE = 'Pacific/Kiritimati'
const PERMISSIONS: Record<BrowserName, string[]> = {chromium: ['clipboard-read', 'clipboard-write'], firefox: []}
const LAUNCH_ARGS: Record<BrowserName, string[]> = {
  chromium: ['--disable-lcd-text', '--disable-partial-raster'],
  firefox: [],
}

function browserProject(
  name: string,
  include: string[],
  exclude: string[],
  browsers: BrowserName[],
): TestProjectInlineConfiguration {
  return {
    plugins: [UnoCSS(), solidPlugin()],
    optimizeDeps: browserOptimizeDeps([...TANSTACK_AI_SOLID_DEPS, ...MASCOT_DEPS, ...SHELL_DEPS, ...REACT_PAGE_DEPS]),
    test: {
      ...ciTestSolidBrowser(),
      name,
      include,
      exclude,
      fileParallelism: false,
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({contextOptions: {timezoneId: TIMEZONE}}),
        instances: browsers.map((browser) => ({
          browser,
          provider: playwright({
            launchOptions: {args: LAUNCH_ARGS[browser]},
            contextOptions: {timezoneId: TIMEZONE, permissions: PERMISSIONS[browser]},
          }),
        })),
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
          include: ['test/**/*.test.ts', 'src/runtime/plugin/**/*.test.ts', 'src/runtime/persistence/**/*.test.ts'],
          exclude: [
            'test/**/*.browser.test.ts',
            'test/**/*.browser.test.tsx',
            'src/runtime/persistence/**/*.browser.test.ts',
          ],
          testTimeout: TEST_TIMEOUT_MS,
          hookTimeout: HOOK_TIMEOUT_MS,
        },
      },
      {
        plugins: [UnoCSS(), solidPlugin()],
        server: {fs: {allow: [searchForWorkspaceRoot(process.cwd()), '/__uno.css', '/__uno.css?inline']}},
        test: {
          ...ciTestDom(),
          name: 'dom',
          environment: fileURLToPath(import.meta.resolve('@conciv/plugin-testkit/dom-environment')),
          server: {deps: {inline: [BUILT_PACKAGE]}},
        },
      },
      browserProject('browser', BROWSER_SUITES, [...configDefaults.exclude, PERF_SUITE], ['chromium']),
      browserProject('perf', [PERF_SUITE], configDefaults.exclude, ['chromium', 'firefox']),
    ],
  },
})
