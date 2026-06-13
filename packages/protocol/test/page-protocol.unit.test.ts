import {describe, it, expect} from 'vitest'
import {ok, err, isError, isMutating, PAGE_QUERY_KINDS, MUTATING_KINDS} from '../src/page-protocol.js'

describe('page-protocol', () => {
  it('ok() tags a result and err()/isError() round-trip', () => {
    expect(ok({value: 'x'})).toEqual({ok: true, value: 'x'})
    expect(isError(ok())).toBe(false)
    expect(isError(err('boom'))).toBe(true)
  })

  it('isMutating reflects MUTATING_KINDS', () => {
    expect(isMutating('fill')).toBe(true)
    expect(isMutating('eval')).toBe(true)
    expect(isMutating('text')).toBe(false)
    expect(isMutating('snapshot')).toBe(false)
  })

  it('every mutating kind is a known kind (no drift)', () => {
    for (const k of MUTATING_KINDS) expect(PAGE_QUERY_KINDS).toContain(k)
  })
})
