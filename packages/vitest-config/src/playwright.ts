import type {PlaywrightTestConfig, ReporterDescription} from '@playwright/test'

function playwrightReporters(): ReporterDescription[] {
  if (!process.env.GITHUB_ACTIONS) return [['line']]
  return [['line'], ['json', {outputFile: 'test-results.json'}]]
}

export function ciPlaywright(): Pick<PlaywrightTestConfig, 'timeout' | 'expect' | 'reporter' | 'use'> {
  return {
    timeout: 60_000,
    expect: {timeout: 5_000},
    reporter: playwrightReporters(),
    use: {headless: true},
  }
}
