import type {Plugin, UserConfig} from 'vite'
import solidPlugin from 'vite-plugin-solid'
import {playwright} from '@vitest/browser-playwright'
import {z} from 'zod'
import {configDefaults, type TestProjectInlineConfiguration} from 'vitest/config'
import {ciReporters} from '@conciv/vitest-config'

const TEST_TIMEOUT_MS = 30_000
const HOOK_TIMEOUT_MS = 30_000
const POLL_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 50
export const VIEWPORT = {width: 1280, height: 800}
export const BROWSER_TESTS = ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx']
const WORKSPACE_DIST = /^(?!.*\/node_modules\/).*\/dist\/.*\.m?js$/

export type AuthorTest = NonNullable<UserConfig['test']>

function workerCap(): number | undefined {
  const cap = Number(process.env.VITEST_MAX_FORKS)
  return Number.isInteger(cap) && cap >= 1 ? cap : undefined
}

function pollDefaults(expect: AuthorTest['expect'] = {}): {timeout: number; interval: number} {
  return {timeout: expect.poll?.timeout ?? POLL_TIMEOUT_MS, interval: expect.poll?.interval ?? POLL_INTERVAL_MS}
}

const WORKSPACE_COVERAGE = ['packages', 'packages/plugins', 'apps'].flatMap((group) => [
  `**/${group}/*/src/**/*.{ts,tsx}`,
  `**/${group}/*/dist/**/*.js`,
])

export function kitDefaults(test: AuthorTest = {}): AuthorTest {
  return {
    reporters: test.reporters ?? ciReporters(),
    coverage: {
      enabled: test.coverage?.enabled ?? Boolean(process.env.GITHUB_ACTIONS),
      provider: 'v8',
      reporter: ['json-summary', 'lcovonly'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}', 'dist/**/*.js', ...WORKSPACE_COVERAGE],
      exclude: ['**/*.test.*', '**/*.stories.*', '**/node_modules/**'],
      allowExternal: true,
      excludeAfterRemap: true,
      // oxlint-disable-next-line conciv/banned-vocabulary -- vitest's own option name: coverage of the CLI child process
      autoAttachSubprocess: true,
    },
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: HOOK_TIMEOUT_MS,
    expect: {poll: pollDefaults(test.expect)},
    maxWorkers: test.maxWorkers ?? workerCap(),
  }
}

export function nodeProject(extra: TestProjectInlineConfiguration = {}): TestProjectInlineConfiguration {
  return {
    extends: true,
    ...extra,
    test: {
      name: 'node',
      environment: 'node',
      include: ['src/**/*.test.ts'],
      server: {deps: {external: [WORKSPACE_DIST]}},
      exclude: [...configDefaults.exclude, '**/*.dom.test.*', '**/*.browser.test.*', '**/*.perf.test.*'],
      ...extra.test,
    },
  }
}

export function domProject(extra: TestProjectInlineConfiguration = {}): TestProjectInlineConfiguration {
  return {
    extends: true,
    ...extra,
    test: {
      name: 'happy-dom',
      include: ['src/**/*.dom.test.ts', 'src/**/*.dom.test.tsx'],
      environment: 'happy-dom',
      environmentOptions: {happyDOM: VIEWPORT},
      ...extra.test,
    },
  }
}

const PluginListSchema = z.array(z.unknown())

const NamedPluginSchema = z.object({name: z.string(), apply: z.unknown().optional()})

function hasServingPlugin(option: unknown, name: string): boolean {
  const list = PluginListSchema.safeParse(option)
  if (list.success) return list.data.some((item) => hasServingPlugin(item, name))
  const plugin = NamedPluginSchema.safeParse(option).data
  return plugin?.name === name && (plugin.apply === undefined || plugin.apply === 'serve')
}

export function solidPlugins(authorPlugins: UserConfig['plugins']): Plugin[] {
  return hasServingPlugin(authorPlugins, 'solid') ? [] : [solidPlugin()]
}

export type BrowserName = 'chromium' | 'firefox'

export function browserProject(
  name: string,
  include: string[],
  browsers: BrowserName[],
  extra: TestProjectInlineConfiguration = {},
): TestProjectInlineConfiguration {
  return {
    extends: true,
    ...extra,
    test: {
      name,
      include,
      ...extra.test,
      browser: {
        enabled: true,
        headless: true,
        screenshotFailures: false,
        provider: playwright({contextOptions: {reducedMotion: 'reduce'}}),
        instances: browsers.map((browser) => ({browser})),
        viewport: VIEWPORT,
        ...extra.test?.browser,
      },
    },
  }
}

export function concivTest(): Plugin {
  return {
    name: 'conciv:test',
    config(config, env) {
      if (env.mode !== 'test') return
      const defaults = kitDefaults(config.test)
      if (config.test?.name !== undefined) return {test: defaults}
      return {
        test: {
          ...defaults,
          projects: [
            nodeProject(),
            domProject({plugins: solidPlugins(config.plugins)}),
            browserProject('browser', BROWSER_TESTS, ['chromium'], {plugins: solidPlugins(config.plugins)}),
          ],
        },
      }
    },
  }
}
