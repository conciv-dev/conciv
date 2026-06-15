import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {UsageSnapshotSchema, AIDX_USAGE_EVENT, aguiUsageFor, contextUsedTokens} from '../src/usage-types.js'

describe('usage-types', () => {
  it('parses a partial snapshot (all fields optional)', () => {
    expect(UsageSnapshotSchema.safeParse({}).success).toBe(true)
    const r = UsageSnapshotSchema.safeParse({inputTokens: 10, contextWindow: 200000})
    expect(r.success && r.data.inputTokens).toBe(10)
  })

  it('rejects negative tokens', () => {
    expect(UsageSnapshotSchema.safeParse({inputTokens: -1}).success).toBe(false)
  })

  it('wraps a snapshot as a CUSTOM chunk named aidx-usage', () => {
    const chunk = aguiUsageFor({inputTokens: 5})
    expect(chunk.type).toBe(EventType.CUSTOM)
    expect((chunk as {name: string}).name).toBe(AIDX_USAGE_EVENT)
    expect((chunk as {value: unknown}).value).toEqual({inputTokens: 5})
  })

  it('sums prompt-side tokens for occupancy, excludes output', () => {
    expect(contextUsedTokens({inputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 10, outputTokens: 999})).toBe(160)
  })

  it('returns undefined when no token fields present', () => {
    expect(contextUsedTokens({totalCostUsd: 1})).toBeUndefined()
  })
})
