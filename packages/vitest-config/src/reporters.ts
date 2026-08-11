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
  maxWorkers?: number
} {
  const maxWorkers = forkCap()
  return {
    reporters: ciReporters(),
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
    coverage: {
      enabled: Boolean(process.env.GITHUB_ACTIONS),
      provider: 'v8',
      reporter: ['json-summary'],
      reportsDirectory: 'coverage',
    },
    ...(maxWorkers === undefined ? {} : {maxWorkers}),
  }
}

const SOLID_CLEANUP_SETUP_ENTRY = '@conciv/vitest-config/solid-cleanup'

export function ciTestSolidBrowser(): {
  reporters: CiReporterEntry[]
  coverage: CiCoverage
  testTimeout: number
  hookTimeout: number
  teardownTimeout: number
  maxWorkers?: number
  setupFiles: string[]
} {
  return {
    ...ciTest(),
    setupFiles: [SOLID_CLEANUP_SETUP_ENTRY],
  }
}

const LATE_DISCOVERED_BROWSER_DEPS = ['lucide-solid']

export function browserOptimizeDeps(): {
  include: string[]
} {
  return {
    include: LATE_DISCOVERED_BROWSER_DEPS,
  }
}
