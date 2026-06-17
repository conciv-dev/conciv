import {describe, it, expect} from 'vitest'
import {addSourceToJsx} from '../src/core/inject-source.js'

const ROOT = '/proj'

describe('addSourceToJsx', () => {
  it('stamps a host element with data-aidx-source="<relpath>:<line>:<col>"', () => {
    const code = `export const A = () => <div className="x">hi</div>\n`
    const out = addSourceToJsx(code, `${ROOT}/src/App.tsx`, ROOT)
    expect(out).not.toBeNull()
    expect(out!.code).toContain('data-aidx-source="src/App.tsx:1:24"')
    expect(out!.code).toContain('className="x"') // original attrs preserved
  })

  it('handles self-closing elements', () => {
    const code = `export const B = () => <img src="a.png" />\n`
    const out = addSourceToJsx(code, `${ROOT}/src/B.tsx`, ROOT)
    expect(out!.code).toMatch(/<img src="a\.png"\s+data-aidx-source="src\/B\.tsx:1:\d+"\s*\/>/)
  })

  it('skips Fragments', () => {
    const code = `export const C = () => <><span>x</span></>\n`
    const out = addSourceToJsx(code, `${ROOT}/src/C.tsx`, ROOT)
    // the <span> gets stamped, the fragment does not
    expect(out!.code).toContain('<span data-aidx-source=')
    expect(out!.code).not.toContain('<> data-aidx-source')
  })

  it('returns null for non-JSX files', () => {
    expect(addSourceToJsx('export const x = 1', `${ROOT}/src/util.ts`, ROOT)).toBeNull()
  })

  it('returns null when there is no JSX', () => {
    expect(addSourceToJsx('export const x = 1', `${ROOT}/src/util.tsx`, ROOT)).toBeNull()
  })

  it('does not double-stamp an element that already has the attribute', () => {
    const code = `export const D = () => <div data-aidx-source="x">y</div>\n`
    const out = addSourceToJsx(code, `${ROOT}/src/D.tsx`, ROOT)
    expect(out).toBeNull()
  })

  it('JSON-escapes the path so a quote cannot break out of the attribute', () => {
    const code = `export const E = () => <div>q</div>\n`
    const out = addSourceToJsx(code, `${ROOT}/src/we"ird.tsx`, ROOT)
    // the embedded quote is escaped, not a raw attribute breakout
    expect(out!.code).toContain('\\"')
    expect(out!.code).not.toContain('data-aidx-source="src/we"ird')
  })
})
