import {describe, expect, it} from 'vitest'
import {annotateSiteFile} from '../src/lib/source-annotations'

const ROOT = '/repo/apps/site'
const FIXTURE = 'export function Hero() {\n  return <h1 className="od-display">hi</h1>\n}\n'

describe('annotateSiteFile', () => {
  it('stamps data-conciv-source with a root-relative path', () => {
    const out = annotateSiteFile(FIXTURE, `${ROOT}/src/components/landing/hero.tsx`, ROOT)
    expect(out?.code).toContain('data-conciv-source="src/components/landing/hero.tsx:2:10"')
  })

  it('ignores files outside src/', () => {
    const out = annotateSiteFile(FIXTURE, `${ROOT}/node_modules/pkg/thing.tsx`, ROOT)
    expect(out).toBeNull()
  })

  it('ignores non-jsx files', () => {
    const out = annotateSiteFile('export const x = 1\n', `${ROOT}/src/lib/pair-text.ts`, ROOT)
    expect(out).toBeNull()
  })
})
