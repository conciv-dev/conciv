import {z} from 'zod'
import {EventType, type StreamChunk, type TokenUsage} from '@tanstack/ai'

// Normalized per-session model usage; every field optional so a harness reports only what it has.
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

// Fields with no standard TokenUsage slot ride providerUsageDetails (one type keeps the mappers in sync).
type AidxProviderUsage = {
  modelId?: string
  contextWindow?: number
  totalCostUsd?: number
  numTurns?: number
}

// Snapshot → native TokenUsage on RUN_FINISHED (survives chat(); CUSTOM chunks do not).
export function snapshotToTokenUsage(s: UsageSnapshot): TokenUsage {
  const provider: AidxProviderUsage = {
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

// Inverse of snapshotToTokenUsage: read a RUN_FINISHED usage back into our display shape.
export function tokenUsageToSnapshot(u: TokenUsage): UsageSnapshot {
  const p = (u.providerUsageDetails ?? {}) as AidxProviderUsage
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

// Live usage carried to the widget mid-turn as an AG-UI CUSTOM event, injected by core post-chat()
// (the same seam aidx-ui uses). RUN_FINISHED.usage stays the canonical end-of-turn/persist value.
export const AIDX_USAGE_EVENT = 'aidx-usage'
export function aguiUsageFor(snapshot: UsageSnapshot): StreamChunk {
  return {type: EventType.CUSTOM, name: AIDX_USAGE_EVENT, value: snapshot}
}

// Context occupancy = prompt resident in the window (input + cache), excluding output; undefined when no tokens.
export function contextUsedTokens(s: UsageSnapshot): number | undefined {
  const parts = [s.inputTokens, s.cacheReadTokens, s.cacheWriteTokens]
  if (parts.every((p) => p === undefined)) return undefined
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0)
}
