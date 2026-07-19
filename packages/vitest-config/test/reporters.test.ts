import {afterEach, expect, test, vi} from 'vitest'
import {ciReporters, ciTest} from '../src/reporters.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

test('local runs keep the default reporter only and disable coverage', () => {
  vi.stubEnv('GITHUB_ACTIONS', undefined)
  expect(ciReporters()).toEqual(['default'])
  expect(ciTest().coverage.enabled).toBe(false)
})

test('CI runs add json results and annotation reporters without the noisy job summary', () => {
  vi.stubEnv('GITHUB_ACTIONS', 'true')
  expect(ciReporters()).toEqual([
    'default',
    ['github-actions', {jobSummary: {enabled: false}}],
    ['json', {outputFile: 'test-results.json'}],
  ])
})

test('CI runs collect v8 line coverage into a json summary', () => {
  vi.stubEnv('GITHUB_ACTIONS', 'true')
  expect(ciTest()).toEqual({
    reporters: ciReporters(),
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
    coverage: {enabled: true, provider: 'v8', reporter: ['json-summary'], reportsDirectory: 'coverage'},
  })
})
