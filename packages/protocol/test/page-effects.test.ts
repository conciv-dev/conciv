import {describe, expect, it} from 'vitest'
import {PAGE_QUERY_KINDS, PageQuerySchema} from '../src/page-types.js'

describe('page effects protocol', () => {
  it('adds the effect kind and accepts an effect query', () => {
    expect(PAGE_QUERY_KINDS).toContain('effect')
    const parsed = PageQuerySchema.parse({kind: 'effect', effect: 'highlight', action: 'enable'})
    expect(parsed).toMatchObject({kind: 'effect', effect: 'highlight', action: 'enable'})
  })
})
