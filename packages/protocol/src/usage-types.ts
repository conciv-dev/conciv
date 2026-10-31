import {z} from 'zod'
import {fromSpecTokenUsage, type SpecTokenUsage, type TokenUsage as LibraryTokenUsage} from '@tanstack/ai'

export type TokenUsage = LibraryTokenUsage

export type ReportedUsage = TokenUsage | SpecTokenUsage[] | undefined

export function toTokenUsage(usage: ReportedUsage): TokenUsage | undefined {
  return Array.isArray(usage) ? fromSpecTokenUsage(usage) : usage
}

export const UsageSnapshotSchema = z.object({
  modelId: z.string().optional(),
  contextWindow: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  contextTokens: z.number().int().nonnegative().optional(),
  totalCostUsd: z.number().nonnegative().optional(),
  numTurns: z.number().int().nonnegative().optional(),
})
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>

const ProviderUsageSchema = z
  .object({
    modelId: z.string().optional().catch(undefined),
    contextWindow: z.number().optional().catch(undefined),
    totalCostUsd: z.number().optional().catch(undefined),
    numTurns: z.number().optional().catch(undefined),
  })
  .catch({})

export function tokenUsageToSnapshot(usage: TokenUsage): UsageSnapshot {
  const provider = ProviderUsageSchema.parse(usage.providerUsageDetails ?? {})
  return {
    modelId: provider.modelId,
    contextWindow: provider.contextWindow,
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    cacheReadTokens: usage.promptTokensDetails?.cachedTokens,
    cacheWriteTokens: usage.promptTokensDetails?.cacheWriteTokens,
    reasoningTokens: usage.completionTokensDetails?.reasoningTokens,
    totalCostUsd: provider.totalCostUsd,
    numTurns: provider.numTurns,
  }
}

export function contextUsedTokens(snapshot: UsageSnapshot): number | undefined {
  return snapshot.contextTokens
}
