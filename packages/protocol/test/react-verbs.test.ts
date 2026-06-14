import {describe, expect, it} from 'vitest'
import {PAGE_QUERY_KINDS, MUTATING_KINDS, PageQuerySchema} from '../src/page-types.js'

describe('react verbs', () => {
  it('registers locate/tree/inspect/find as known kinds', () => {
    for (const k of ['locate', 'tree', 'inspect', 'find'] as const) {
      expect(PAGE_QUERY_KINDS).toContain(k)
    }
  })

  it('treats them as non-mutating reads', () => {
    for (const k of ['locate', 'tree', 'inspect', 'find']) {
      expect(MUTATING_KINDS).not.toContain(k)
    }
  })

  it('accepts find with a component name in `name`', () => {
    const parsed = PageQuerySchema.safeParse({kind: 'find', name: 'LoginForm'})
    expect(parsed.success).toBe(true)
  })
})
