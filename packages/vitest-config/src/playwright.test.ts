import {afterEach, describe, expect, test, vi} from 'vitest'
import {ciPlaywright} from './playwright.ts'

describe('the Playwright Test preset', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('a local run is headless with one test and assert budget, reported to the terminal only', () => {
    vi.stubEnv('GITHUB_ACTIONS', undefined)
    expect(ciPlaywright()).toEqual({
      timeout: 60_000,
      expect: {timeout: 5_000},
      reporter: [['line']],
      use: {headless: true},
    })
  })

  test('a CI run also writes the json report the shard summary reads', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    expect(ciPlaywright().reporter).toEqual([['line'], ['json', {outputFile: 'test-results.json'}]])
  })
})
