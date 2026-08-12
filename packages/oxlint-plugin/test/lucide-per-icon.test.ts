import {describe, expect, test} from 'vitest'
import {lintDiagnostics, lintFix} from './run-lint.js'

async function lintFixture(fixture: string): Promise<string[]> {
  const diagnostics = await lintDiagnostics('test/oxlintrc-lucide-per-icon.json', `test/fixtures/${fixture}`)
  return diagnostics
    .filter((diagnostic) => diagnostic.code === 'conciv(lucide-per-icon)')
    .map((diagnostic) => String(diagnostic.message))
}

describe('lucide-per-icon', () => {
  test('flags a barrel value import', async () => {
    const findings = await lintFixture('lucide-per-icon/barrel-value-import.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('lucide-solid/icons/arrow-up')
  })

  test('flags a barrel import mixed with a type-only name', async () => {
    const findings = await lintFixture('lucide-per-icon/mixed-value-and-type.tsx')
    expect(findings).toHaveLength(1)
  })

  test('reports an unresolvable legacy alias without promising a fix', async () => {
    const findings = await lintFixture('lucide-per-icon/unresolvable-legacy-alias.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('MoreHorizontal')
    expect(findings[0]).toContain('more-horizontal')
  })

  test('leaves a type-only barrel import alone', async () => {
    expect(await lintFixture('lucide-per-icon/type-only-import.tsx')).toEqual([])
  })

  test('leaves an already-converted per-icon import alone', async () => {
    expect(await lintFixture('lucide-per-icon/already-per-icon.tsx')).toEqual([])
  })

  test('autofix rewrites a plain value import to its per-icon entry point', async () => {
    const fixed = await lintFix(
      'test/oxlintrc-lucide-per-icon.json',
      'test/fixtures/lucide-per-icon/barrel-value-import.tsx',
    )
    expect(fixed).toContain("import ArrowUp from 'lucide-solid/icons/arrow-up'")
    expect(fixed).toContain("import Close from 'lucide-solid/icons/x'")
    expect(fixed).not.toContain("from 'lucide-solid'\n")
  })

  test('autofix keeps type-only names in a separate type import', async () => {
    const fixed = await lintFix(
      'test/oxlintrc-lucide-per-icon.json',
      'test/fixtures/lucide-per-icon/mixed-value-and-type.tsx',
    )
    expect(fixed).toContain("import Circle from 'lucide-solid/icons/circle'")
    expect(fixed).toContain("import type {LucideIcon} from 'lucide-solid'")
  })

  test('autofix leaves an unresolvable legacy alias untouched', async () => {
    const fixed = await lintFix(
      'test/oxlintrc-lucide-per-icon.json',
      'test/fixtures/lucide-per-icon/unresolvable-legacy-alias.tsx',
    )
    expect(fixed).toContain("import {MoreHorizontal} from 'lucide-solid'")
  })
})
