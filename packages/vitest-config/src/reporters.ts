import {join} from 'node:path'

type CiReporterEntry = 'default' | ['github-actions', {jobSummary: {enabled: boolean}}] | ['json', {outputFile: string}]

type CiCoverage = {
  enabled: boolean
  provider: 'v8'
  reporter: ['json-summary']
  reportsDirectory: string
}

export function ciReporters(): CiReporterEntry[] {
  if (!process.env.GITHUB_ACTIONS) return ['default']
  return ['default', ['github-actions', {jobSummary: {enabled: false}}], ['json', {outputFile: 'test-results.json'}]]
}

const TEST_TIMEOUT_MS = 30_000
const HOOK_TIMEOUT_MS = 30_000
export const POLL_TIMEOUT_MS = 5_000
const POLL_INTERVAL_MS = 50
const CONCIV_HOME_SETUP = join(import.meta.dirname, 'setup/conciv-home-setup.ts')
const NOTHING_LOGGED_SETUP = join(import.meta.dirname, 'setup/nothing-logged-setup.ts')

function forkCap(): number | undefined {
  const cap = Number(process.env.VITEST_MAX_FORKS)
  if (!Number.isInteger(cap) || cap < 1) return undefined
  return cap
}

export function ciTest(): {
  reporters: CiReporterEntry[]
  coverage: CiCoverage
  testTimeout: number
  hookTimeout: number
  teardownTimeout: number
  expect: {poll: {timeout: number; interval: number}}
  maxWorkers?: number
  globalSetup: string[]
  setupFiles: string[]
} {
  const maxWorkers = forkCap()
  return {
    reporters: ciReporters(),
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: HOOK_TIMEOUT_MS,
    teardownTimeout: 30_000,
    expect: {poll: {timeout: POLL_TIMEOUT_MS, interval: POLL_INTERVAL_MS}},
    coverage: {
      enabled: Boolean(process.env.GITHUB_ACTIONS),
      provider: 'v8',
      reporter: ['json-summary'],
      reportsDirectory: 'coverage',
    },
    globalSetup: [CONCIV_HOME_SETUP],
    setupFiles: [NOTHING_LOGGED_SETUP],
    ...(maxWorkers === undefined ? {} : {maxWorkers}),
  }
}

const SOLID_CLEANUP_SETUP_ENTRY = '@conciv/vitest-config/solid-cleanup'

export function ciTestSolidBrowser(): ReturnType<typeof ciTest> {
  const base = ciTest()
  return {
    ...base,
    setupFiles: [...base.setupFiles, SOLID_CLEANUP_SETUP_ENTRY],
  }
}

export const TANSTACK_AI_SOLID_DEPS = [
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client',
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client/byok',
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client/devtools',
]

export function browserOptimizeDeps(alsoInclude: string[] = []): {
  include: string[]
} {
  return {
    include: alsoInclude,
  }
}
