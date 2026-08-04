import {describe, expect, test} from 'vitest'
import {isRecord, lintDiagnostics} from './run-lint.js'

type Finding = {message: string; line: number}

function firstLine(diagnostic: Record<string, unknown>): number {
  const labels = diagnostic.labels
  if (!Array.isArray(labels)) return 0
  const [label] = labels
  if (!isRecord(label) || !isRecord(label.span) || typeof label.span.line !== 'number') return 0
  return label.span.line
}

async function lintFixture(fixture: string): Promise<Finding[]> {
  const diagnostics = await lintDiagnostics('test/oxlintrc.json', `test/fixtures/${fixture}`)
  return diagnostics
    .filter((diagnostic) => diagnostic.code === 'conciv(router-idioms)')
    .map((diagnostic) => ({message: String(diagnostic.message), line: firstLine(diagnostic)}))
}

describe('bare router hooks in route files', () => {
  test('flags every bare route-scoped hook imported from @tanstack/react-router', async () => {
    const findings = await lintFixture('src/routes/bare-hooks.tsx')
    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining('useNavigate'),
      expect.stringContaining('useSearch'),
    ])
    expect(findings[0]?.message).toContain('getRouteApi')
  })

  test('accepts route-scoped access through getRouteApi', async () => {
    expect(await lintFixture('src/routes/route-scoped.tsx')).toEqual([])
  })

  test('leaves shared components outside src/routes alone', async () => {
    expect(await lintFixture('src/components/shared-search.tsx')).toEqual([])
  })
})

describe('useRouterState matches mining', () => {
  test('flags a select body that reads .matches', async () => {
    const findings = await lintFixture('src/components/matches-mining.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('matchRoutes')
    expect(findings[0]?.line).toBe(4)
  })
})

describe('validateSearch schemas', () => {
  test('flags an inline field that cannot fall back', async () => {
    const findings = await lintFixture('src/routes/inline-search.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('page')
    expect(findings[0]?.message).toContain('.catch(')
  })

  test('reports a locally declared schema once, not once per reference', async () => {
    const findings = await lintFixture('src/routes/local-schema.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('page')
  })

  test('checks search schemas declared outside src/routes', async () => {
    const findings = await lintFixture('src/lib/loose-search-schemas.ts')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('token')
  })

  test('accepts fields that carry .catch()', async () => {
    expect(await lintFixture('src/lib/search-schemas.ts')).toEqual([])
  })
})
