import {describe, it, expect} from 'vitest'
import {UsageSnapshotSchema, contextUsedTokens} from '../src/usage-types.js'

describe('usage-types', () => {
  it('parses a partial snapshot (all fields optional)', () => {
    expect(UsageSnapshotSchema.safeParse({}).success).toBe(true)
    const r = UsageSnapshotSchema.safeParse({inputTokens: 10, contextWindow: 200000})
    expect(r.success && r.data.inputTokens).toBe(10)
  })

  it('rejects negative tokens', () => {
    expect(UsageSnapshotSchema.safeParse({inputTokens: -1}).success).toBe(false)
  })

  it('reports occupancy from contextTokens, never the billing sum', () => {
    expect(contextUsedTokens({contextTokens: 92000, inputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 10})).toBe(
      92000,
    )
  })

  it('returns undefined when no occupancy is present (billing totals are not occupancy)', () => {
    expect(contextUsedTokens({inputTokens: 773000, cacheReadTokens: 700000, totalCostUsd: 1})).toBeUndefined()
  })
})
