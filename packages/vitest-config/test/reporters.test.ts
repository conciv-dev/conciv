import {afterEach, expect, test, vi} from 'vitest'
import {ciReporters} from '../src/reporters.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

test('local runs keep the default reporter only', () => {
  vi.stubEnv('GITHUB_ACTIONS', undefined)
  expect(ciReporters()).toEqual(['default'])
})

test('CI runs add json results and annotation reporters without the noisy job summary', () => {
  vi.stubEnv('GITHUB_ACTIONS', 'true')
  expect(ciReporters()).toEqual([
    'default',
    ['github-actions', {jobSummary: {enabled: false}}],
    ['json', {outputFile: 'test-results.json'}],
  ])
})
