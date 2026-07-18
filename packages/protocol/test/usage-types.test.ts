import {describe, it, expect} from 'vitest'
import {UsageSnapshotSchema, snapshotToTokenUsage, tokenUsageToSnapshot, contextUsedTokens} from '../src/usage-types.js'

describe('usage-types', () => {
  it('parses a partial snapshot (all fields optional)', () => {
    expect(UsageSnapshotSchema.safeParse({}).success).toBe(true)
    const r = UsageSnapshotSchema.safeParse({inputTokens: 10, contextWindow: 200000})
    expect(r.success && r.data.inputTokens).toBe(10)
  })

  it('rejects negative tokens', () => {
    expect(UsageSnapshotSchema.safeParse({inputTokens: -1}).success).toBe(false)
  })

  it('maps a snapshot onto native TokenUsage (cache + reasoning + provider escape hatch)', () => {
    const u = snapshotToTokenUsage({
      modelId: 'claude-opus-4-8[1m]',
      contextWindow: 1000000,
      inputTokens: 100,
      outputTokens: 5,
      cacheReadTokens: 50,
      cacheWriteTokens: 10,
      reasoningTokens: 3,
      totalCostUsd: 0.01,
      numTurns: 1,
    })
    expect(u.promptTokens).toBe(100)
    expect(u.completionTokens).toBe(5)
    expect(u.promptTokensDetails?.cachedTokens).toBe(50)
    expect(u.promptTokensDetails?.cacheWriteTokens).toBe(10)
    expect(u.completionTokensDetails?.reasoningTokens).toBe(3)
    expect((u.providerUsageDetails as {contextWindow?: number}).contextWindow).toBe(1000000)
  })

  it('round-trips snapshot → TokenUsage → snapshot', () => {
    const s = {
      modelId: 'claude-opus-4-8[1m]',
      contextWindow: 1000000,
      inputTokens: 18151,
      outputTokens: 19,
      cacheReadTokens: 15832,
      cacheWriteTokens: 1912,
      totalCostUsd: 0.118,
      numTurns: 1,
    }
    expect(tokenUsageToSnapshot(snapshotToTokenUsage(s))).toMatchObject(s)
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
