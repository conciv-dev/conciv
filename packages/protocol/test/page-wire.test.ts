import {describe, expect, it} from 'vitest'
import {PageQuerySchema} from '../src/page-types.js'

describe('page wire envelope', () => {
  it('carries requestId, name and input and nothing kind-shaped', () => {
    const parsed = PageQuerySchema.parse({requestId: 'pq1', name: 'page_click', input: {selector: '#go'}})
    expect(parsed).toEqual({requestId: 'pq1', name: 'page_click', input: {selector: '#go'}})
  })

  it('rejects a nameless query', () => {
    expect(PageQuerySchema.safeParse({requestId: 'pq1', input: {}}).success).toBe(false)
  })
})
