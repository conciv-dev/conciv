import {describe, expect, test} from 'vitest'
import {lintDiagnostics} from './run-lint.js'

async function lintFixture(fixture: string): Promise<string[]> {
  const diagnostics = await lintDiagnostics(
    'test/oxlintrc-solid-test-render.json',
    `test/fixtures/solid-test-render/${fixture}`,
  )
  return diagnostics
    .filter((diagnostic) => diagnostic.code === 'conciv(solid-test-render)')
    .map((diagnostic) => String(diagnostic.message))
}

async function lintOutsideFixture(fixture: string): Promise<string[]> {
  const diagnostics = await lintDiagnostics(
    'test/oxlintrc-solid-test-render.json',
    `fixtures/solid-test-render-outside/${fixture}`,
  )
  return diagnostics
    .filter((diagnostic) => diagnostic.code === 'conciv(solid-test-render)')
    .map((diagnostic) => String(diagnostic.message))
}

describe('solid-test-render', () => {
  test('flags render imported from solid-js/web in a test file', async () => {
    const findings = await lintFixture('render-violation.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('render')
    expect(findings[0]).toContain('@solidjs/testing-library')
  })

  test('flags hydrate imported from solid-js/web in a test file', async () => {
    const findings = await lintFixture('hydrate-violation.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('hydrate')
  })

  test('leaves render imported from @solidjs/testing-library alone', async () => {
    expect(await lintFixture('clean-testing-library.tsx')).toEqual([])
  })

  test('leaves an unrelated solid-js/web import alone', async () => {
    expect(await lintFixture('unrelated-import.tsx')).toEqual([])
  })

  test('exempts the app fixture that boots a host under test/fixtures', async () => {
    expect(await lintFixture('test/fixtures/host/main.tsx')).toEqual([])
  })

  test('flags render imported from solid-js/web in a .spec.tsx file outside a test directory', async () => {
    const findings = await lintOutsideFixture('spec-violation.spec.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('render')
  })

  test('flags render imported from solid-js/web in a .test.jsx file outside a test directory', async () => {
    const findings = await lintOutsideFixture('jsx-violation.test.jsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('render')
  })
})
