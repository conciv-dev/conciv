import {describe, expect, it} from 'vitest'
import {hiddenMatchSummary, type SearchFileGroup} from '../src/styled/tools/search-matches.js'

describe('hiddenMatchSummary', () => {
  it('does not count a file whose matches are all visible', () => {
    const groups: SearchFileGroup[] = [
      {file: 'a.ts', matches: [{file: 'a.ts', line: 1, snippet: 'a'}]},
      {file: 'b.ts', matches: [{file: 'b.ts', line: 1, snippet: 'b'}]},
    ]
    const summary = hiddenMatchSummary(groups, 2)
    expect(summary.matches).toBe(1)
    expect(summary.files).toBe(1)
  })
})
