import {describe, expect, test} from 'vitest'
import {lintDiagnostics} from './run-lint.js'

type Finding = {code: string; message: string}

async function lintFixture(fixture: string): Promise<Finding[]> {
  const diagnostics = await lintDiagnostics('test/oxlintrc-waits.json', `test/fixtures/waits/${fixture}`)
  return diagnostics.map((diagnostic) => ({code: String(diagnostic.code), message: String(diagnostic.message)}))
}

describe('conciv/no-timers-in-tests', () => {
  test('flags every timer a test schedules for itself', async () => {
    const reported = (await lintFixture('timers-fixture.ts')).filter(
      (finding) => finding.code === 'conciv(no-timers-in-tests)',
    )
    expect(reported).toHaveLength(3)
    expect(reported.map((finding) => finding.message.split(' ')[0])).toEqual([
      'setTimeout',
      'setInterval',
      'setImmediate',
    ])
    expect(reported[0]?.message).toContain('Await the async surface')
  })

  test('leaves a wait that awaits a registered callback alone', async () => {
    const reported = (await lintFixture('honest-fixture.ts')).filter(
      (finding) => finding.code === 'conciv(no-timers-in-tests)',
    )
    expect(reported).toEqual([])
  })
})

describe('conciv/no-predicate-waits', () => {
  test('flags exported functions and types that take a boolean-returning callback', async () => {
    const reported = (await lintFixture('testkit-fixture.ts')).filter(
      (finding) => finding.code === 'conciv(no-predicate-waits)',
    )
    expect(reported).toHaveLength(2)
    expect(reported[0]?.message).toContain('turns an assertion into a wait')
  })

  test('leaves value-returning waits and unexported predicates alone', async () => {
    const reported = (await lintFixture('honest-fixture.ts')).filter(
      (finding) => finding.code === 'conciv(no-predicate-waits)',
    )
    expect(reported).toEqual([])
  })
})
