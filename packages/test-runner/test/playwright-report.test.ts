import {describe, it, expect} from 'vitest'
import {parsePlaywrightReport, reportFiles} from '../src/playwright/report.js'

// A trimmed Playwright `--reporter=json` report: nested suites, one pass + one fail across files.
const REPORT = JSON.stringify({
  suites: [
    {
      file: 'home.spec.ts',
      specs: [{title: 'loads the home page', file: 'home.spec.ts', tests: [{results: [{status: 'passed', duration: 12}]}]}],
      suites: [
        {
          file: 'about.spec.ts',
          specs: [
            {
              title: 'shows the about heading',
              file: 'about.spec.ts',
              tests: [{results: [{status: 'failed', duration: 30, error: {message: 'expected About', stack: 'at about.spec.ts:9'}}]}],
            },
          ],
        },
      ],
    },
  ],
  stats: {duration: 42},
})

describe('parsePlaywrightReport', () => {
  it('maps nested specs to rows with state + duration', () => {
    const rows = parsePlaywrightReport(REPORT)
    expect(rows).toEqual([
      {file: 'home.spec.ts', name: 'loads the home page', state: 'pass', durationMs: 12, error: undefined},
      {
        file: 'about.spec.ts',
        name: 'shows the about heading',
        state: 'fail',
        durationMs: 30,
        error: {file: 'about.spec.ts', name: 'shows the about heading', message: 'expected About', stack: 'at about.spec.ts:9'},
      },
    ])
  })

  it('lists unique files', () => {
    expect(reportFiles(REPORT).toSorted()).toEqual(['about.spec.ts', 'home.spec.ts'])
  })

  it('returns [] on an unparseable report', () => {
    expect(parsePlaywrightReport('not json')).toEqual([])
  })
})
