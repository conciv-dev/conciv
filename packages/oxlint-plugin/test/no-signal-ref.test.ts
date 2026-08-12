import {describe, expect, test} from 'vitest'
import {lintDiagnostics} from './run-lint.js'

async function lintFixture(fixture: string) {
  const diagnostics = await lintDiagnostics('test/oxlintrc-signal-ref.json', `test/fixtures/signal-ref/${fixture}`)
  return diagnostics
    .filter((diagnostic) => diagnostic.code === 'conciv(no-signal-ref)')
    .map((diagnostic) => String(diagnostic.message))
}

describe('conciv/no-signal-ref', () => {
  test('flags a signal whose getter is only read inside a named JSX-handler-only function', async () => {
    const findings = await lintFixture('handler-only-ref.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('box')
    expect(findings[0]).toContain('setBox')
    expect(findings[0]).toContain('let box')
  })

  test('flags a signal whose getter is only read inside an inline JSX event handler', async () => {
    const findings = await lintFixture('inline-handler-ref.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('box')
  })

  test('leaves a signal alone when the getter is read inside createEffect', async () => {
    expect(await lintFixture('tracked-effect-ref.tsx')).toEqual([])
  })

  test('leaves a signal alone when the getter is passed bare to a primitive', async () => {
    expect(await lintFixture('primitive-passed-ref.tsx')).toEqual([])
  })
})
