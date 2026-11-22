import {describe, expect, test} from 'vitest'
import {resolve} from 'node:path'
import {coverageByPackage, isWorkspaceSource, mergeLcov, mergeSummaries, parseSummaries, rebaseLcov} from './summary.ts'

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

  test('credits each source file to the package that owns it, whichever package ran it, and leaves dist out', () => {
    const root = resolve('../..')
    const fromChat = rebaseLcov(
      'SF:../vitest-config/src/shards.ts\nDA:1,1\nDA:2,0\nend_of_record\nSF:dist/index.js\nDA:1,0\nend_of_record\n',
      resolve('../chat'),
      root,
    )
    const fromOwnRun = rebaseLcov('SF:src/shards.ts\nDA:2,3\nend_of_record\n', resolve('.'), root)

    const merged = mergeLcov([fromChat, fromOwnRun], isWorkspaceSource)

    expect(merged.files).toEqual([{file: 'packages/vitest-config/src/shards.ts', covered: 2, total: 2}])
    expect(coverageByPackage(merged.files, root)).toEqual(new Map([['@conciv/vitest-config', {covered: 2, total: 2}]]))
  })
  test('lists a source file no run loaded at 0 lines covered, and leaves a loaded file to the lines its run recorded', () => {
    const merged = mergeLcov(['SF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record\n'], () => true, [
      'SF:src/a.ts\nDA:1,0\nDA:2,0\nDA:5,0\nend_of_record\nSF:src/never.ts\nDA:1,0\nDA:3,0\nend_of_record\n',
    ])

    expect(merged.files).toEqual([
      {file: 'src/a.ts', covered: 1, total: 2},
      {file: 'src/never.ts', covered: 0, total: 2},
    ])
  })
})
