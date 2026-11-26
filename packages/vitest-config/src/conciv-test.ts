import {fileURLToPath} from 'node:url'
import type {Plugin, UserConfig} from 'vite'
import solidPlugin from 'vite-plugin-solid'
import type {TestProjectInlineConfiguration} from 'vitest/config'
import {z} from 'zod'
import {ciReporters} from '@internal/vitest-config'

const NODE_ONLY_CONDITIONS = ['browser', 'solid']
const SOLID_INJECTED_JEST_DOM = '@testing-library/jest-dom/vitest'
const TEST_TIMEOUT_MS = 30_000
const HOOK_TIMEOUT_MS = 30_000
const POLL_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 50
const VIEWPORT = {width: 1280, height: 800}
const WORKSPACE_DIST = /^(?!.*\/node_modules\/).*\/dist\/.*\.m?js$/
const ISOLATED_HOME = fileURLToPath(new URL('./isolated-home.ts', import.meta.url))
const UNIT_SETUP = fileURLToPath(new URL('./unit-setup.ts', import.meta.url))

const WORKSPACE_COVERAGE = ['packages', 'packages/plugins', 'apps'].flatMap((group) => [
  `**/${group}/*/src/**/*.{ts,tsx}`,
  `**/${group}/*/dist/**/*.js`,
])

type AuthorTest = NonNullable<UserConfig['test']>

function workerCap(): number | undefined {
  const cap = Number(process.env.VITEST_MAX_FORKS)
  return Number.isInteger(cap) && cap >= 1 ? cap : undefined
}

function pollDefaults(expect: AuthorTest['expect'] = {}): {timeout: number; interval: number} {
  return {timeout: expect.poll?.timeout ?? POLL_TIMEOUT_MS, interval: expect.poll?.interval ?? POLL_INTERVAL_MS}
}

function testDefaults(test: AuthorTest = {}): AuthorTest {
  return {
    reporters: test.reporters ?? ciReporters(),
    coverage: {
      enabled: test.coverage?.enabled ?? Boolean(process.env.GITHUB_ACTIONS),
      provider: 'v8',
      reporter: ['json-summary', 'lcovonly'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}', 'dist/**/*.js', ...WORKSPACE_COVERAGE],
      exclude: ['test/**', '**/test/**', '**/*.stories.*', '**/node_modules/**'],
      allowExternal: true,
      excludeAfterRemap: true,
      autoAttachSubprocess: true,
    },
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: HOOK_TIMEOUT_MS,
    expect: {poll: pollDefaults(test.expect)},
    maxWorkers: test.maxWorkers ?? workerCap(),
    globalSetup: [ISOLATED_HOME],
  }
}

function nodeConditions(): Plugin {
  return {
    name: 'conciv:test-node-conditions',
    enforce: 'post',
    config(config) {
      const setupFiles = config.test?.setupFiles
      if (!Array.isArray(setupFiles)) return
      const kept = setupFiles.filter((file) => file !== SOLID_INJECTED_JEST_DOM)
      setupFiles.splice(0, setupFiles.length, ...kept)
    },
    configResolved(config) {
      const conditions = config.ssr.resolve?.conditions
      if (!conditions) return
      const kept = conditions.filter((condition) => !NODE_ONLY_CONDITIONS.includes(condition))
      conditions.splice(0, conditions.length, ...kept)
    },
  }
}

function hasServingPlugin(option: unknown, name: string): boolean {
  if (Array.isArray(option)) return option.some((item) => hasServingPlugin(item, name))
  if (typeof option !== 'object' || option === null || !('name' in option)) return false
  const apply = 'apply' in option ? option.apply : undefined
  return option.name === name && (apply === undefined || apply === 'serve')
}

type UnitEnvironment = 'node' | 'happy-dom'

const UNIT_TESTS = ['test/unit/**/*.unit.test.{ts,tsx,js}']
const IT_TESTS = ['test/it/**/*.it.test.{ts,tsx,js}']

function unitProject(
  environment: UnitEnvironment,
  authorPlugins: UserConfig['plugins'],
): TestProjectInlineConfiguration {
  const solid = environment === 'happy-dom' && !hasServingPlugin(authorPlugins, 'solid') ? [solidPlugin()] : []
  return {
    extends: true,
    plugins: [...solid, nodeConditions()],
    test: {
      name: 'unit',
      environment,
      include: UNIT_TESTS,
      environmentOptions: {happyDOM: VIEWPORT},
      setupFiles: [UNIT_SETUP],
      provide: {concivPollTimeoutMs: POLL_TIMEOUT_MS, concivViewport: VIEWPORT},
      ...(environment === 'node' ? {server: {deps: {external: [WORKSPACE_DIST]}}} : {}),
    },
  }
}

const ProjectFilterSchema = z.object({project: z.union([z.string(), z.array(z.string())]).optional()})

function selectedProjects(projects: TestProjectInlineConfiguration[], test: unknown): TestProjectInlineConfiguration[] {
  const names = [ProjectFilterSchema.safeParse(test).data?.project ?? []].flat()
  if (names.length === 0) return projects.filter((project) => project.test?.name !== 'perf')
  return projects.filter((project) => typeof project.test?.name === 'string' && names.includes(project.test.name))
}

async function testProjects(
  environment: UnitEnvironment,
  authorPlugins: UserConfig['plugins'],
  browser: boolean,
): Promise<TestProjectInlineConfiguration[]> {
  const browserProjects = browser
    ? (await import('@internal/vitest-config/browser-project')).browserProjects(authorPlugins)
    : []
  return [
    ...browserProjects,
    unitProject(environment, authorPlugins),
    {
      extends: true,
      plugins: [nodeConditions()],
      test: {
        name: 'it',
        environment: 'node',
        include: IT_TESTS,
        server: {deps: {external: [WORKSPACE_DIST]}},
      },
    },
  ]
}

export function concivTest(options: {environment?: UnitEnvironment; browser?: boolean} = {}): Plugin {
  const environment = options.environment ?? 'node'
  return {
    name: 'conciv:test',
    async config(config, env) {
      if (env.mode !== 'test') return
      const defaults = testDefaults(config.test)
      if (config.test?.name !== undefined) return {test: defaults}
      const projects = await testProjects(environment, config.plugins, options.browser ?? false)
      return {test: {...defaults, projects: selectedProjects(projects, config.test)}}
    },
  }
}
