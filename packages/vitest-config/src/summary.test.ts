import {describe, expect, test} from 'vitest'
import {mergeLcov, mergeSummaries, parseSummaries} from './summary.ts'

describe('the CI summary of a package split into parts', () => {
  test('adds the parts back up under the package name, so the next plan still sees the whole time', () => {
    const parts = [1, 2, 3, 4].flatMap((index) =>
      parseSummaries(
        JSON.stringify([
          {name: '@conciv/app', timeMs: 150_000, cases: [{title: `part ${index}`, status: 'passed', durationMs: 1}]},
        ]),
      ),
    )

    const [merged, ...rest] = mergeSummaries(parts)

    expect(rest).toEqual([])
    expect(merged).toEqual(expect.objectContaining({name: '@conciv/app', timeMs: 600_000, passed: 4}))
  })

  test('merges the parts coverage line by line, so a line two parts both ran counts once', () => {
    const merged = mergeLcov([
      'SF:src/a.ts\nDA:1,1\nDA:2,0\nDA:3,0\nLF:3\nLH:1\nend_of_record\n',
      'SF:src/a.ts\nDA:1,2\nDA:2,1\nDA:3,0\nLF:3\nLH:2\nend_of_record\nSF:src/b.ts\nDA:1,0\nLF:1\nLH:0\nend_of_record\n',
    ])

    expect(merged.coverage).toEqual({covered: 2, total: 4})
    expect(merged.lcov).toBe(
      'SF:src/a.ts\nDA:1,3\nDA:2,1\nDA:3,0\nLF:3\nLH:2\nend_of_record\nSF:src/b.ts\nDA:1,0\nLF:1\nLH:0\nend_of_record\n',
    )
  })
})
