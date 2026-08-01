import {describe, it, expect} from 'vitest'
import {PageQuerySchema, PAGE_QUERY_KINDS} from '../src/page-types.js'

describe('ext page-query kind', () => {
  it('includes ext in the kind set', () => {
    expect(PAGE_QUERY_KINDS).toContain('ext')
  })
  it('parses an ext query with extension/verb/argsJson', () => {
    const parsed = PageQuerySchema.parse({kind: 'ext', extension: 'tanstack', verb: 'routerState', argsJson: '{}'})
    expect(parsed).toMatchObject({kind: 'ext', extension: 'tanstack', verb: 'routerState'})
  })
})
