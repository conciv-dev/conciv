import {z} from 'zod'
import {fromSpecTokenUsage, type SpecTokenUsage, type TokenUsage as LibraryTokenUsage} from '@tanstack/ai'

export type TokenUsage = LibraryTokenUsage

export type ReportedUsage = TokenUsage | SpecTokenUsage[] | undefined

export function toTokenUsage(usage: ReportedUsage): TokenUsage | undefined {
  return Array.isArray(usage) ? fromSpecTokenUsage(usage) : usage
}

const TokenCountSchema = z.number().int().nonnegative()

export const TokenUsageSchema = z.object({
  promptTokens: TokenCountSchema,
  completionTokens: TokenCountSchema,
  totalTokens: TokenCountSchema,
  promptTokensDetails: z
    .object({
      cachedTokens: TokenCountSchema.optional(),
      cacheWriteTokens: TokenCountSchema.optional(),
      cacheWrite1hTokens: TokenCountSchema.optional(),
      audioTokens: TokenCountSchema.optional(),
      videoTokens: TokenCountSchema.optional(),
      imageTokens: TokenCountSchema.optional(),
      textTokens: TokenCountSchema.optional(),
      documentTokens: TokenCountSchema.optional(),
    })
    .optional(),
  completionTokensDetails: z
    .object({
      reasoningTokens: TokenCountSchema.optional(),
      audioTokens: TokenCountSchema.optional(),
      videoTokens: TokenCountSchema.optional(),
      imageTokens: TokenCountSchema.optional(),
      textTokens: TokenCountSchema.optional(),
      documentTokens: TokenCountSchema.optional(),
    })
    .optional(),
  billed: z.object({quantity: z.number().nonnegative(), unit: z.string()}).optional(),
  providerUsageDetails: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.looseObject({})]))
    .optional(),
  cost: z.number().nonnegative().optional(),
  costDetails: z
    .object({
      upstreamCost: z.number().nonnegative().optional(),
      upstreamInputCost: z.number().nonnegative().optional(),
      upstreamOutputCost: z.number().nonnegative().optional(),
    })
    .optional(),
}) satisfies z.ZodType<TokenUsage>

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
    totalCostUsd: usage.cost ?? provider.totalCostUsd,
    numTurns: provider.numTurns,
  }
}

export function contextUsedTokens(snapshot: UsageSnapshot): number | undefined {
  return snapshot.contextTokens
}
