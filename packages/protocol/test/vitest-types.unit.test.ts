import {describe, it, expect} from 'vitest'
import {parseFailure} from '../src/vitest-types.js'

describe('parseFailure', () => {
  it('extracts message, file, and line from a v4 TestError + stacks', () => {
    const tc = {
      name: 'rejects an expired token',
      module: {moduleId: '/app/src/auth.test.ts'},
      result: () => ({
        state: 'failed' as const,
        errors: [{message: 'expected 200 to be 401', stacks: [{file: '/app/src/auth.test.ts', line: 42, column: 18}]}],
      }),
    }
    expect(parseFailure(tc)).toEqual({
      file: '/app/src/auth.test.ts',
      name: 'rejects an expired token',
      message: 'expected 200 to be 401',
      stack: 'expected 200 to be 401',
      line: 42,
    })
  })

  it('returns null when the test did not fail', () => {
    const tc = {name: 'ok', module: {moduleId: '/a.test.ts'}, result: () => ({state: 'passed' as const})}
    expect(parseFailure(tc)).toBeNull()
  })
})
