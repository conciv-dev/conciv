import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'

// A normalized, harness-agnostic snapshot of a session's model usage. Every field is
// optional: a harness reports only what its CLI exposes, and the widget degrades per
// missing field. Values are ABSOLUTE (current state), not deltas — the latest snapshot
// fully describes the session, so the decode spine merges them last-wins per field.
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

// The CUSTOM event name the widget listens for via useChat({onCustomEvent}).
export const AIDX_USAGE_EVENT = 'aidx-usage'

// Wrap a snapshot as the AG-UI CUSTOM StreamChunk injected into the live chat stream.
export function aguiUsageFor(snapshot: UsageSnapshot): StreamChunk {
  return {type: EventType.CUSTOM, name: AIDX_USAGE_EVENT, value: snapshot}
}

// Context occupancy = the prompt resident in the window this turn (input + cache). Output
// is generation, not occupancy, so it is excluded (shown in the breakdown instead).
// Returns undefined when no token data is present.
export function contextUsedTokens(s: UsageSnapshot): number | undefined {
  const parts = [s.inputTokens, s.cacheReadTokens, s.cacheWriteTokens]
  if (parts.every((p) => p === undefined)) return undefined
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0)
}
