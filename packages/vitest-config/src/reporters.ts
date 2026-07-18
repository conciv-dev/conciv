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

export function ciTest(): {
  reporters: CiReporterEntry[]
  coverage: CiCoverage
  testTimeout: number
  hookTimeout: number
  teardownTimeout: number
} {
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
  }
}
