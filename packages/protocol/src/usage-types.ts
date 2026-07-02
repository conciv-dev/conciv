import {z} from 'zod'
import {EventType, type StreamChunk, type TokenUsage} from '@tanstack/ai'

export const UsageSnapshotSchema = z.object({
  modelId: z.string().optional(),
  contextWindow: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  totalCostUsd: z.number().nonnegative().optional(),
  numTurns: z.number().int().nonnegative().optional(),
})
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>

type ConcivProviderUsage = {
  modelId?: string
  contextWindow?: number
  totalCostUsd?: number
  numTurns?: number
}

export function snapshotToTokenUsage(s: UsageSnapshot): TokenUsage {
  const provider: ConcivProviderUsage = {
    modelId: s.modelId,
    contextWindow: s.contextWindow,
    totalCostUsd: s.totalCostUsd,
    numTurns: s.numTurns,
  }
  return {
    promptTokens: s.inputTokens ?? 0,
    completionTokens: s.outputTokens ?? 0,
    totalTokens: (s.inputTokens ?? 0) + (s.outputTokens ?? 0),
    promptTokensDetails: {cachedTokens: s.cacheReadTokens, cacheWriteTokens: s.cacheWriteTokens},
    completionTokensDetails: {reasoningTokens: s.reasoningTokens},
    providerUsageDetails: provider,
  }
}

export function tokenUsageToSnapshot(u: TokenUsage): UsageSnapshot {
  const p = (u.providerUsageDetails ?? {}) as ConcivProviderUsage
  return {
    modelId: p.modelId,
    contextWindow: p.contextWindow,
    inputTokens: u.promptTokens,
    outputTokens: u.completionTokens,
    cacheReadTokens: u.promptTokensDetails?.cachedTokens,
    cacheWriteTokens: u.promptTokensDetails?.cacheWriteTokens,
    reasoningTokens: u.completionTokensDetails?.reasoningTokens,
    totalCostUsd: p.totalCostUsd,
    numTurns: p.numTurns,
  }
}

export const CONCIV_USAGE_EVENT = 'conciv-usage'
export function aguiUsageFor(snapshot: UsageSnapshot): StreamChunk {
  return {type: EventType.CUSTOM, name: CONCIV_USAGE_EVENT, value: snapshot}
}

export function contextUsedTokens(s: UsageSnapshot): number | undefined {
  const parts = [s.inputTokens, s.cacheReadTokens, s.cacheWriteTokens]
  if (parts.every((p) => p === undefined)) return undefined
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0)
}
